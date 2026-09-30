import { describe, expect, it } from "vitest";
import {
  CLASSIFY_SCORE_THRESHOLD,
  PARSER_VERSION,
  Q1_DOMAINS,
  Q2_EXCLUDED_SENDERS,
} from "@/lib/config";

describe("config", () => {
  it("exposes the baseline parser version and threshold", () => {
    expect(PARSER_VERSION).toBe(2);
    expect(CLASSIFY_SCORE_THRESHOLD).toBe(3);
  });

  it("has Q1 domains and Q2 exclusions", () => {
    expect(Q1_DOMAINS).toContain("greenhouse.io");
    expect(Q1_DOMAINS).toContain("hackerrank.com");
    expect(Q2_EXCLUDED_SENDERS).toContain("substack.com");
  });
});
