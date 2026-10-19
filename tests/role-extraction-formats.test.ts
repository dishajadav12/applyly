import { expect, it } from "vitest";
import { classify } from "@/lib/extract/classify";
import { extractRole } from "@/lib/extract/role";
import { normalizeMessage } from "@/lib/extract/normalize";

const base = { id: "m", threadId: "t", labelIds: ["INBOX"], receivedAt: "2026-09-15T00:00:00Z", snippet: "", headers: {} };
const cases: [string, string, string, string, string][] = [
  // [expectedRole, from, subject, body, expectedType]
  ["Software Engineer, New Grad", "no-reply@us.greenhouse-mail.io", "Thank you for applying to Stripe", "Hi Disha,\n\nThank you for applying to Stripe for the Software Engineer, New Grad role. We received your application.", "application_confirmation"],
  ["Backend Engineer", "jobs@lever.co", "Thanks for applying to Acme", "Hi Disha,\n\nWe received your application for Backend Engineer at Acme. We'll be in touch.", "application_confirmation"],
  ["Data Analyst", "noreply@myworkday.com", "Thank you for applying to Contoso", "Thank you for applying to Contoso. We have received your application for Data Analyst (REQ-1234).", "application_confirmation"],
  ["Frontend Engineer", "recruiting@acme.com", "Your application to Acme", "Hi Disha, thanks for your application to the Frontend Engineer position at Acme. Our team is reviewing it.", "application_confirmation"],
  ["Software Engineer II", "hr@globex.com", "Update on your application", "Hi Disha,\n\nThank you for your interest in Globex. After careful consideration for the Software Engineer II position, we have decided to move forward with other candidates.", "rejection"],
  ["Machine Learning Engineer", "talent@initech.com", "Your application to Initech", "Hi Disha,\n\nUnfortunately, we will not be moving forward with your application for Machine Learning Engineer.", "rejection"],
  ["Software Engineer, Infrastructure", "careers@umbrella.com", "Application Update: Software Engineer, Infrastructure", "Hi Disha,\n\nThank you for your interest. We have decided not to proceed with your application at this time.", "rejection"],
  ["Full Stack Engineer", "noreply@ashbyhq.com", "Thanks for applying to Hooli!", "Hi Disha,\n\nThanks for applying to the Full Stack Engineer position at Hooli. We'll review your application shortly.", "application_confirmation"],
  ["Product Engineer", "no-reply@jobvite.com", "Application received - Product Engineer", "Hi Disha,\n\nYour application for Product Engineer has been received.", "application_confirmation"],
  ["Software Development Engineer I", "no-reply@amazon.jobs", "Thank you for applying to Amazon", "Dear Disha,\n\nThank you for applying to the Software Development Engineer I position (Job ID: 2812345). We have received your application.", "application_confirmation"],
  ["Software Engineer Intern", "recruiting@vandelay.com", "Next steps for Software Engineer Intern", "Hi Disha,\n\nWe'd like to invite you to complete an online assessment for the Software Engineer Intern role.", "assessment"],
  ["Platform Engineer", "recruiter@pied.com", "Interview invitation - Platform Engineer at Pied Piper", "Hi Disha,\n\nWe'd like to schedule an interview for the Platform Engineer role.", "interview_invite"],
  ["Software Engineer", "noreply@gusto.com", "Your application to Gusto", "Hi Disha,\n\nThanks for applying to Gusto! You applied for Software Engineer on Sep 3. We're reviewing applications.", "application_confirmation"],
  ["Associate Software Engineer", "no-reply@smartrecruiters.com", "Thank you for your application to Visa", "Hi Disha, your application for the position of Associate Software Engineer was received.", "application_confirmation"],
  ["Software Engineer 1", "notifications@icims.com", "Thank you for applying - Software Engineer 1 (Job 12345)", "Thank you for your interest in the Software Engineer 1 position. Your application has been received.", "application_confirmation"],
  ["Software Engineer", "careers@wayne.com", "We received your application", "Hi Disha,\n\nWe've received your application to Wayne Enterprises for the role of Software Engineer.", "application_confirmation"],
];
it("extracts role and event type across common ATS email formats", () => {
  const out: string[] = [];
  for (const [role, from, subject, text, type] of cases) {
    const m = normalizeMessage({ ...base, from, fromName: "", subject, text } as never);
    const c = classify(m, { firstName: "Disha" });
    const r = extractRole(m).role;
    const ok = r === role && c.eventType === type;
    out.push(`${ok ? "OK  " : "FAIL"} role=${JSON.stringify(r)} (want ${JSON.stringify(role)}) type=${c.eventType} (want ${type}) job=${c.isJobRelated}`);
  }
  expect(out.filter((l) => l.startsWith("FAIL")).join("\n")).toBe("");
});
