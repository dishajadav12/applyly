import { convert } from "html-to-text";
import { MAX_BODY_BYTES } from "@/lib/config";

// --- Gmail API message shape (only the parts we read) -----------------------------

export type GmailHeader = { name: string; value: string };

export type GmailPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
};

export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
};

// --- Output -------------------------------------------------------------------------

/**
 * A parsed message, held in memory only. `text` is the (truncated) body and must
 * never be persisted; only IDs, subject, sender, snippet and extracted fields are stored.
 */
export type ParsedMessage = {
  messageId: string;
  threadId: string;
  /** RFC 822 Message-ID header without angle brackets (D16), if present. */
  rfc822MessageId?: string;
  /** ISO timestamp from Gmail's internalDate. */
  receivedAt: string;
  /** Sender address, lowercased. */
  from: string;
  fromName?: string;
  /** Reply-To address, lowercased, if present. */
  replyTo?: string;
  subject: string;
  snippet: string;
  text: string;
  /** Whitelisted headers, lowercase names. */
  headers: Record<string, string>;
  /** Gmail labels, e.g. "SENT", "INBOX". */
  labelIds: string[];
};

/** Headers kept on ParsedMessage; extraction only needs these. */
const KEPT_HEADERS = [
  "from",
  "sender",
  "reply-to",
  "message-id",
  "in-reply-to",
  "date",
  "list-unsubscribe",
  "list-id",
  "precedence",
  "auto-submitted",
];

// --- Helpers ------------------------------------------------------------------------

export function getHeader(headers: GmailHeader[] | undefined, name: string): string | undefined {
  const lower = name.toLowerCase();
  return headers?.find((h) => h.name.toLowerCase() === lower)?.value;
}

/** Parses `"Name" <a@b.com>`, `Name <a@b.com>` or `a@b.com`. */
export function parseAddress(value: string | undefined): { email: string; name?: string } | undefined {
  if (!value) return undefined;
  const angle = value.match(/^\s*(.*?)\s*<([^<>]+)>/);
  const email = (angle ? angle[2] : value.match(/[^\s<>"',;]+@[^\s<>"',;]+/)?.[0])?.trim().toLowerCase();
  if (!email || !email.includes("@")) return undefined;
  const name = angle?.[1]?.replace(/^["']|["']$/g, "").trim();
  return { email, name: name || undefined };
}

function decodeBase64Url(data: string, charset?: string): string {
  const bytes = Buffer.from(data, "base64url");
  try {
    return new TextDecoder(charset ?? "utf-8").decode(bytes);
  } catch {
    return bytes.toString("utf8"); // unknown charset label
  }
}

function charsetOf(part: GmailPart): string | undefined {
  return getHeader(part.headers, "content-type")?.match(/charset="?([\w-]+)"?/i)?.[1];
}

/** Cap on raw HTML before conversion, so a huge marketing email can't stall parsing. */
const MAX_HTML_CHARS = 500_000;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// --- Body extraction ---------------------------------------------------------------

/** True for real attachments: never read or fetched. */
function isAttachment(part: GmailPart): boolean {
  if (part.filename) return true;
  if (/attachment/i.test(getHeader(part.headers, "content-disposition") ?? "")) return true;
  return Boolean(part.body?.attachmentId) && !part.body?.data;
}

/** Walks nested multipart trees, collecting inline text/plain and text/html bodies in order. */
function collectBodies(part: GmailPart, out: { plain: string[]; html: string[] }): void {
  if (part.parts?.length) {
    for (const child of part.parts) collectBodies(child, out);
    return;
  }
  if (isAttachment(part) || !part.body?.data) return;
  const mime = (part.mimeType ?? "").toLowerCase();
  if (mime === "text/plain") out.plain.push(decodeBase64Url(part.body.data, charsetOf(part)));
  else if (mime === "text/html") out.html.push(decodeBase64Url(part.body.data, charsetOf(part)));
}

function htmlToPlain(html: string): string {
  return convert(html.slice(0, MAX_HTML_CHARS), {
    wordwrap: false,
    selectors: [
      // html-to-text uppercases headings/table headers by default; that would mangle company and role names.
      ...["h1", "h2", "h3", "h4", "h5", "h6"].map((selector) => ({ selector, options: { uppercase: false } })),
      // Emails use tables for layout: render every row and cell as its own line so neighboring cells never run together.
      ...["table", "tr", "td", "th"].map((selector) => ({ selector, format: "block" })),
      { selector: "img", format: "skip" },
      { selector: "style", format: "skip" },
      { selector: "script", format: "skip" },
      { selector: "a", options: { hideLinkHrefIfSameAsText: true, ignoreHref: false } },
    ],
  });
}

/** Prefers text/plain; falls back to HTML converted with html-to-text. */
export function extractBodyText(payload: GmailPart | undefined): string {
  if (!payload) return "";
  const bodies = { plain: [] as string[], html: [] as string[] };
  collectBodies(payload, bodies);
  const plain = bodies.plain.join("\n").trim();
  if (plain) return plain;
  return htmlToPlain(bodies.html.join("\n")).trim();
}

// --- Normalization ------------------------------------------------------------------

const QUOTE_START = [
  /^On .{3,300}wrote:\s*$/i, // Gmail / Apple Mail: "On Mon, Jan 5, 2026 at 9:00 AM X <x@y> wrote:"
  /^-{2,}\s*Original Message\s*-{2,}\s*$/i,
  /^-{2,}\s*Forwarded message\s*-{2,}\s*$/i,
  /^_{5,}\s*$/, // Outlook divider
];

/** Removes quoted reply history ("On … wrote:", "> quoted", Outlook headers). */
export function stripQuotedReplies(text: string): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hasContent = kept.some((l) => l.trim() !== "");

    const trimmed = line.trim();
    // "On … wrote:" may wrap onto two lines.
    const wrapped =
      /^On /i.test(trimmed) &&
      !/wrote:\s*$/i.test(trimmed) &&
      /wrote:\s*$/i.test(`${trimmed} ${lines[i + 1]?.trim() ?? ""}`);
    if (hasContent && (QUOTE_START.some((re) => re.test(trimmed)) || wrapped)) break;
    // Outlook: "From: …" followed shortly by "Sent:" / "Date:".
    if (hasContent && /^From:\s/i.test(line) && lines.slice(i + 1, i + 4).some((l) => /^(Sent|Date):\s/i.test(l))) break;

    if (line.trimStart().startsWith(">")) continue;
    kept.push(line);
  }

  return kept.join("\n");
}

function tidy(text: string): string {
  return text
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Truncates to `maxBytes` of UTF-8 without leaving a broken trailing character. */
export function truncateBytes(text: string, maxBytes: number = MAX_BODY_BYTES): string {
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length <= maxBytes) return text;
  return bytes.subarray(0, maxBytes).toString("utf8").replace(/�+$/, "");
}

// --- Entry point --------------------------------------------------------------------

export function parseMessage(message: GmailMessage): ParsedMessage {
  const headerList = message.payload?.headers;

  const fromAddr = parseAddress(getHeader(headerList, "from"));
  const replyTo = parseAddress(getHeader(headerList, "reply-to"))?.email;
  const rfc822 = getHeader(headerList, "message-id")?.trim().replace(/^<|>$/g, "");

  const headers: Record<string, string> = {};
  for (const name of KEPT_HEADERS) {
    const value = getHeader(headerList, name);
    if (value !== undefined) headers[name] = value;
  }

  const text = truncateBytes(tidy(stripQuotedReplies(extractBodyText(message.payload))));

  return {
    messageId: message.id,
    threadId: message.threadId,
    rfc822MessageId: rfc822 || undefined,
    receivedAt: new Date(Number(message.internalDate ?? 0)).toISOString(),
    from: fromAddr?.email ?? "",
    fromName: fromAddr?.name,
    replyTo,
    subject: getHeader(headerList, "subject")?.trim() ?? "",
    snippet: decodeEntities(message.snippet ?? ""),
    text,
    headers,
    labelIds: message.labelIds ?? [],
  };
}
