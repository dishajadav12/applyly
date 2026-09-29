"use client";

import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RANGE_PRESETS, resolveRange, type RangePreset } from "@/lib/ranges";

type Row = {
  messageId: string;
  subject: string;
  from: string;
  isJobRelated: boolean;
  eventType?: string;
  company?: string;
  role?: string;
  confidence: number;
  reasons: string[];
};

type ClassifyPreview = { sampledCount: number; totalMatched: number; rows: Row[] };

export function ClassifyPreviewPanel() {
  const [preset, setPreset] = useState<RangePreset>("1m");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [sampleSize, setSampleSize] = useState(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClassifyPreview | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const { start, end } = resolveRange(preset, new Date(), { start: customStart, end: customEnd });
      const res = await fetch("/debug/classify-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rangeStart: start.toISOString(), rangeEnd: end.toISOString(), sampleSize }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setResult(body as ClassifyPreview);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Classify preview failed");
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
          <label className="text-xs text-muted-foreground">Sample size</label>
          <Input
            type="number"
            min={1}
            max={500}
            className="w-28"
            value={sampleSize}
            onChange={(e) => setSampleSize(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
          />
        </div>

        <Button onClick={run} disabled={busy}>
          {busy ? "Running…" : "Classify preview"}
        </Button>
      </div>

      {busy && <p className="text-sm text-muted-foreground">Fetching and classifying messages. This is heavier than the dry run.</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Classified {result.sampledCount} of {result.totalMatched} matched messages. Nothing was stored.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>From</TableHead>
                <TableHead>Job related</TableHead>
                <TableHead>Event type</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Confidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row) => (
                <Fragment key={row.messageId}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => setExpanded(expanded === row.messageId ? null : row.messageId)}
                  >
                    <TableCell className="max-w-xs truncate">{row.subject || <span className="text-muted-foreground">(no subject)</span>}</TableCell>
                    <TableCell className="max-w-48 truncate font-mono text-xs">{row.from}</TableCell>
                    <TableCell>
                      <Badge variant={row.isJobRelated ? "default" : "secondary"}>{row.isJobRelated ? "Yes" : "No"}</Badge>
                    </TableCell>
                    <TableCell>{row.eventType ?? "—"}</TableCell>
                    <TableCell>{row.company ?? "Unknown"}</TableCell>
                    <TableCell>{row.role ?? "Unknown"}</TableCell>
                    <TableCell className="text-right">{row.confidence}</TableCell>
                  </TableRow>
                  {expanded === row.messageId && (
                    <TableRow>
                      <TableCell colSpan={7} className="bg-muted/50">
                        <ul className="list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                          {row.reasons.map((reason, i) => (
                            <li key={i}>{reason}</li>
                          ))}
                        </ul>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
