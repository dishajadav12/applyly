"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { resolveRange } from "@/lib/ranges";

/** A9: the "never scanned" empty state's big CTA. Starts a scan; ScanControls above picks up
 * the resulting active scan (via the page's server-fetched activeScan prop) and drives it. */
export function EmptyScanCta() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const { start: rangeStart, end: rangeEnd } = resolveRange("since");
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rangeStart: rangeStart.toISOString(), rangeEnd: rangeEnd.toISOString() }),
      });
      const body = await res.json();
      if (!res.ok && res.status !== 409) throw new Error(body.error ?? "Could not start the scan");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the scan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm text-muted-foreground">You haven&apos;t scanned your Gmail yet.</p>
      <Button size="lg" onClick={start} disabled={busy}>
        {busy ? "Starting…" : "Scan since May 1, 2026"}
      </Button>
    </div>
  );
}
