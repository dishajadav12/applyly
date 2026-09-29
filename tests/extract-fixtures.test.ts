import { describe, expect, it } from "vitest";
import { extractFromMessage, type ExtractionResult } from "@/lib/extract";
import { loadFixtures } from "./helpers/fixtures";

const fixtures = loadFixtures();

describe("extraction fixtures", () => {
  it("has at least 25 fixtures", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(25);
  });

  it.each(fixtures.map((f) => [`${f.file}: ${f.description}`, f] as const))("%s", (_name, fixture) => {
    const result = extractFromMessage(fixture.input, fixture.context);

    for (const [key, expectedValue] of Object.entries(fixture.expected)) {
      const actual = result[key as keyof ExtractionResult];
      if (expectedValue === null) {
        expect(actual, `${fixture.file}: expected "${key}" to be undefined`).toBeUndefined();
      } else {
        expect(actual, `${fixture.file}: "${key}" mismatch`).toEqual(expectedValue);
      }
    }

    // Every result has a non-empty, human-readable trail of reasons.
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons.every((r) => typeof r === "string" && r.length > 0)).toBe(true);
  });
});
