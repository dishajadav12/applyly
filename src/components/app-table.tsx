"use client";

import { format } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { STATUS_DISPLAY_ORDER, type Status } from "@/lib/config";
import type { Application } from "@/lib/db/repo";
import { cn } from "@/lib/utils";

type SortKey = "applied" | "company" | "status";
type SortDir = "asc" | "desc";

const STATUS_INDEX: Record<string, number> = Object.fromEntries(STATUS_DISPLAY_ORDER.map((s, i) => [s, i]));
const statusIndex = (status: string) => STATUS_INDEX[status] ?? STATUS_DISPLAY_ORDER.length;

/** A9: server-fetched application rows, sorted/filtered/searched entirely client-side. */
export function AppTable({
  applications,
  outreachEmails = {},
  onSelect,
}: {
  applications: Application[];
  outreachEmails?: Record<string, string[]>;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("applied");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const searchRef = useRef<HTMLInputElement>(null);

  // Phase 11: "/" focuses search, unless the user is already typing somewhere.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const target = e.target as HTMLElement | null;
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of applications) counts.set(a.status, (counts.get(a.status) ?? 0) + 1);
    return counts;
  }, [applications]);

  // Chips reflect the full, unfiltered set (never affected by search), per A9's manual check
  // "add up the status chip counts -> equals total rows".
  const visibleStatuses = useMemo(() => STATUS_DISPLAY_ORDER.filter((s) => statusCounts.has(s)), [statusCounts]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "applied" ? "desc" : "asc");
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = applications;
    if (statusFilter) rows = rows.filter((a) => a.status === statusFilter);
    if (q) rows = rows.filter((a) => a.company.toLowerCase().includes(q) || a.role.toLowerCase().includes(q));
    return rows;
  }, [applications, statusFilter, search]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (sortKey === "company") return dir * a.company.localeCompare(b.company);
      if (sortKey === "status") return dir * (statusIndex(a.status) - statusIndex(b.status));
      // "applied": nulls always sort last, regardless of direction.
      const at = a.applied_at ? Date.parse(a.applied_at) : null;
      const bt = b.applied_at ? Date.parse(b.applied_at) : null;
      if (at === null && bt === null) return 0;
      if (at === null) return 1;
      if (bt === null) return -1;
      return dir * (at - bt);
    });
    return rows;
  }, [filtered, sortKey, sortDir]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          ref={searchRef}
          placeholder="Search company or role… (/)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex flex-wrap gap-1.5">
          <FilterChip label="All" count={applications.length} active={statusFilter === null} onClick={() => setStatusFilter(null)} />
          {visibleStatuses.map((s) => (
            <FilterChip
              key={s}
              label={s}
              count={statusCounts.get(s) ?? 0}
              active={statusFilter === s}
              onClick={() => setStatusFilter((current) => (current === s ? null : s))}
            />
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No applications match {search ? `“${search}”` : "this filter"}.
        </p>
      ) : (
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <SortableHead label="Company" active={sortKey === "company"} dir={sortDir} onClick={() => toggleSort("company")} />
              <TableHead>Role</TableHead>
              <SortableHead label="Applied" active={sortKey === "applied"} dir={sortDir} onClick={() => toggleSort("applied")} />
              <SortableHead label="Status" active={sortKey === "status"} dir={sortDir} onClick={() => toggleSort("status")} />
              <TableHead>Recruiter</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((app, i) => (
              <TableRow key={app.id} onClick={() => onSelect(app.id)} className="cursor-pointer">
                <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-1.5">
                    {app.needs_review && <span className="size-1.5 shrink-0 rounded-full bg-amber-500" title="Needs review" />}
                    {app.company}
                  </span>
                </TableCell>
                <TableCell className={cn(app.role === "Unknown" && "text-muted-foreground")}>{app.role}</TableCell>
                <TableCell>
                  <AppliedDate date={app.applied_at} inferred={app.applied_date_source === "inferred"} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={app.status as Status} />
                </TableCell>
                <TableCell>
                  <RecruiterCell primary={app.primary_recruiter_email} emailed={outreachEmails[app.company_key]} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

/** The application's own recruiter, else the recruiters the user has emailed at this company. */
function RecruiterCell({ primary, emailed = [] }: { primary: string | null; emailed?: string[] }) {
  const emails = primary ? [primary] : emailed;
  if (emails.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-col">
      {emails.map((email) => (
        <a
          key={email}
          href={`mailto:${email}`}
          onClick={(e) => e.stopPropagation()}
          className="text-primary underline-offset-2 hover:underline"
        >
          {email}
        </a>
      ))}
    </span>
  );
}

function SortableHead({ label, active, dir, onClick }: { label: string; active: boolean; dir: SortDir; onClick: () => void }) {
  return (
    <TableHead>
      <button type="button" onClick={onClick} className="flex items-center gap-1 hover:text-foreground">
        {label}
        {active && <span aria-hidden>{dir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </TableHead>
  );
}

function FilterChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
      )}
    >
      {label} <span className={cn(active ? "text-primary-foreground/80" : "text-muted-foreground")}>{count}</span>
    </button>
  );
}

function AppliedDate({ date, inferred }: { date: string | null; inferred: boolean }) {
  if (!date) return <span className="text-muted-foreground">—</span>;
  const formatted = format(new Date(date), "MMM d, yyyy");
  if (!inferred) return <span>{formatted}</span>;
  return (
    <Tooltip>
      <TooltipTrigger className="cursor-default underline decoration-dotted underline-offset-4">{`~${formatted}`}</TooltipTrigger>
      <TooltipContent>This date is inferred from the earliest email, not an explicit application confirmation.</TooltipContent>
    </Tooltip>
  );
}
