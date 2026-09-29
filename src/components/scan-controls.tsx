"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RANGE_PRESETS, resolveRange, type RangePreset } from "@/lib/ranges";

type Counters = { processed: number; jobRelated: number; appsCreated: number; appsUpdated: number; total: number };
type Phase = "idle" | "listing" | "processing" | "done" | "failed" | "cancelled";

export type ActiveScan = { id: string; status: Phase } & Partial<Counters>;

const BUSY_RETRY_MS = 2000;
/** The scans-row lease is held for up to this long (A4); a step interrupted mid-run
 * (e.g. the page was reloaded) can leave it held until it naturally expires. */
const LEASE_SECONDS = 90;

export function ScanControls({ activeScan }: { activeScan: ActiveScan | null }) {
  const router = useRouter();
  const [preset, setPreset] = useState<RangePreset>("since");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [scanId, setScanId] = useState<string | null>(activeScan?.id ?? null);
  const [phase, setPhase] = useState<Phase>(activeScan?.status ?? "idle");
  const [counters, setCounters] = useState<Counters>({
    processed: activeScan?.processed ?? 0,
    jobRelated: activeScan?.jobRelated ?? 0,
    appsCreated: activeScan?.appsCreated ?? 0,
    appsUpdated: activeScan?.appsUpdated ?? 0,
    total: activeScan?.total ?? 0,
  });
  // Guards against a step response landing after Cancel was clicked, or two loops overlapping.
  const cancelledRef = useRef(false);
  const stepLoopRunning = useRef(false);
  const [waitingOnLease, setWaitingOnLease] = useState(false);

  const runStepLoop = useCallback(
    async (id: string) => {
      if (stepLoopRunning.current) return;
      stepLoopRunning.current = true;
      cancelledRef.current = false;

      try {
        for (;;) {
          if (cancelledRef.current) return;

          const res = await fetch(`/api/scans/${id}/step`, { method: "POST" });

          if (res.status === 409) {
            // Another step already holds the lease — normal under concurrency, or (after a
            // reload interrupted a step mid-run) waiting for it to expire, up to LEASE_SECONDS.
            setWaitingOnLease(true);
            await new Promise((r) => setTimeout(r, BUSY_RETRY_MS));
            continue;
          }
          setWaitingOnLease(false);

          const body = await res.json();
          if (!res.ok) {
            setPhase("failed");
            toast.error(body.error ?? "Scan failed");
            return;
          }

          setCounters({ processed: body.processed, jobRelated: body.jobRelated, appsCreated: body.appsCreated, appsUpdated: body.appsUpdated, total: body.total });

          if (body.done) {
            setPhase("done");
            toast.success(`Scan complete: ${body.jobRelated} job-related emails, ${body.appsCreated} new applications`);
            router.refresh();
            return;
          }
        }
      } finally {
        stepLoopRunning.current = false;
      }
    },
    [router],
  );

  // Resume an in-progress scan found on page load. `phase` already starts as
  // "processing" in that case (see useState above), so this only starts the loop.
  useEffect(() => {
    if (activeScan?.status === "processing") {
      void runStepLoop(activeScan.id);
    }
  }, [activeScan, runStepLoop]);

  async function startScan() {
    setPhase("listing");
    setCounters({ processed: 0, jobRelated: 0, appsCreated: 0, appsUpdated: 0, total: 0 });
    try {
      const { start, end } = resolveRange(preset, new Date(), { start: customStart, end: customEnd });
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rangeStart: start.toISOString(), rangeEnd: end.toISOString() }),
      });
      const body = await res.json();

      if (res.status === 409 && body.scanId) {
        toast.info("A scan is already running. Following it.");
        setScanId(body.scanId);
        setPhase("processing");
        void runStepLoop(body.scanId);
        return;
      }
      if (!res.ok) throw new Error(body.error ?? "Could not start the scan");

      setScanId(body.scanId);
      setCounters((c) => ({ ...c, total: body.total }));
      setPhase("processing");
      void runStepLoop(body.scanId);
    } catch (err) {
      setPhase("idle");
      toast.error(err instanceof Error ? err.message : "Could not start the scan");
    }
  }

  async function cancelScan() {
    if (!scanId) return;
    cancelledRef.current = true;
    try {
      const res = await fetch(`/api/scans/${scanId}/cancel`, { method: "POST" });
      if (!res.ok) throw new Error("Could not cancel the scan");
      setPhase("cancelled");
      toast.info("Scan cancelled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel the scan");
    }
  }

  const isActive = phase === "listing" || phase === "processing";
  const percent = counters.total > 0 ? Math.min(100, Math.round((counters.processed / counters.total) * 100)) : 0;

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-end gap-3">
        <Select value={preset} onValueChange={(v) => setPreset(v as RangePreset)} disabled={isActive}>
          <SelectTrigger className="w-48">
            <SelectValue>{RANGE_PRESETS.find((p) => p.value === preset)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {RANGE_PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {preset === "custom" && (
          <>
            <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} disabled={isActive} className="w-40" />
            <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} disabled={isActive} className="w-40" />
          </>
        )}

        {isActive ? (
          <Button variant="outline" onClick={cancelScan}>
            Cancel
          </Button>
        ) : (
          <Button onClick={startScan}>Scan Gmail</Button>
        )}
      </div>

      {phase === "listing" && <p className="text-sm text-muted-foreground">Searching…</p>}
      {waitingOnLease && (
        <p className="text-sm text-muted-foreground">
          Waiting for a previous step to finish (this can take up to {LEASE_SECONDS} seconds after a reload)…
        </p>
      )}

      {(isActive || phase === "done") && counters.total > 0 && (
        <Progress value={percent}>
          <div className="flex items-center justify-between">
            <ProgressLabel>
              Processing {counters.processed} / {counters.total} · {counters.jobRelated} job-related · {counters.appsCreated + counters.appsUpdated} applications
            </ProgressLabel>
            <ProgressValue />
          </div>
        </Progress>
      )}

      {phase === "failed" && <p className="text-sm text-destructive">The scan failed. You can start a new one above.</p>}
      {phase === "cancelled" && <p className="text-sm text-muted-foreground">Scan cancelled.</p>}
    </div>
  );
}
