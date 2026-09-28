/**
 * "Open in Gmail" deep link (D16). Gmail doesn't officially support #all/<API id>
 * links, so we search by RFC 822 Message-ID, which is stable. Falls back to
 * #all/<messageId> when the header is missing.
 */
export function gmailMessageUrl(googleEmail: string, rfc822MessageId: string | null | undefined, messageId: string): string {
  const base = `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(googleEmail)}`;
  const id = rfc822MessageId?.trim().replace(/^<|>$/g, "");
  if (!id) return `${base}#all/${encodeURIComponent(messageId)}`;
  return `${base}#search/rfc822msgid:${encodeURIComponent(id)}`;
}
