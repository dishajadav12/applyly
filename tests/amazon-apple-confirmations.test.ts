import { describe, expect, it } from "vitest";
import { extractFromMessage } from "@/lib/extract";
import type { ParsedMessage } from "@/lib/gmail/mime";

const base = { messageId: "m1", threadId: "t1", receivedAt: "2026-10-19T19:23:00.000Z", html: undefined, headers: {}, labelIds: ["INBOX"] };

const amazon = {
  ...base,
  from: "noreply@mail.amazon.jobs",
  fromName: "Amazon.jobs",
  subject: "Keep track of your application",
  snippet: "Thank you for your interest in Software Development Engineer, Early Career - 2027 (US) (ID: 10583340).",
  text: "Hi Jane,\nThank you for your interest in Software Development Engineer, Early Career - 2027 (US) (ID: 10583340).\n\nIf you have completed the application:\nGreat! You can now check the application status here.\n\nBest regards,\nAmazon Recruiting Team\n\nAmazon is an equal opportunity employer.",
} as unknown as ParsedMessage;

const apple = {
  ...base,
  from: "appleworldwiderecruiting@email.apple.com",
  fromName: "Apple Worldwide Recruiting",
  subject: "Thanks for your interest in Apple.",
  snippet: "We just received your resume for the following role",
  text: "Hi Jane,\n\nWe just received your resume for the following role: Software Engineer, IS&T Early Career Opportunities 200689349. Thanks for thinking of us.\n\nRegards,\nApple Worldwide Recruiting",
} as unknown as ParsedMessage;

describe("Amazon / Apple confirmations", () => {
  it("Amazon: company is Amazon (not the job title), role and req id are found", () => {
    const r = extractFromMessage(amazon, { firstName: "Jane" });
    expect(r.isJobRelated).toBe(true);
    expect(r.company).toBe("Amazon");
    expect(r.role).toBe("Software Development Engineer, Early Career - 2027 (US)");
    expect(r.reqId).toBe("ID: 10583340");
  });

  it("Amazon: link annotations from html-to-text and a leading 'the' never end up in the role", () => {
    const linked = {
      ...amazon,
      text: amazon.text.replace(
        "Early Career - 2027 (US) (ID",
        "Early Career - 2027 (US) [https://amazon.jobs/en/jobs/10583340/software-development-engineer-early-career-2027-us] (ID",
      ),
    } as ParsedMessage;
    expect(extractFromMessage(linked, { firstName: "Jane" }).role).toBe("Software Development Engineer, Early Career - 2027 (US)");

    const confirmation = {
      ...amazon,
      subject: "Thank you for Applying to Amazon!",
      text: "Hi Jane,\nThank you for applying to Amazon. We have received your application for the Software Development Engineer role.",
    } as ParsedMessage;
    expect(extractFromMessage(confirmation, { firstName: "Jane" }).role).toBe("Software Development Engineer");
  });

  it("Apple: company, role and req id are found", () => {
    const r = extractFromMessage(apple, { firstName: "Jane" });
    expect(r.company).toBe("Apple");
    expect(r.role).toBe("Software Engineer, IS&T Early Career Opportunities");
    expect(r.reqId).toBe("200689349");
  });
});
