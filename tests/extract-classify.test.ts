import { describe, expect, it } from "vitest";
import { CLASSIFY_SCORE_THRESHOLD } from "@/lib/config";
import { classify } from "@/lib/extract/classify";
import { normalizeMessage } from "@/lib/extract/normalize";
import type { ParsedMessage } from "@/lib/gmail/mime";

function msg(overrides: Partial<ParsedMessage>): ParsedMessage {
  return {
    messageId: "m1",
    threadId: "t1",
    receivedAt: "2026-05-15T12:00:00.000Z",
    from: "someone@example.com",
    subject: "",
    snippet: "",
    text: "",
    headers: {},
    labelIds: ["INBOX"],
    ...overrides,
  };
}

const norm = (m: ParsedMessage) => normalizeMessage(m);

describe("classify: positive signals", () => {
  it("scores an ATS/assessment sender domain +4", () => {
    const r = classify(norm(msg({ from: "no-reply@greenhouse.io" })));
    expect(r.score).toBe(4);
    expect(r.isJobRelated).toBe(true);
    expect(r.reasons.some((x) => x.includes("+4"))).toBe(true);
  });

  it("scores an application phrase in the subject +3, not both subject and body", () => {
    const r = classify(norm(msg({ subject: "Thank you for applying", text: "thank you for applying too" })));
    expect(r.score).toBe(3);
  });

  it("scores an application phrase in the body +2 when absent from the subject", () => {
    const r = classify(norm(msg({ subject: "Hello", text: "Thank you for applying to our team." })));
    expect(r.score).toBe(2);
    expect(r.isJobRelated).toBe(false); // below threshold on its own
  });

  it("scores a candidate-portal link in the body +2", () => {
    const r = classify(norm(msg({ text: "Check your status at boards.greenhouse.io/candidate/status" })));
    expect(r.score).toBe(2);
  });

  it("scores a human sender's first-name greeting +1, only for a human (non-ATS, non-noreply) sender", () => {
    const human = classify(norm(msg({ from: "jamie@smallco.example", text: "Hi Sam, quick note." })), { firstName: "Sam" });
    expect(human.score).toBe(1);

    const automated = classify(norm(msg({ from: "no-reply@greenhouse.io", text: "Hi Sam, quick note." })), { firstName: "Sam" });
    expect(automated.score).toBe(4); // ATS +4 only; no +1 for the greeting
  });

  it("stacks independent positive signals", () => {
    const r = classify(
      norm(msg({ from: "jamie@smallco.example", subject: "Thank you for applying", text: "Hi Sam, boards.greenhouse.io/candidate" })),
      { firstName: "Sam" },
    );
    expect(r.score).toBe(3 + 2 + 1);
  });
});

describe("classify: negative signals", () => {
  it("requires both List-Unsubscribe and a marketing word for the -4", () => {
    const both = classify(norm(msg({ headers: { "list-unsubscribe": "<mailto:x@y.com>" }, text: "our newsletter this week" })));
    expect(both.score).toBe(-4);

    const onlyHeader = classify(norm(msg({ headers: { "list-unsubscribe": "<mailto:x@y.com>" }, text: "hello there" })));
    expect(onlyHeader.score).toBe(0);

    const onlyWord = classify(norm(msg({ text: "our newsletter this week" })));
    expect(onlyWord.score).toBe(0);
  });

  it("scores a LinkedIn/Indeed job alert -6, gated to those domains", () => {
    const linkedin = classify(norm(msg({ from: "jobalerts-noreply@linkedin.com", text: "New jobs for you this week" })));
    expect(linkedin.score).toBe(-6);

    // Same alert phrase from an unrelated domain isn't scored as a job alert.
    const other = classify(norm(msg({ from: "hello@random.example", text: "New jobs for you this week" })));
    expect(other.score).toBe(0);
  });

  it("scores -10 for a message the user sent, via the SENT label or a matching selfEmail", () => {
    const viaLabel = classify(norm(msg({ from: "me@x.com", labelIds: ["SENT"] })));
    expect(viaLabel.score).toBe(-10);

    const viaSelfEmail = classify(norm(msg({ from: "Me@X.com" })), { selfEmail: "me@x.com" });
    expect(viaSelfEmail.score).toBe(-10);
  });
});

describe("classify: threshold and event type", () => {
  it("is job-related exactly at the threshold, not one below it", () => {
    expect(CLASSIFY_SCORE_THRESHOLD).toBe(3);
    const at = classify(norm(msg({ subject: "Thank you for applying" })));
    expect(at.score).toBe(3);
    expect(at.isJobRelated).toBe(true);

    const below = classify(norm(msg({ text: "Thank you for applying" }))); // body only: +2
    expect(below.isJobRelated).toBe(false);
  });

  it("only computes an event type when job-related", () => {
    const notRelated = classify(norm(msg({ text: "hello" })));
    expect(notRelated.isJobRelated).toBe(false);
    expect(notRelated.eventType).toBeUndefined();
  });

  it("every result carries a non-empty reasons[] trail", () => {
    const r = classify(norm(msg({})));
    expect(r.reasons.length).toBeGreaterThan(0);
  });
});

describe("classify: ATS confirmation without a stock phrase", () => {
  const base = { messageId: "m", threadId: "t", receivedAt: "2026-05-04T00:00:00Z", snippet: "", headers: {}, labelIds: ["INBOX"] };

  it("reads an Ashby 'We Got It!' email as a confirmation, not recruiter outreach from the 'other open roles' footer", () => {
    const r = classify(
      normalizeMessage({
        ...base,
        from: "no-reply@ashbyhq.com",
        subject: "Acme | We Got It! Thank You for Considering a Career With Us !",
        text: "Hi Sam,\n\nWe appreciate the effort you put into applying with us.\n\nVisit Life at Acme for our culture, teams, and other open roles.",
      }),
    );
    expect(r.eventType).toBe("application_confirmation");
  });

  it("never reports recruiter_outreach for an ATS sender", () => {
    const r = classify(
      normalizeMessage({ ...base, from: "no-reply@ashbyhq.com", subject: "Update on your application", text: "Take a look at our open role listings." }),
    );
    expect(r.eventType).not.toBe("recruiter_outreach");
  });
});
