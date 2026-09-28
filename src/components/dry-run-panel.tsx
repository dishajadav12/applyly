"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RANGE_PRESETS, resolveRange, type RangePreset } from "@/lib/ranges";

type QueryResult = { count: number; sampled: number; topDomains: { domain: string; count: number }[] };
type DryRun = {
  queries: Record<"q1" | "q2" | "q3", string>;
  combinedCount: number;
  perQuery: Record<"q1" | "q2" | "q3", QueryResult>;
};

const LABELS = {
  q1: "Q1: ATS & assessment platforms",
  q2: "Q2: application phrases",
  q3: "Q3: LinkedIn & Indeed confirmations",
} as const;

export function DryRunPanel() {
  const [preset, setPreset] = useState<RangePreset>("7d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [sampleSize, setSampleSize] = useState(1000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DryRun | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const { start, end } = resolveRange(preset, new Date(), { start: customStart, end: customEnd });
      const res = await fetch("/debug/dry-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rangeStart: start.toISOString(), rangeEnd: end.toISOString(), sampleSize }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setResult(body as DryRun);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Dry run failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Range</label>
          <Select value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
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
        </div>

        {preset === "custom" && (
          <>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Start</label>
              <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">End</label>
              <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </div>
          </>
        )}

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Sender sample per query</label>
          <Input
            type="number"
            min={0}
            max={5000}
            className="w-32"
            value={sampleSize}
            onChange={(e) => setSampleSize(Math.max(0, Math.min(5000, Number(e.target.value) || 0)))}
          />
        </div>

        <Button onClick={run} disabled={busy}>
          {busy ? "Running…" : "Dry run"}
        </Button>
      </div>

      {busy && <p className="text-sm text-muted-foreground">Listing messages and sampling senders. Large ranges can take a minute.</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <div className="space-y-6">
          <p className="text-sm">
            <span className="font-medium">Combined unique messages: {result.combinedCount}</span>{" "}
            <span className="text-muted-foreground">
              ({(["q1", "q2", "q3"] as const).map((q) => `${q.toUpperCase()} ${result.perQuery[q].count}`).join(" + ")}; overlaps counted once)
            </span>
          </p>

          <div className="grid gap-6 lg:grid-cols-3">
            {(["q1", "q2", "q3"] as const).map((q) => (
              <section key={q} className="min-w-0 space-y-3">
                <h2 className="text-sm font-medium">{LABELS[q]}</h2>
                <p className="text-sm">
                  {result.perQuery[q].count} unique IDs{" "}
                  <span className="text-muted-foreground">(sender sample: {result.perQuery[q].sampled})</span>
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Top sender domains</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.perQuery[q].topDomains.map((d) => (
                      <TableRow key={d.domain}>
                        <TableCell className="font-mono text-xs">{d.domain}</TableCell>
                        <TableCell className="text-right">{d.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Gmail search string</summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 select-all">
                    {result.queries[q]}
                  </pre>
                </details>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
