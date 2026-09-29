/**
 * One test per named scenario in docs/prompts/phase-07-matching.md, combining matcher.ts
 * and derive.ts the way the scan pipeline (Phase 8) will: matchEvent() decides where an
 * event lands, then derive() recomputes the resulting application(s) from their linked events.
 */
import { describe, expect, it } from "vitest";
import { derive, type DeriveEvent } from "@/lib/match/derive";
import { matchEvent, type MatchApplicationSummary, type MatchExistingEvent, type MatchInputEvent } from "@/lib/match/matcher";

type SimApp = { id: string; companyKey: string; linkedEvents: DeriveEvent[] };

/** A tiny in-memory store so each scenario reads like the real pipeline: process events one at a time. */
class Store {
  apps = new Map<string, SimApp>();
  events: MatchExistingEvent[] = [];
  private nextId = 1;

  private summaries(): MatchApplicationSummary[] {
    return [...this.apps.values()].map((a) => {
      const d = derive(a.linkedEvents);
      return { id: a.id, companyKey: a.companyKey, role: d.role ?? "Unknown", status: d.status ?? "Applied", reqIds: d.reqIds ?? [] };
    });
  }

  /** Processes one event through the matcher, then updates the store exactly like a scan step would. */
  process(input: MatchInputEvent, deriveInput: DeriveEvent): ReturnType<typeof matchEvent> {
    const result = matchEvent(input, { existingEvents: this.events, applications: this.summaries() });

    if (result.action === "attach") {
      this.apps.get(result.applicationId!)!.linkedEvents.push(deriveInput);
    } else if (result.action === "create") {
      const id = `app-${this.nextId++}`;
      this.apps.set(id, { id, companyKey: input.companyKey!, linkedEvents: [deriveInput] });
    }
    // "review" creates no application and links no event.

    if (result.action !== "review") {
      this.events.push({ messageId: input.messageId, threadId: input.threadId, state: "linked", applicationId: this.appIdFor(input, result) });
    }
    return result;
  }

  private appIdFor(input: MatchInputEvent, result: ReturnType<typeof matchEvent>): string {
    if (result.action === "attach") return result.applicationId!;
    // action === "create": the just-created app is keyed by this event's companyKey and is the newest one for it.
    const created = [...this.apps.values()].filter((a) => a.companyKey === input.companyKey);
    return created[created.length - 1]!.id;
  }

  derived(appId: string) {
    return derive(this.apps.get(appId)!.linkedEvents);
  }

  get applicationCount(): number {
    return this.apps.size;
  }
}

function input(overrides: Partial<MatchInputEvent>): MatchInputEvent {
  return { messageId: "m", threadId: "t", eventType: "application_confirmation", userLocked: false, ...overrides };
}

function derivable(overrides: Partial<DeriveEvent>): DeriveEvent {
  return { messageId: "m", threadId: "t", eventType: "application_confirmation", receivedAt: "2026-05-01T00:00:00Z", state: "linked", ...overrides };
}

describe("Example Corp: confirmation, then assessment, then interview", () => {
  it("becomes one application, Interviewing, applied May 15 (explicit)", () => {
    const store = new Store();
    store.process(
      input({ messageId: "m1", threadId: "t1", companyKey: "examplecorp", role: "Software Engineer" }),
      derivable({ messageId: "m1", threadId: "t1", eventType: "application_confirmation", role: "Software Engineer", receivedAt: "2026-05-15T00:00:00Z" }),
    );
    store.process(
      input({ messageId: "m2", threadId: "t2", eventType: "assessment", companyKey: "examplecorp", role: "Software Engineer" }),
      derivable({ messageId: "m2", threadId: "t2", eventType: "assessment", role: "Software Engineer", receivedAt: "2026-06-20T00:00:00Z" }),
    );
    store.process(
      input({ messageId: "m3", threadId: "t3", eventType: "interview_invite", companyKey: "examplecorp", role: "Software Engineer" }),
      derivable({ messageId: "m3", threadId: "t3", eventType: "interview_invite", role: "Software Engineer", receivedAt: "2026-07-03T00:00:00Z" }),
    );

    expect(store.applicationCount).toBe(1);
    const app = [...store.apps.values()][0]!;
    const derived = store.derived(app.id);
    expect(derived.status).toBe("Interviewing");
    expect(derived.appliedAt).toBe("2026-05-15T00:00:00Z");
    expect(derived.appliedDateSource).toBe("explicit");
  });
});

describe("Google with 3 different roles", () => {
  it("becomes 3 applications", () => {
    const store = new Store();
    for (const [i, role] of ["Software Engineer", "Product Manager", "Data Scientist"].entries()) {
      store.process(
        input({ messageId: `m${i}`, threadId: `t${i}`, companyKey: "google", role }),
        derivable({ messageId: `m${i}`, threadId: `t${i}`, role }),
      );
    }
    expect(store.applicationCount).toBe(3);
  });
});

describe("Role-less rejection", () => {
  it("attaches when the company has exactly one application", () => {
    const store = new Store();
    store.process(input({ messageId: "m1", threadId: "t1", companyKey: "acme", role: "Software Engineer" }), derivable({ messageId: "m1", threadId: "t1", role: "Software Engineer" }));
    const result = store.process(input({ messageId: "m2", threadId: "t2", companyKey: "acme", eventType: "rejection", role: undefined }), derivable({ messageId: "m2", threadId: "t2", eventType: "rejection" }));
    expect(result.action).toBe("attach");
    expect(store.applicationCount).toBe(1);
  });

  it("goes to review when the company has two applications", () => {
    const store = new Store();
    store.process(input({ messageId: "m1", threadId: "t1", companyKey: "acme", role: "Software Engineer" }), derivable({ messageId: "m1", threadId: "t1", role: "Software Engineer" }));
    store.process(input({ messageId: "m2", threadId: "t2", companyKey: "acme", role: "Product Manager" }), derivable({ messageId: "m2", threadId: "t2", role: "Product Manager" }));
    const result = store.process(input({ messageId: "m3", threadId: "t3", companyKey: "acme", eventType: "rejection", role: undefined }), derivable({ messageId: "m3", threadId: "t3", eventType: "rejection" }));
    expect(result).toMatchObject({ action: "review", rule: "M5" });
    expect(store.applicationCount).toBe(2);
  });
});

describe("Third-party assessment platform naming the company", () => {
  it("attaches (sender domain, e.g. hackerrank.com, is ignored for matching)", () => {
    const store = new Store();
    store.process(input({ messageId: "m1", threadId: "t1", companyKey: "acme", role: "Backend Engineer" }), derivable({ messageId: "m1", threadId: "t1", role: "Backend Engineer" }));
    // The HackerRank email's sender is hackerrank.com; only its extracted company/role matter.
    const result = store.process(
      input({ messageId: "m2", threadId: "t2", eventType: "assessment", companyKey: "acme", role: "Backend Engineer" }),
      derivable({ messageId: "m2", threadId: "t2", eventType: "assessment", role: "Backend Engineer" }),
    );
    expect(result.action).toBe("attach");
    expect(store.applicationCount).toBe(1);
  });
});

describe("Rejection processed before confirmation", () => {
  it("still ends as 1 application with the correct role (via M3b) and an explicit applied date", () => {
    const store = new Store();
    // The rejection is fetched/processed first even though the confirmation happened earlier.
    store.process(
      input({ messageId: "m-rej", threadId: "t-rej", companyKey: "acme", eventType: "rejection", role: undefined }),
      derivable({ messageId: "m-rej", threadId: "t-rej", eventType: "rejection", receivedAt: "2026-06-01T00:00:00Z" }),
    );
    const confirm = store.process(
      input({ messageId: "m-conf", threadId: "t-conf", companyKey: "acme", eventType: "application_confirmation", role: "Software Engineer" }),
      derivable({ messageId: "m-conf", threadId: "t-conf", eventType: "application_confirmation", role: "Software Engineer", receivedAt: "2026-05-15T00:00:00Z" }),
    );

    expect(confirm).toMatchObject({ action: "attach", rule: "M3b" });
    expect(store.applicationCount).toBe(1);
    const derived = store.derived([...store.apps.keys()][0]!);
    expect(derived.role).toBe("Software Engineer");
    expect(derived.appliedAt).toBe("2026-05-15T00:00:00Z");
    expect(derived.appliedDateSource).toBe("explicit");
    expect(derived.status).toBe("Rejected");
  });
});

describe("Recruiter email after an interview", () => {
  it("does not downgrade the status", () => {
    const events = [
      derivable({ messageId: "m1", eventType: "interview_invite", receivedAt: "2026-05-10T00:00:00Z" }),
      derivable({ messageId: "m2", eventType: "recruiter_outreach", receivedAt: "2026-05-20T00:00:00Z", recruiterEmail: "a@agency.example" }),
    ];
    expect(derive(events).status).toBe("Interviewing");
  });
});

describe("Overridden status", () => {
  it("is unchanged by derive regardless of the events", () => {
    const events = [derivable({ eventType: "rejection" })];
    const result = derive(events, { status: true });
    expect(result).not.toHaveProperty("status");
  });
});

describe("Reversed input order", () => {
  it("gives identical derived output to forward order", () => {
    const events = [
      derivable({ messageId: "m1", eventType: "application_confirmation", role: "Software Engineer", receivedAt: "2026-05-01T00:00:00Z" }),
      derivable({ messageId: "m2", eventType: "assessment", receivedAt: "2026-05-10T00:00:00Z" }),
      derivable({ messageId: "m3", eventType: "interview_invite", receivedAt: "2026-05-20T00:00:00Z" }),
    ];
    expect(derive([...events].reverse())).toEqual(derive(events));
  });
});

describe("A confirmation dated after a rejection", () => {
  it("keeps the application Rejected", () => {
    const events = [
      derivable({ messageId: "m1", eventType: "rejection", receivedAt: "2026-05-10T00:00:00Z" }),
      derivable({ messageId: "m2", eventType: "application_confirmation", receivedAt: "2026-05-20T00:00:00Z" }),
    ];
    expect(derive(events).status).toBe("Rejected");
  });
});

describe("An interview invite after a rejection", () => {
  it("reopens the application (Interviewing)", () => {
    const events = [
      derivable({ messageId: "m1", eventType: "rejection", receivedAt: "2026-05-10T00:00:00Z" }),
      derivable({ messageId: "m2", eventType: "interview_invite", receivedAt: "2026-05-20T00:00:00Z" }),
    ];
    expect(derive(events).status).toBe("Interviewing");
  });
});

describe("Role-less rejection for a company whose only application is Rejected", () => {
  it("attaches via M4b", () => {
    const result = matchEvent(
      input({ companyKey: "acme", eventType: "rejection", role: undefined }),
      { existingEvents: [], applications: [{ id: "app-1", companyKey: "acme", role: "Software Engineer", status: "Rejected", reqIds: [] }] },
    );
    expect(result).toMatchObject({ action: "attach", applicationId: "app-1", rule: "M4b" });
  });
});

describe("Role-less assessment for that same company", () => {
  it("goes to review via M5, not M4b (not a rejection/withdrawal/other_update follow-up)", () => {
    const result = matchEvent(
      input({ companyKey: "acme", eventType: "assessment", role: undefined }),
      { existingEvents: [], applications: [{ id: "app-1", companyKey: "acme", role: "Software Engineer", status: "Rejected", reqIds: [] }] },
    );
    expect(result).toMatchObject({ action: "review", rule: "M5" });
  });
});
