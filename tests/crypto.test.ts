import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/lib/crypto";

const key = () => randomBytes(32).toString("base64");

describe("crypto (AES-256-GCM)", () => {
  it("round-trips plaintext", () => {
    const k = key();
    const token = "1//0gFakeRefreshToken-abc_123";
    expect(decrypt(encrypt(token, k), k)).toBe(token);
  });

  it("produces ciphertext that does not contain the plaintext", () => {
    const k = key();
    const out = encrypt("1//0gFakeRefreshToken", k);
    expect(out.startsWith("v1:")).toBe(true);
    expect(out).not.toContain("1//0gFake");
  });

  it("uses a fresh IV, so equal plaintexts encrypt differently", () => {
    const k = key();
    expect(encrypt("same", k)).not.toBe(encrypt("same", k));
  });

  it("fails to decrypt with the wrong key", () => {
    const encrypted = encrypt("secret", key());
    expect(() => decrypt(encrypted, key())).toThrow();
  });

  it("fails on tampered ciphertext", () => {
    const k = key();
    const encrypted = encrypt("secret", k);
    const payload = Buffer.from(encrypted.slice(3), "base64");
    payload[payload.length - 1] ^= 0x01;
    expect(() => decrypt(`v1:${payload.toString("base64")}`, k)).toThrow();
  });

  it("fails on a tampered auth tag", () => {
    const k = key();
    const payload = Buffer.from(encrypt("secret", k).slice(3), "base64");
    payload[12] ^= 0x01;
    expect(() => decrypt(`v1:${payload.toString("base64")}`, k)).toThrow();
  });

  it("rejects malformed input and bad keys", () => {
    const k = key();
    expect(() => decrypt("nonsense", k)).toThrow();
    expect(() => decrypt("v1:AAAA", k)).toThrow();
    expect(() => encrypt("x", Buffer.from("short").toString("base64"))).toThrow(/32 bytes/);
  });
});
