import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { requireEnv } from "./env";

// AES-256-GCM. Stored format: "v1:" + base64(iv[12] | authTag[16] | ciphertext).
const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function loadKey(keyBase64?: string): Buffer {
  const key = Buffer.from(keyBase64 ?? requireEnv("TOKEN_ENCRYPTION_KEY"), "base64");
  if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
  return key;
}

/** `keyBase64` overrides TOKEN_ENCRYPTION_KEY (used by tests). */
export function encrypt(plaintext: string, keyBase64?: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", loadKey(keyBase64), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  return `${VERSION}:${payload.toString("base64")}`;
}

/** Throws if the key is wrong or the ciphertext was tampered with. */
export function decrypt(encoded: string, keyBase64?: string): string {
  const [version, body] = encoded.split(":");
  if (version !== VERSION || !body) throw new Error("Unsupported ciphertext format");
  const payload = Buffer.from(body, "base64");
  if (payload.length < IV_BYTES + TAG_BYTES) throw new Error("Ciphertext too short");
  const iv = payload.subarray(0, IV_BYTES);
  const tag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = payload.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", loadKey(keyBase64), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
