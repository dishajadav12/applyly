import { describe, expect, it } from "vitest";
import { classify } from "@/lib/extract/classify";
import { normalizeMessage } from "@/lib/extract/normalize";
import { extractRole } from "@/lib/extract/role";

const base = { id: "m", threadId: "t", labelIds: ["INBOX"], receivedAt: "2026-09-15T00:00:00Z", snippet: "", headers: {} };
const ROLE = "Software Engineer I, Entry-Level (Graduation Date: Fall 2026-Summer 2027) - US";

const confirmation = normalizeMessage({
  ...base, from: "no-reply@doordash.com", fromName: "DoorDash", subject: "Thank you for applying to DoorDash",
  text: `Hi Disha,\n\nThank you for applying to DoorDash's ${ROLE} position! We've received your application and will review it as soon as possible!\n\nIn the meantime, feel free to download the DoorDash app.`,
} as never);

const followUp = normalizeMessage({
  ...base, from: "university-recruiting@doordash.com", fromName: "DoorDash University Recruiting", subject: "DoorDash Application Update",
  text: `Hi Disha,\n\nThank you for your interest in the ${ROLE} role at DoorDash. Our team is carefully evaluating each candidate's skills. We appreciate your patience as we go through this process on a rolling basis.\n\nAll the best,\nDoorDash University Recruiting Team`,
} as never);

describe("role + event type for DoorDash-style emails", () => {
  it("extracts the role from 'applying to <Company>'s X position!'", () => {
    expect(extractRole(confirmation).role).toBe(ROLE);
  });
  it("extracts the role from 'interest in the X role at <Company>'", () => {
    expect(extractRole(followUp).role).toBe(ROLE);
  });
  it("treats the in-review follow-up as an update, not a new confirmation", () => {
    expect(classify(followUp, { firstName: "Disha" }).eventType).toBe("other_update");
    expect(classify(confirmation, { firstName: "Disha" }).eventType).toBe("application_confirmation");
  });
});

import { roleSimilarity } from "@/lib/match/similarity";
import { matchEvent } from "@/lib/match/matcher";

describe("role similarity across how companies word the same role", () => {
  it("ignores parenthetical qualifiers, entry-level and location suffixes", () => {
    expect(roleSimilarity(ROLE, "Software Engineer I")).toBe(1);
    expect(roleSimilarity("Software Engineer (REQ-123)", "Software Engineer")).toBe(1);
    expect(roleSimilarity("Software Engineer - Remote", "Software Engineer")).toBe(1);
  });
  it("still keeps genuinely different roles apart", () => {
    expect(roleSimilarity("Software Engineer", "Software Engineer Intern")).toBeLessThan(0.85);
    expect(roleSimilarity("Software Engineer", "Senior Software Engineer")).toBeLessThan(0.85);
    expect(roleSimilarity("Frontend Engineer", "Backend Engineer")).toBeLessThan(0.85);
  });
  it("attaches a rejection naming a shorter title to the long-titled application", () => {
    const res = matchEvent(
      { messageId: "m2", threadId: "t2", eventType: "rejection", companyKey: "doordash", role: "Software Engineer I", userLocked: false },
      { existingEvents: [], applications: [{ id: "a1", companyKey: "doordash", role: ROLE, status: "Applied", reqIds: [] }] },
    );
    expect(res).toMatchObject({ action: "attach", applicationId: "a1", rule: "M3" });
  });
});
