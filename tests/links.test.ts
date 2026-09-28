import { describe, expect, it } from "vitest";
import { gmailMessageUrl } from "@/lib/gmail/links";

describe("gmailMessageUrl (D16)", () => {
  it("links by URL-encoded rfc822msgid search", () => {
    expect(gmailMessageUrl("fake.user@gmail.com", "CAF=abc+123@mail.gmail.com", "18c0ffee")).toBe(
      "https://mail.google.com/mail/u/?authuser=fake.user%40gmail.com#search/rfc822msgid:CAF%3Dabc%2B123%40mail.gmail.com",
    );
  });

  it("strips angle brackets from the Message-ID", () => {
    expect(gmailMessageUrl("a@b.com", "<abc@x.com>", "m1")).toContain("rfc822msgid:abc%40x.com");
  });

  it("falls back to #all/<messageId> when the header is missing or blank", () => {
    const expected = "https://mail.google.com/mail/u/?authuser=a%40b.com#all/18c0ffee";
    expect(gmailMessageUrl("a@b.com", undefined, "18c0ffee")).toBe(expected);
    expect(gmailMessageUrl("a@b.com", null, "18c0ffee")).toBe(expected);
    expect(gmailMessageUrl("a@b.com", "  ", "18c0ffee")).toBe(expected);
  });
});
