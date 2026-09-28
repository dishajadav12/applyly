import { describe, expect, it } from "vitest";
import { resolveRange } from "@/lib/ranges";

const now = new Date(2026, 8, 28, 10, 0, 0);

describe("resolveRange", () => {
  it("resolves relative presets ending now", () => {
    expect(resolveRange("24h", now).start).toEqual(new Date(2026, 8, 27, 10, 0, 0));
    expect(resolveRange("7d", now).start).toEqual(new Date(2026, 8, 21, 10, 0, 0));
    expect(resolveRange("2m", now).start).toEqual(new Date(2026, 6, 28, 10, 0, 0));
    expect(resolveRange("3m", now).end).toEqual(now);
  });

  it("'since' starts May 1, 2026 local midnight", () => {
    expect(resolveRange("since", now).start).toEqual(new Date(2026, 4, 1));
  });

  it("custom ranges are inclusive of the end day and validated", () => {
    const r = resolveRange("custom", now, { start: "2026-06-01", end: "2026-06-30" });
    expect(r.start).toEqual(new Date(2026, 5, 1, 0, 0, 0, 0));
    expect(r.end).toEqual(new Date(2026, 5, 30, 23, 59, 59, 999));
    expect(() => resolveRange("custom", now)).toThrow();
    expect(() => resolveRange("custom", now, { start: "2026-07-01", end: "2026-06-01" })).toThrow();
  });
});
