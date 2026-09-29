import { describe, expect, it } from "vitest";
import { roleSimilarity } from "@/lib/match/similarity";

describe("roleSimilarity", () => {
  it("is 1 for identical roles", () => {
    expect(roleSimilarity("Software Engineer", "Software Engineer")).toBe(1);
  });

  it("ignores case", () => {
    expect(roleSimilarity("Software Engineer", "SOFTWARE ENGINEER")).toBe(1);
  });

  it("ignores new grad / 2027 / entry level / early career / university / I", () => {
    expect(roleSimilarity("Software Engineer, New Grad 2027", "Software Engineer")).toBe(1);
    expect(roleSimilarity("Software Engineer I", "Software Engineer")).toBe(1);
    expect(roleSimilarity("Entry Level Data Analyst", "Data Analyst")).toBe(1);
    expect(roleSimilarity("Early Career Data Analyst", "University Data Analyst")).toBe(1);
  });

  it("does not strip 'i' out of unrelated words", () => {
    // If "i" were substring-removed instead of token-removed, "Engineering" would be mangled.
    expect(roleSimilarity("Backend Engineering", "Backend Engineering")).toBe(1);
  });

  it("is 0 for completely different roles", () => {
    expect(roleSimilarity("Software Engineer", "Product Manager")).toBe(0);
  });

  it("is well below the 0.85 threshold for related but distinct roles", () => {
    expect(roleSimilarity("Frontend Engineer", "Backend Engineer")).toBeLessThan(0.85);
  });

  it("is above the 0.85 threshold for near-duplicate phrasing", () => {
    expect(roleSimilarity("Site Reliability Engineer", "Site Reliability Engineer, New Grad 2027")).toBeGreaterThanOrEqual(0.85);
  });

  it("treats two noise-only roles as identical, and a noise-only role as unrelated to a real one", () => {
    expect(roleSimilarity("New Grad 2027", "New Grad")).toBe(1);
    expect(roleSimilarity("New Grad 2027", "Software Engineer")).toBe(0);
  });
});
