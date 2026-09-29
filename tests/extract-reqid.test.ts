import { describe, expect, it } from "vitest";
import { extractReqId } from "@/lib/extract/reqId";
import { normalizeMessage } from "@/lib/extract/normalize";

function msg(text: string, subject = "") {
  return normalizeMessage({
    messageId: "m1",
    threadId: "t1",
    receivedAt: "2026-05-15T12:00:00.000Z",
    from: "hr@acme.example",
    subject,
    snippet: "",
    text,
    headers: {},
    labelIds: ["INBOX"],
  });
}

describe("extractReqId", () => {
  it.each([
    ["R-12345", "Reference R-12345 for this role."],
    ["R1234", "Reference R1234 for this role."],
    ["JR123456", "Requisition JR123456 is open."],
    ["Req ID: 98765", "Please cite Req ID: 98765 in replies."],
    ["Job ID: ABC-123", "See Job ID: ABC-123 for details."],
    ["gh_jid=4567890", "https://boards.greenhouse.io/acme/jobs/1?gh_jid=4567890"],
    ["550e8400-e29b-41d4-a716-446655440000", "https://jobs.lever.co/acme/550e8400-e29b-41d4-a716-446655440000"],
  ])("matches %s", (expected, text) => {
    expect(extractReqId(msg(text)).reqId).toBe(expected);
  });

  it("tries the subject before the body", () => {
    expect(extractReqId(msg("no id here", "Req ID: 111")).reqId).toBe("Req ID: 111");
  });

  it("returns undefined with a reason when nothing matches", () => {
    const result = extractReqId(msg("no identifiers in this email at all"));
    expect(result.reqId).toBeUndefined();
    expect(result.reasons.at(-1)).toMatch(/no req id pattern/);
  });
});
