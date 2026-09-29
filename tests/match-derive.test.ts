import { describe, expect, it } from "vitest";
import { derive, type DeriveEvent } from "@/lib/match/derive";

function ev(overrides: Partial<DeriveEvent>): DeriveEvent {
  return { messageId: "m1", threadId: "t1", eventType: "application_confirmation", receivedAt: "2026-05-15T00:00:00.000Z", state: "linked", ...overrides };
}

describe("derive: applied_at / source", () => {
  it("uses the earliest confirmation, source explicit", () => {
    const result = derive([
      ev({ messageId: "m1", eventType: "application_confirmation", receivedAt: "2026-05-20T00:00:00Z" }),
      ev({ messageId: "m2", eventType: "application_confirmation", receivedAt: "2026-05-15T00:00:00Z" }),
      ev({ messageId: "m3", eventType: "assessment", receivedAt: "2026-05-01T00:00:00Z" }),
    ]);
    expect(result.appliedAt).toBe("2026-05-15T00:00:00Z");
    expect(result.appliedDateSource).toBe("explicit");
  });

  it("falls back to the earliest event when there is no confirmation, source inferred", () => {
    const result = derive([
      ev({ messageId: "m1", eventType: "recruiter_outreach", receivedAt: "2026-05-20T00:00:00Z" }),
      ev({ messageId: "m2", eventType: "assessment", receivedAt: "2026-05-10T00:00:00Z" }),
    ]);
    expect(result.appliedAt).toBe("2026-05-10T00:00:00Z");
    expect(result.appliedDateSource).toBe("inferred");
  });

  it("is undefined when there are no linked events", () => {
    expect(derive([]).appliedAt).toBeUndefined();
  });

  it("ignores non-linked events entirely", () => {
    const result = derive([
      ev({ messageId: "m1", eventType: "application_confirmation", receivedAt: "2026-05-01T00:00:00Z", state: "review" }),
      ev({ messageId: "m2", eventType: "application_confirmation", receivedAt: "2026-05-15T00:00:00Z", state: "linked" }),
    ]);
    expect(result.appliedAt).toBe("2026-05-15T00:00:00Z");
  });
});

describe("derive: role", () => {
  it("prefers a confirmation email's role over a more specific one from elsewhere", () => {
    const result = derive([
      ev({ messageId: "m1", eventType: "application_confirmation", role: "Software Engineer" }),
      ev({ messageId: "m2", eventType: "assessment", role: "Senior Backend Software Engineer" }),
    ]);
    expect(result.role).toBe("Software Engineer");
  });

  it("picks the most specific (most words) role when there's no confirmation role", () => {
    const result = derive([
      ev({ messageId: "m1", eventType: "recruiter_outreach", role: "Engineer" }),
      ev({ messageId: "m2", eventType: "assessment", role: "Senior Backend Engineer" }),
    ]);
    expect(result.role).toBe("Senior Backend Engineer");
  });

  it("defaults to Unknown when no event has a role", () => {
    expect(derive([ev({ role: undefined })]).role).toBe("Unknown");
  });
});

describe("derive: status", () => {
  it("Applied is the baseline for a lone confirmation", () => {
    expect(derive([ev({ eventType: "application_confirmation" })]).status).toBe("Applied");
  });

  it("uses the highest-ranked stage seen when the latest stage event isn't terminal", () => {
    const result = derive([
      ev({ messageId: "m1", eventType: "application_confirmation", receivedAt: "2026-05-01T00:00:00Z" }),
      ev({ messageId: "m2", eventType: "assessment", receivedAt: "2026-05-10T00:00:00Z" }),
      ev({ messageId: "m3", eventType: "interview_invite", receivedAt: "2026-05-20T00:00:00Z" }),
    ]);
    expect(result.status).toBe("Interviewing");
  });

  it("recruiter_outreach contributes Recruiter Contacted, but never downgrades a higher stage", () => {
    const contacted = derive([ev({ messageId: "m1", eventType: "recruiter_outreach" })]);
    expect(contacted.status).toBe("Recruiter Contacted");

    const notDowngraded = derive([
      ev({ messageId: "m1", eventType: "interview_invite", receivedAt: "2026-05-10T00:00:00Z" }),
      ev({ messageId: "m2", eventType: "recruiter_outreach", receivedAt: "2026-05-20T00:00:00Z" }),
    ]);
    expect(notDowngraded.status).toBe("Interviewing");
  });

  it("a terminal stage event sets the terminal status", () => {
    expect(derive([ev({ eventType: "offer" })]).status).toBe("Offer");
    expect(derive([ev({ eventType: "rejection" })]).status).toBe("Rejected");
    expect(derive([ev({ eventType: "withdrawal" })]).status).toBe("Withdrawn");
  });

  it("a later non-stage email never reopens a closed application", () => {
    const result = derive([
      ev({ messageId: "m1", eventType: "rejection", receivedAt: "2026-05-10T00:00:00Z" }),
      ev({ messageId: "m2", eventType: "application_confirmation", receivedAt: "2026-05-20T00:00:00Z" }),
      ev({ messageId: "m3", eventType: "recruiter_outreach", receivedAt: "2026-05-25T00:00:00Z" }),
    ]);
    expect(result.status).toBe("Rejected");
  });

  it("a later STAGE event reopens a closed application", () => {
    const result = derive([
      ev({ messageId: "m1", eventType: "rejection", receivedAt: "2026-05-10T00:00:00Z" }),
      ev({ messageId: "m2", eventType: "interview_invite", receivedAt: "2026-05-20T00:00:00Z" }),
    ]);
    expect(result.status).toBe("Interviewing");
  });
});

describe("derive: recruiters", () => {
  it("keeps every recruiter seen, and picks the latest as primary", () => {
    const result = derive([
      ev({ messageId: "m1", eventType: "recruiter_outreach", recruiterEmail: "a@agency.example", recruiterName: "A", receivedAt: "2026-05-01T00:00:00Z" }),
      ev({ messageId: "m2", eventType: "recruiter_outreach", recruiterEmail: "b@agency.example", recruiterName: "B", receivedAt: "2026-05-10T00:00:00Z" }),
    ]);
    expect(result.recruiters).toEqual([
      { email: "a@agency.example", name: "A", lastSeen: "2026-05-01T00:00:00Z" },
      { email: "b@agency.example", name: "B", lastSeen: "2026-05-10T00:00:00Z" },
    ]);
    expect(result.primaryRecruiterEmail).toBe("b@agency.example");
  });

  it("updates lastSeen when the same recruiter is seen again later", () => {
    const result = derive([
      ev({ messageId: "m1", recruiterEmail: "a@agency.example", receivedAt: "2026-05-01T00:00:00Z" }),
      ev({ messageId: "m2", recruiterEmail: "a@agency.example", receivedAt: "2026-05-10T00:00:00Z" }),
    ]);
    expect(result.recruiters).toHaveLength(1);
    expect(result.recruiters?.[0]?.lastSeen).toBe("2026-05-10T00:00:00Z");
  });
});

describe("derive: thread_ids / req_ids", () => {
  it("collects unique, sorted thread and req ids", () => {
    const result = derive([
      ev({ messageId: "m1", threadId: "t2", reqId: "R-2" }),
      ev({ messageId: "m2", threadId: "t1", reqId: "R-1" }),
      ev({ messageId: "m3", threadId: "t1", reqId: undefined }),
    ]);
    expect(result.threadIds).toEqual(["t1", "t2"]);
    expect(result.reqIds).toEqual(["R-1", "R-2"]);
  });
});

describe("derive: overrides", () => {
  it("never includes a field named in overrides", () => {
    const events = [ev({ eventType: "rejection", role: "Software Engineer", recruiterEmail: "a@agency.example" })];

    expect(derive(events, { role: true })).not.toHaveProperty("role");
    expect(derive(events, { status: true })).not.toHaveProperty("status");
    expect(derive(events, { appliedAt: true })).not.toHaveProperty("appliedAt");
    expect(derive(events, { appliedAt: true })).not.toHaveProperty("appliedDateSource");
    expect(derive(events, { recruiterEmail: true })).not.toHaveProperty("primaryRecruiterEmail");

    // recruiters[]/threadIds/reqIds aren't user-editable fields, so they're always present.
    expect(derive(events, { role: true, status: true, appliedAt: true, recruiterEmail: true })).toHaveProperty("recruiters");
  });

  it("with no overrides, includes every field", () => {
    const result = derive([ev({})]);
    expect(Object.keys(result).sort()).toEqual(
      ["appliedAt", "appliedDateSource", "primaryRecruiterEmail", "recruiters", "reqIds", "role", "status", "threadIds"].sort(),
    );
  });
});

describe("derive: order independence", () => {
  it("reversed and shuffled input order produce identical output", () => {
    const events = [
      ev({ messageId: "m1", eventType: "application_confirmation", role: "Software Engineer", receivedAt: "2026-05-01T00:00:00Z", recruiterEmail: "a@agency.example", recruiterName: "A" }),
      ev({ messageId: "m2", eventType: "assessment", receivedAt: "2026-05-05T00:00:00Z", reqId: "R-1" }),
      ev({ messageId: "m3", eventType: "recruiter_outreach", receivedAt: "2026-05-08T00:00:00Z", recruiterEmail: "b@agency.example", recruiterName: "B" }),
      ev({ messageId: "m4", eventType: "interview_invite", receivedAt: "2026-05-12T00:00:00Z" }),
      ev({ messageId: "m5", eventType: "rejection", receivedAt: "2026-05-20T00:00:00Z" }),
    ];
    const forward = derive(events);
    const reversed = derive([...events].reverse());
    const shuffled = derive([events[3]!, events[0]!, events[4]!, events[1]!, events[2]!]);

    expect(reversed).toEqual(forward);
    expect(shuffled).toEqual(forward);
  });

  it("breaks same-timestamp ties the same way regardless of input order", () => {
    const tied = [
      ev({ messageId: "m2", eventType: "recruiter_outreach", recruiterEmail: "b@agency.example", receivedAt: "2026-05-01T00:00:00Z" }),
      ev({ messageId: "m1", eventType: "recruiter_outreach", recruiterEmail: "a@agency.example", receivedAt: "2026-05-01T00:00:00Z" }),
    ];
    expect(derive(tied)).toEqual(derive([...tied].reverse()));
  });
});
