import { describe, expect, it } from "vitest";
import { matchEvent, type MatchApplicationSummary, type MatchContext, type MatchInputEvent } from "@/lib/match/matcher";

function event(overrides: Partial<MatchInputEvent> = {}): MatchInputEvent {
  return {
    messageId: "m-new",
    threadId: "t-new",
    eventType: "application_confirmation",
    companyKey: "acme",
    userLocked: false,
    ...overrides,
  };
}

function app(overrides: Partial<MatchApplicationSummary>): MatchApplicationSummary {
  return { id: "app-1", companyKey: "acme", role: "Unknown", status: "Applied", reqIds: [], ...overrides };
}

function ctx(overrides: Partial<MatchContext> = {}): MatchContext {
  return { existingEvents: [], applications: [], ...overrides };
}

describe("matchEvent: guard", () => {
  it("throws for a user_locked event", () => {
    expect(() => matchEvent(event({ userLocked: true }), ctx())).toThrow(/user_locked/);
  });
});

describe("matchEvent: M1 (same thread)", () => {
  it("attaches to the application of a linked event on the same thread, confidence 1.00", () => {
    const result = matchEvent(
      event({ threadId: "t1" }),
      ctx({ existingEvents: [{ messageId: "m1", threadId: "t1", state: "linked", applicationId: "app-9" }] }),
    );
    expect(result).toMatchObject({ action: "attach", applicationId: "app-9", matchConfidence: 1.0, rule: "M1" });
  });

  it("ignores a same-thread event that isn't linked", () => {
    const result = matchEvent(
      event({ threadId: "t1", companyKey: undefined }),
      ctx({ existingEvents: [{ messageId: "m1", threadId: "t1", state: "review", applicationId: "app-9" }] }),
    );
    expect(result.rule).toBe("M8"); // falls through to company-unknown
  });

  it("ignores itself (same messageId) so reprocessing doesn't match on its own prior row", () => {
    const result = matchEvent(
      event({ messageId: "m1", threadId: "t1", companyKey: undefined }),
      ctx({ existingEvents: [{ messageId: "m1", threadId: "t1", state: "linked", applicationId: "app-9" }] }),
    );
    expect(result.rule).toBe("M8");
  });
});

describe("matchEvent: M2 (same req_id)", () => {
  it("attaches to the application with a matching req_id, confidence 0.95", () => {
    const result = matchEvent(
      event({ reqId: "R-1234", companyKey: undefined }),
      ctx({ applications: [app({ id: "app-2", reqIds: ["R-1234"] })] }),
    );
    expect(result).toMatchObject({ action: "attach", applicationId: "app-2", matchConfidence: 0.95, rule: "M2" });
  });

  it("takes priority over M1's absence and over company-based rules", () => {
    const result = matchEvent(
      event({ reqId: "R-1234", companyKey: "acme" }),
      ctx({ applications: [app({ id: "app-2", reqIds: ["R-1234"] }), app({ id: "app-3", companyKey: "acme" })] }),
    );
    expect(result.rule).toBe("M2");
    expect(result.applicationId).toBe("app-2");
  });
});

describe("matchEvent: M3 / M3b / M6 (event has a role)", () => {
  it("M3: attaches on role similarity >= 0.85, confidence 0.90", () => {
    const result = matchEvent(
      event({ role: "Software Engineer, New Grad 2027" }),
      ctx({ applications: [app({ id: "app-1", role: "Software Engineer" })] }),
    );
    expect(result).toMatchObject({ action: "attach", applicationId: "app-1", matchConfidence: 0.9, rule: "M3" });
  });

  it("M3: picks the best-matching application when several exist", () => {
    const result = matchEvent(
      event({ role: "Backend Engineer" }),
      ctx({
        applications: [app({ id: "app-fe", role: "Frontend Engineer" }), app({ id: "app-be", role: "Backend Engineer" })],
      }),
    );
    expect(result.applicationId).toBe("app-be");
  });

  it("M3b: attaches when the company's only application has role Unknown, confidence 0.80", () => {
    const result = matchEvent(event({ role: "Data Analyst" }), ctx({ applications: [app({ id: "app-1", role: "Unknown" })] }));
    expect(result).toMatchObject({ action: "attach", applicationId: "app-1", matchConfidence: 0.8, rule: "M3b" });
  });

  it("M6: creates when the role matches no existing application and there is more than one Unknown app", () => {
    const result = matchEvent(
      event({ role: "Data Analyst" }),
      ctx({ applications: [app({ id: "app-1", role: "Unknown" }), app({ id: "app-2", role: "Unknown" })] }),
    );
    expect(result).toMatchObject({ action: "create", rule: "M6" });
  });

  it("M6: creates when the role matches no existing named-role application", () => {
    const result = matchEvent(
      event({ role: "Product Manager" }),
      ctx({ applications: [app({ id: "app-1", role: "Software Engineer" })] }),
    );
    expect(result).toMatchObject({ action: "create", rule: "M6" });
  });
});

describe("matchEvent: M4 / M4b / M5 (event has no role)", () => {
  it("M4: attaches to the company's only non-terminal application, confidence 0.75", () => {
    const result = matchEvent(event({ role: undefined }), ctx({ applications: [app({ id: "app-1", status: "Interviewing" })] }));
    expect(result).toMatchObject({ action: "attach", applicationId: "app-1", matchConfidence: 0.75, rule: "M4" });
  });

  it("M4 doesn't care how many terminal applications also exist", () => {
    const result = matchEvent(
      event({ role: undefined }),
      ctx({ applications: [app({ id: "app-open", status: "Applied" }), app({ id: "app-closed", status: "Rejected" })] }),
    );
    expect(result).toMatchObject({ action: "attach", applicationId: "app-open", rule: "M4" });
  });

  it("M4b: attaches a roleless rejection/withdrawal/other_update to the only (terminal) application, confidence 0.70", () => {
    for (const eventType of ["rejection", "withdrawal", "other_update"] as const) {
      const result = matchEvent(event({ role: undefined, eventType }), ctx({ applications: [app({ id: "app-1", status: "Rejected" })] }));
      expect(result).toMatchObject({ action: "attach", applicationId: "app-1", matchConfidence: 0.7, rule: "M4b" });
    }
  });

  it("M5: a roleless follow-up email is ambiguous when there are several non-terminal applications", () => {
    const result = matchEvent(
      event({ role: undefined }),
      ctx({ applications: [app({ id: "app-1", status: "Applied" }), app({ id: "app-2", status: "Interviewing" })] }),
    );
    expect(result).toMatchObject({ action: "review", matchConfidence: 0.4, rule: "M5" });
  });

  it("M5: a roleless NEW-STAGE email for a company whose only application is closed goes to review, not M4b", () => {
    const result = matchEvent(
      event({ role: undefined, eventType: "assessment" }),
      ctx({ applications: [app({ id: "app-1", status: "Rejected" })] }),
    );
    expect(result).toMatchObject({ action: "review", matchConfidence: 0.4, rule: "M5" });
  });

  it("M5: several closed applications and no open one is also ambiguous", () => {
    const result = matchEvent(
      event({ role: undefined, eventType: "rejection" }),
      ctx({ applications: [app({ id: "app-1", status: "Rejected" }), app({ id: "app-2", status: "Withdrawn" })] }),
    );
    expect(result).toMatchObject({ action: "review", rule: "M5" });
  });
});

describe("matchEvent: M7 / M8", () => {
  it("M7: creates when no application exists yet for the company", () => {
    expect(matchEvent(event({ companyKey: "brandnew" }), ctx())).toMatchObject({ action: "create", rule: "M7" });
  });

  it("M8: reviews when the company is unknown, even with a role present", () => {
    expect(matchEvent(event({ companyKey: undefined, role: "Software Engineer" }), ctx())).toMatchObject({
      action: "review",
      rule: "M8",
    });
  });
});

describe("matchEvent: sender domain is never used as a signal", () => {
  it("a third-party assessment-platform event matches on company/role/thread like any other event", () => {
    // The matcher never sees a "from" address at all — this documents that HackerRank/CodeSignal
    // etc. emails are matched purely on the company extracted from their content (A8).
    const result = matchEvent(
      event({ eventType: "assessment", companyKey: "acme", role: "Backend Engineer" }),
      ctx({ applications: [app({ id: "app-1", role: "Backend Engineer" })] }),
    );
    expect(result).toMatchObject({ action: "attach", applicationId: "app-1", rule: "M3" });
  });
});

describe("matchEvent: M3c (role named in subject/snippet)", () => {
  const apps = [
    app({ id: "app-1", role: "Software Engineer Intern" }),
    app({ id: "app-2", role: "Data Scientist" }),
  ];

  it("attaches a roleless event to the one application whose role the text names, confidence 0.65", () => {
    const result = matchEvent(
      event({ eventType: "rejection", text: "Update on your Data Scientist application at Acme" }),
      ctx({ applications: apps }),
    );
    expect(result).toMatchObject({ action: "attach", applicationId: "app-2", matchConfidence: 0.65, rule: "M3c" });
  });

  it("prefers the most specific role when one role's tokens contain another's", () => {
    const result = matchEvent(
      event({ eventType: "rejection", text: "Your Software Engineer Intern application" }),
      ctx({ applications: [app({ id: "app-1", role: "Software Engineer Intern" }), app({ id: "app-3", role: "Software Engineer" })] }),
    );
    expect(result).toMatchObject({ applicationId: "app-1", rule: "M3c" });
  });

  it("still reviews when the text names no role, or two equally specific roles", () => {
    expect(matchEvent(event({ eventType: "rejection", text: "Thanks for applying" }), ctx({ applications: apps })).action).toBe("review");
    expect(
      matchEvent(event({ eventType: "rejection", text: "Data Scientist or Backend Engineer" }), ctx({ applications: [...apps, app({ id: "app-4", role: "Backend Engineer" })] })).action,
    ).toBe("review");
  });
});
