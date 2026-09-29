"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type PickableApplication = { id: string; company: string; role: string };

/**
 * Reusable searchable list (A9 "searchable picker" for Merge into… and Move event). Filters
 * client-side over the applications already loaded on the dashboard — no extra network call.
 */
export function ApplicationPicker({
  applications,
  excludeId,
  onPick,
  placeholder = "Search company or role…",
}: {
  applications: PickableApplication[];
  excludeId?: string;
  onPick: (id: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const candidates = applications.filter((a) => a.id !== excludeId);
    if (!q) return candidates;
    return candidates.filter((a) => a.company.toLowerCase().includes(q) || a.role.toLowerCase().includes(q));
  }, [applications, excludeId, query]);

  return (
    <div className="space-y-2">
      <Input autoFocus placeholder={placeholder} value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="max-h-64 divide-y overflow-y-auto rounded-md border">
        {filtered.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">No matches.</p>
        ) : (
          filtered.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onPick(a.id)}
              className={cn("flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted")}
            >
              <span className="font-medium">{a.company}</span>
              <span className="text-xs text-muted-foreground">{a.role}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
