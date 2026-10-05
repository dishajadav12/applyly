import { describe, expect, it } from "vitest";
import { extractOutreach, splitAddressList } from "@/lib/extract/outreach";
import { buildSentQuery } from "@/lib/gmail/query";
import { parseMessage } from "@/lib/gmail/mime";
import { groupOutreachByCompany, outreachEmailsByCompanyKey, type OutreachRow } from "@/lib/outreach";
import { H, message, textPart } from "./helpers/gmail";

const sent = (to: string, labelIds = ["SENT"]) =>
  parseMessage(message(textPart("Hi, I'd love to chat about the role."), [H("From", "Me <me@gmail.com>"), H("To", to), H("Subject", "Application")], { labelIds }));

describe("extractOutreach", () => {
  it("names the company from a corporate recipient domain", () => {
    const r = extractOutreach(sent('"Jane Fake" <Jane.Fake@acme-corp.co.uk>'), "me@gmail.com");
    expect(r.recipients).toEqual([{ email: "jane.fake@acme-corp.co.uk", name: "Jane Fake", company: "Acme Corp", companyKey: "acme" }]);
  });

  it("uses the registrable domain and the alias map", () => {
    const r = extractOutreach(sent("Sam <sam@mail.stripe.com>, ana@datadoghq.com"), "me@gmail.com");
    expect(r.recipients.map((x) => [x.email, x.company])).toEqual([["sam@mail.stripe.com", "Stripe"], ["ana@datadoghq.com", "Datadog"]]);
  });

  it("skips freemail, noreply, ATS, self and duplicate recipients", () => {
    const r = extractOutreach(sent("a@gmail.com, noreply@acme.com, x@greenhouse.io, me@gmail.com, b@acme.com, B@acme.com"), "me@gmail.com");
    expect(r.recipients.map((x) => x.email)).toEqual(["b@acme.com"]);
  });

  it("ignores messages that are not sent mail", () => {
    expect(extractOutreach(sent("b@acme.com", ["INBOX"]), "me@gmail.com").recipients).toEqual([]);
  });
});

describe("splitAddressList", () => {
  it("does not split on commas inside quoted names", () => {
    expect(splitAddressList('"Fake, Jane" <j@a.com>, k@b.com')).toEqual(['"Fake, Jane" <j@a.com>', "k@b.com"]);
  });
});

describe("buildSentQuery", () => {
  it("restricts to sent mail inside the range", () => {
    const q = buildSentQuery(new Date(Date.UTC(2026, 4, 1)), new Date(Date.UTC(2026, 5, 1)));
    expect(q).toMatch(/^in:sent \(/);
    expect(q).toContain("after:1777593600 before:1780272000");
  });
});

const row = (o: Partial<OutreachRow>): OutreachRow => ({
  message_id: "m1",
  to_email: "a@acme.com",
  to_name: null,
  rfc822_message_id: null,
  company: "Acme",
  company_key: "acme",
  subject: "Hello",
  sent_at: "2026-06-01T00:00:00Z",
  ...o,
});

describe("groupOutreachByCompany", () => {
  const rows = [
    row({ message_id: "m1" }),
    row({ message_id: "m2", to_email: "b@acme.com", to_name: "Bea", sent_at: "2026-06-05T00:00:00Z" }),
    row({ message_id: "m2", to_email: "a@acme.com", to_name: "Al", sent_at: "2026-06-05T00:00:00Z" }),
    row({ message_id: "m3", company: "Zed", company_key: "zed", to_email: "z@zed.com", sent_at: "2026-07-01T00:00:00Z" }),
  ];

  it("makes one row per company with every mail, newest company first", () => {
    const g = groupOutreachByCompany(rows);
    expect(g.map((x) => x.company)).toEqual(["Zed", "Acme"]);
    const acme = g[1];
    expect(acme.mails.map((m) => m.messageId)).toEqual(["m2", "m1"]);
    expect(acme.mails[0].toEmails.sort()).toEqual(["a@acme.com", "b@acme.com"]);
    expect(acme.contacts.map((c) => c.email).sort()).toEqual(["a@acme.com", "b@acme.com"]);
    expect(acme.contacts.find((c) => c.email === "a@acme.com")?.name).toBe("Al");
  });

  it("maps company_key to emails for the dashboard", () => {
    expect(Object.keys(outreachEmailsByCompanyKey(rows)).sort()).toEqual(["acme", "zed"]);
  });
});
