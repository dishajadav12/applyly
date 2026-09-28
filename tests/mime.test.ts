import { describe, expect, it } from "vitest";
import { MAX_BODY_BYTES } from "@/lib/config";
import { extractBodyText, parseAddress, parseMessage, stripQuotedReplies, truncateBytes } from "@/lib/gmail/mime";
import { attachmentPart, b64, H, htmlPart, message, multipart, textPart } from "./helpers/gmail";

const headers = [
  H("From", '"Acme Recruiting" <Recruiting@Acme.example>'),
  H("Reply-To", "Jamie Fake <jamie.fake@acme.example>"),
  H("Subject", "  Your application to Acme  "),
  H("Message-ID", "<CAF=abc123@mail.acme.example>"),
  H("List-Unsubscribe", "<mailto:unsub@acme.example>"),
  H("X-Secret-Internal", "should-not-be-kept"),
];

describe("parseMessage", () => {
  it("returns the full ParsedMessage shape", () => {
    const parsed = parseMessage(message(textPart("Hi Sam,\nThanks for applying."), headers, { snippet: "It&#39;s a &amp; b" }));

    expect(parsed).toEqual({
      messageId: "msg1",
      threadId: "thread1",
      rfc822MessageId: "CAF=abc123@mail.acme.example",
      receivedAt: "2026-05-15T12:00:00.000Z",
      from: "recruiting@acme.example",
      fromName: "Acme Recruiting",
      replyTo: "jamie.fake@acme.example",
      subject: "Your application to Acme",
      snippet: "It's a & b",
      text: "Hi Sam,\nThanks for applying.",
      headers: {
        from: '"Acme Recruiting" <Recruiting@Acme.example>',
        "reply-to": "Jamie Fake <jamie.fake@acme.example>",
        "message-id": "<CAF=abc123@mail.acme.example>",
        "list-unsubscribe": "<mailto:unsub@acme.example>",
      },
      labelIds: ["INBOX"],
    });
  });

  it("leaves optional fields undefined when headers are missing", () => {
    const parsed = parseMessage(message(textPart("body"), [H("From", "bare@x.example")]));
    expect(parsed.rfc822MessageId).toBeUndefined();
    expect(parsed.replyTo).toBeUndefined();
    expect(parsed.fromName).toBeUndefined();
    expect(parsed.subject).toBe("");
    expect(parsed.from).toBe("bare@x.example");
  });
});

describe("body extraction", () => {
  it("prefers text/plain in multipart/alternative", () => {
    const payload = multipart("multipart/alternative", [textPart("plain version"), htmlPart("<p>html version</p>")]);
    expect(extractBodyText(payload)).toBe("plain version");
  });

  it("falls back to html-to-text when there is no text/plain", () => {
    const html = "<html><head><style>p{color:red}</style></head><body><h1>Hello</h1><p>We received <b>your application</b>.</p><img src='x.png'></body></html>";
    const text = extractBodyText(multipart("multipart/alternative", [htmlPart(html)]));
    expect(text).toContain("Hello"); // headings keep their case
    expect(text).toContain("We received your application.");
    expect(text).not.toContain("color:red");
    expect(text).not.toContain("<");
  });

  it("keeps table cells apart so neighboring values never run together", () => {
    const html = "<table><tr><th>Role</th><th>Status</th></tr><tr><td>Software Engineer</td><td>Received</td></tr></table>";
    const text = extractBodyText(htmlPart(html));
    expect(text).toContain("Role");
    expect(text).toContain("Software Engineer\n");
    expect(text).not.toContain("EngineerReceived");
  });

  it("keeps link targets so candidate-portal links can be detected", () => {
    const text = extractBodyText(htmlPart('<a href="https://acme.wd5.myworkdayjobs.com/en-US/careers">View your application</a>'));
    expect(text).toContain("myworkdayjobs.com");
  });

  it("walks deeply nested multipart trees", () => {
    const payload = multipart("multipart/mixed", [
      multipart("multipart/related", [multipart("multipart/alternative", [textPart("deep plain"), htmlPart("<p>deep html</p>")])]),
    ]);
    expect(extractBodyText(payload)).toBe("deep plain");
  });

  it("ignores attachments and never reads their data", () => {
    const withData = { ...textPart("SECRET ATTACHMENT TEXT"), filename: "notes.txt" };
    const payload = multipart("multipart/mixed", [textPart("real body"), attachmentPart("resume.pdf"), withData]);
    const text = extractBodyText(payload);
    expect(text).toBe("real body");
    expect(text).not.toContain("SECRET");
  });

  it("ignores parts marked Content-Disposition: attachment", () => {
    const attached = textPart("attached text", { headers: [H("Content-Disposition", 'attachment; filename="a.txt"')] });
    expect(extractBodyText(multipart("multipart/mixed", [attached, textPart("inline text")]))).toBe("inline text");
  });

  it("decodes base64url with non-ASCII text and declared charsets", () => {
    expect(extractBodyText(textPart("Café ✓ – ok"))).toBe("Café ✓ – ok");

    const latin1 = Buffer.from("Caf\xe9", "latin1").toString("base64url");
    const part = { mimeType: "text/plain", headers: [H("Content-Type", 'text/plain; charset="iso-8859-1"')], body: { data: latin1 } };
    expect(extractBodyText(part)).toBe("Café");
  });

  it("survives an unknown charset label", () => {
    const part = { mimeType: "text/plain", headers: [H("Content-Type", "text/plain; charset=not-a-charset")], body: { data: b64("hello") } };
    expect(extractBodyText(part)).toBe("hello");
  });

  it("returns empty text for messages with no body", () => {
    expect(extractBodyText(undefined)).toBe("");
    expect(parseMessage({ id: "x", threadId: "y" }).text).toBe("");
  });
});

describe("stripQuotedReplies", () => {
  it("cuts at 'On … wrote:' and drops > quotes", () => {
    const text = "Thanks, I can do Tuesday.\n\nOn Mon, May 4, 2026 at 9:00 AM Jamie Fake <jamie@acme.example> wrote:\n> Are you free?\n> Thanks";
    expect(stripQuotedReplies(text)).toBe("Thanks, I can do Tuesday.\n");
  });

  it("handles 'On … wrote:' wrapped over two lines", () => {
    const text = "Sounds good.\nOn Mon, May 4, 2026 at 9:00 AM Jamie Fake <jamie@acme.example>\nwrote:\nold text";
    expect(stripQuotedReplies(text)).toBe("Sounds good.");
  });

  it("cuts Outlook-style headers and original-message markers", () => {
    expect(stripQuotedReplies("Reply here\n\nFrom: Jamie <j@acme.example>\nSent: Monday\nTo: me\nold")).toBe("Reply here\n");
    expect(stripQuotedReplies("Reply\n-----Original Message-----\nold")).toBe("Reply");
  });

  it("does not cut when the marker is the first thing in the email", () => {
    const text = "From: Acme HR\nSent: Monday\nWelcome aboard";
    expect(stripQuotedReplies(text)).toBe(text);
  });

  it("leaves ordinary text alone", () => {
    expect(stripQuotedReplies("On behalf of the team, we wrote to you.\nBye")).toBe("On behalf of the team, we wrote to you.\nBye");
  });

  it("is applied by parseMessage", () => {
    const body = "Yes!\nOn Tue, Jun 2, 2026, Jamie <j@acme.example> wrote:\n> quoted";
    expect(parseMessage(message(textPart(body), headers)).text).toBe("Yes!");
  });
});

describe("truncation", () => {
  it("truncates the body to 15 KB", () => {
    const parsed = parseMessage(message(textPart("a".repeat(40_000)), headers));
    expect(Buffer.byteLength(parsed.text)).toBe(MAX_BODY_BYTES);
    expect(MAX_BODY_BYTES).toBe(15 * 1024);
  });

  it("never leaves a broken multi-byte character at the cut", () => {
    const out = truncateBytes("é".repeat(10), 5); // 2 bytes each: cut lands mid-character
    expect(out).toBe("éé");
    expect(out).not.toContain("�");
    expect(truncateBytes("short", 100)).toBe("short");
  });
});

describe("parseAddress", () => {
  it.each([
    ['"Last, First" <a@b.example>', { email: "a@b.example", name: "Last, First" }],
    ["Name <A@B.Example>", { email: "a@b.example", name: "Name" }],
    ["plain@b.example", { email: "plain@b.example", name: undefined }],
    ["<only@b.example>", { email: "only@b.example", name: undefined }],
  ])("%s", (input, expected) => expect(parseAddress(input)).toEqual(expected));

  it("returns undefined for junk", () => {
    expect(parseAddress("no address here")).toBeUndefined();
    expect(parseAddress(undefined)).toBeUndefined();
  });
});
