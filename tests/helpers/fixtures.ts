import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { ClassifyContext } from "@/lib/extract";
import type { ParsedMessage } from "@/lib/gmail/mime";

export type Fixture = {
  file: string;
  description: string;
  input: ParsedMessage;
  context: ClassifyContext;
  /** Raw JSON: null means "expect undefined" (JSON has no undefined). */
  expected: Record<string, unknown>;
};

const FIXTURES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");

export function loadFixtures(): Fixture[] {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => {
      const raw = JSON.parse(readFileSync(path.join(FIXTURES_DIR, file), "utf8"));
      const input: ParsedMessage = {
        messageId: raw.input.messageId ?? `msg-${file}`,
        threadId: raw.input.threadId ?? `thread-${file}`,
        rfc822MessageId: raw.input.rfc822MessageId,
        receivedAt: raw.input.receivedAt ?? "2026-05-15T12:00:00.000Z",
        from: raw.input.from,
        fromName: raw.input.fromName,
        replyTo: raw.input.replyTo,
        subject: raw.input.subject ?? "",
        snippet: raw.input.snippet ?? "",
        text: raw.input.text ?? "",
        headers: raw.input.headers ?? {},
        labelIds: raw.input.labelIds ?? ["INBOX"],
      };
      return {
        file,
        description: raw.description ?? file,
        input,
        context: raw.context ?? {},
        expected: raw.expected ?? {},
      };
    });
}
