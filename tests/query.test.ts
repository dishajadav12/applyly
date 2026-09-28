import { describe, expect, it, vi } from "vitest";
import { ASSESSMENT_DOMAINS, ATS_DOMAINS, Q2_EXCLUDED_SENDERS, Q2_PHRASES } from "@/lib/config";
import { registrableDomain, topDomains } from "@/lib/gmail/domains";
import { buildQueries, listMessageIds } from "@/lib/gmail/query";

const start = new Date("2026-05-01T00:00:00Z");
const end = new Date("2026-05-08T12:30:45.999Z");
const suffix = `after:${Math.floor(start.getTime() / 1000)} before:${Math.floor(end.getTime() / 1000)} -in:chats -in:spam -in:trash`;

describe("buildQueries", () => {
  const q = buildQueries(start, end);

  it("appends epoch-second filters and exclusions to every query", () => {
    for (const query of Object.values(q)) expect(query.endsWith(suffix)).toBe(true);
    expect(suffix).toMatch(/^after:\d{10} before:\d{10} /); // seconds, not ms
  });

  it("Q1 is the ATS + assessment sender list, in A6 order", () => {
    expect(q.q1).toBe(`from:(${[...ATS_DOMAINS, ...ASSESSMENT_DOMAINS].join(" OR ")}) ${suffix}`);
    expect(q.q1.startsWith("from:(greenhouse.io OR greenhouse-mail.io OR lever.co OR myworkday.com")).toBe(true);
    expect(q.q1).toContain("OR hackerrank.com");
    expect(q.q1).toContain("OR goodtime.io)");
  });

  it("Q2 is quoted phrases + subject:interview, excluding noise senders", () => {
    expect(q.q2.startsWith('("thank you for applying" OR "thanks for applying"')).toBe(true);
    for (const phrase of Q2_PHRASES) expect(q.q2).toContain(`"${phrase}"`);
    expect(q.q2).toContain("OR subject:interview)");
    expect(q.q2).toContain(`-from:(${Q2_EXCLUDED_SENDERS.join(" OR ")})`);
    expect(q.q2).toContain("-from:(substack.com OR medium.com OR beehiiv.com OR mailchimpapp.net");
    // bare single words are deliberately absent
    expect(q.q2).not.toMatch(/OR "?(recruiter|next steps|new grad)"? /);
    expect(q.q2).not.toMatch(/OR interview /);
  });

  it("Q3 is LinkedIn/Indeed confirmations", () => {
    expect(q.q3).toBe(`from:(jobs-noreply@linkedin.com OR indeed.com OR indeedapply) subject:(application OR applied) ${suffix}`);
  });
});

describe("listMessageIds", () => {
  it("follows nextPageToken and requests maxResults=500", async () => {
    const getJson = vi
      .fn()
      .mockResolvedValueOnce({ messages: [{ id: "a", threadId: "t" }, { id: "b", threadId: "t" }], nextPageToken: "P2" })
      .mockResolvedValueOnce({ messages: [{ id: "c", threadId: "t" }], nextPageToken: "P3" })
      .mockResolvedValueOnce({}); // last page: no messages key at all

    const ids = await listMessageIds({ getJson }, "some query");

    expect(ids).toEqual(["a", "b", "c"]);
    expect(getJson).toHaveBeenCalledTimes(3);
    expect(getJson.mock.calls[0]).toEqual(["/users/me/messages", { q: "some query", maxResults: 500, pageToken: undefined }]);
    expect(getJson.mock.calls[1][1]).toMatchObject({ pageToken: "P2", maxResults: 500 });
    expect(getJson.mock.calls[2][1]).toMatchObject({ pageToken: "P3" });
  });

  it("returns an empty list when nothing matches", async () => {
    expect(await listMessageIds({ getJson: vi.fn().mockResolvedValue({}) }, "q")).toEqual([]);
  });
});

describe("domains", () => {
  it("groups subdomains under the registrable domain", () => {
    expect(registrableDomain("Jobs <no-reply@us.greenhouse-mail.io>".replace(/.*</, "").replace(">", ""))).toBe("greenhouse-mail.io");
    expect(registrableDomain("a@mail.linkedin.com")).toBe("linkedin.com");
    expect(registrableDomain("a@jobs.example.co.uk")).toBe("example.co.uk");
    expect(registrableDomain("localhost")).toBeUndefined();
  });

  it("ranks and limits top domains", () => {
    const top = topDomains(["b.com", "a.com", "b.com", undefined, "c.com", "a.com", "b.com"], 2);
    expect(top).toEqual([
      { domain: "b.com", count: 3 },
      { domain: "a.com", count: 2 },
    ]);
  });
});
