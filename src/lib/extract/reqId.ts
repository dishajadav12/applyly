import { REQ_ID_PATTERNS } from "@/lib/config";
import type { NormalizedMessage } from "./normalize";

export type ReqIdExtraction = { reqId?: string; reasons: string[] };

/** Requisition ID extraction (A7): tries each configured pattern on the subject then the body. */
export function extractReqId(msg: NormalizedMessage): ReqIdExtraction {
  const reasons: string[] = [];

  for (const [haystackName, haystack] of [
    ["subject", msg.subject],
    ["body", msg.text],
  ] as const) {
    for (const pattern of REQ_ID_PATTERNS) {
      const m = haystack.match(pattern);
      if (m) {
        reasons.push(`req id "${m[0]}" matched pattern ${pattern} in ${haystackName}`);
        return { reqId: m[0], reasons };
      }
    }
  }

  reasons.push("no req id pattern matched");
  return { reasons };
}
