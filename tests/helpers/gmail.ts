import type { GmailHeader, GmailMessage, GmailPart } from "@/lib/gmail/mime";

/** base64url-encodes text the way the Gmail API returns body data. */
export const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64url");

export const textPart = (text: string, extra: Partial<GmailPart> = {}): GmailPart => ({
  mimeType: "text/plain",
  body: { size: text.length, data: b64(text) },
  ...extra,
});

export const htmlPart = (html: string, extra: Partial<GmailPart> = {}): GmailPart => ({
  mimeType: "text/html",
  body: { size: html.length, data: b64(html) },
  ...extra,
});

export const multipart = (mimeType: string, parts: GmailPart[]): GmailPart => ({ mimeType, parts });

export const attachmentPart = (filename: string): GmailPart => ({
  mimeType: "application/pdf",
  filename,
  body: { size: 12345, attachmentId: "ATTACH_ID_SHOULD_NEVER_BE_FETCHED" },
});

export function message(payload: GmailPart, headers: GmailHeader[] = [], extra: Partial<GmailMessage> = {}): GmailMessage {
  return {
    id: "msg1",
    threadId: "thread1",
    labelIds: ["INBOX"],
    snippet: "Thanks for applying",
    internalDate: String(Date.UTC(2026, 4, 15, 12, 0, 0)),
    payload: { ...payload, headers: [...(payload.headers ?? []), ...headers] },
    ...extra,
  };
}

export const H = (name: string, value: string): GmailHeader => ({ name, value });
