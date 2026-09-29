import { describe, expect, it } from "vitest";
import { normalizeMessage, stripFooters } from "@/lib/extract/normalize";

describe("stripFooters", () => {
  it("removes common footer lines", () => {
    const text = "Real content here.\n\nSent from my iPhone\nUnsubscribe\nView this email in your browser";
    expect(stripFooters(text)).toBe("Real content here.");
  });

  it("removes an unsubscribe/preferences footer without touching real content", () => {
    const text = "Thanks for applying.\n\nManage your email preferences\nYou're receiving this email because you applied.";
    expect(stripFooters(text)).toBe("Thanks for applying.");
  });

  it("leaves ordinary text alone", () => {
    const text = "Hi Sam,\n\nThanks for applying to Acme. We'll follow up soon.";
    expect(stripFooters(text)).toBe(text);
  });

  it("is applied by normalizeMessage", () => {
    const parsed = { text: "Body.\nSent from my Android", from: "" } as never;
    expect(normalizeMessage(parsed).text).toBe("Body.");
  });
});
