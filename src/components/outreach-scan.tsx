"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const BUSY_RETRY_MS = 2000;

/** Scans only the user's sent mail for recruiter outreach: the dashboard's applications are never touched. */
export function OutreachScan({ defaultStart }: { defaultStart: string }) {
  const router = useRouter();
  const [start, setStart] = useState(defaultStart);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setProgress(null);
    try {
      const rangeStart = new Date(`${start}T00:00:00`);
      if (Number.isNaN(rangeStart.getTime())) throw new Error("Pick a start date");
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rangeStart: rangeStart.toISOString(), rangeEnd: new Date().toISOString(), kind: "outreach" }),
      });
      const body = await res.json();
      if (res.status === 409 && body.scanId) throw new Error("A scan is already running; wait for it to finish.");
      if (!res.ok) throw new Error(body.error ?? "Could not start the scan");

      for (;;) {
        const step = await fetch(`/api/scans/${body.scanId}/step`, { method: "POST" });
        const s = await step.json().catch(() => ({}));
        if (step.status === 409 && s.busy) {
          await new Promise((r) => setTimeout(r, BUSY_RETRY_MS));
          continue;
        }
        if (!step.ok) throw new Error(s.error ?? "Scan failed");
        setProgress({ processed: s.processed, total: s.total });
        router.refresh();
        if (s.done) {
          toast.success(`Checked ${s.total} sent email${s.total === 1 ? "" : "s"}`);
          break;
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
      <label className="text-sm text-muted-foreground" htmlFor="outreach-start">
        Scan sent mail since
      </label>
      <Input id="outreach-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} disabled={busy} className="w-40" />
      <Button onClick={run} disabled={busy}>
        {busy ? "Scanning…" : "Scan sent emails"}
      </Button>
      {progress && (
        <span className="text-sm text-muted-foreground">
          {progress.processed} / {progress.total}
        </span>
      )}
      <span className="basis-full text-xs text-muted-foreground">Only collects recruiters from your sent mail; the dashboard&apos;s applications are not changed.</span>
    </div>
  );
}
