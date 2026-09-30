"use client";

import { format } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { ApplicationPicker, type PickableApplication } from "@/components/application-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { normalizeCompanyKey } from "@/lib/extract/text-utils";
import { EVENT_TYPE_LABELS, type EventType } from "@/lib/config";
import type { EmailEvent } from "@/lib/db/repo";

type Props = { events: EmailEvent[]; applications: PickableApplication[]; onMutated: () => void };

/**
 * A9 review banner + dialog: "N emails need review" opens a dialog where each email can be
 * assigned to an existing application, used to create a new one, or dismissed as not job-related.
 */
export function ReviewDialog({ events, applications, onMutated }: Props) {
  const [open, setOpen] = useState(false);
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<{ messageId: string; mode: "assign" | "create" } | null>(null);

  const visible = events.filter((e) => !resolved.has(e.message_id));
  if (events.length === 0) return null;

  function markResolved(messageId: string) {
    setResolved((prev) => new Set(prev).add(messageId));
    setExpanded(null);
    onMutated();
  }

  async function assign(messageId: string, applicationId: string) {
    const res = await fetch(`/api/events/${encodeURIComponent(messageId)}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId }),
    });
    if (!res.ok) return toast.error("Could not assign this email");
    toast.success("Assigned");
    markResolved(messageId);
  }

  async function rematch() {
    const res = await fetch("/api/events/rematch", { method: "POST" });
    if (!res.ok) return toast.error("Could not re-run matching");
    const { resolved: n } = (await res.json()) as { resolved: number };
    toast.success(n > 0 ? `Matched ${n} ${n === 1 ? "email" : "emails"} automatically` : "Nothing new could be matched automatically");
    if (n > 0) onMutated();
  }

  async function dismiss(messageId: string) {
    const res = await fetch(`/api/events/${encodeURIComponent(messageId)}/dismiss`, { method: "POST" });
    if (!res.ok) return toast.error("Could not dismiss this email");
    toast.success("Dismissed");
    markResolved(messageId);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-left text-sm text-amber-800 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/15"
      >
        {visible.length} {visible.length === 1 ? "email needs" : "emails need"} review
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Review queue</DialogTitle>
            <p className="text-sm text-muted-foreground">
              These emails matched more than one application, or none. Pick a suggestion to link an email in one click.
            </p>
            <Button size="sm" variant="outline" className="w-fit" onClick={rematch}>
              Re-run auto-match
            </Button>
          </DialogHeader>

          {visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">All caught up.</p>
          ) : (
            <ul className="space-y-3">
              {visible.map((e) => (
                <ReviewRow
                  key={e.message_id}
                  event={e}
                  applications={applications}
                  expanded={expanded?.messageId === e.message_id ? expanded.mode : null}
                  onToggle={(mode) => setExpanded((cur) => (cur?.messageId === e.message_id && cur.mode === mode ? null : { messageId: e.message_id, mode }))}
                  onAssign={(applicationId) => assign(e.message_id, applicationId)}
                  onCreate={async (company, role) => {
                    const res = await fetch(`/api/events/${encodeURIComponent(e.message_id)}/create`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ company, role }),
                    });
                    if (!res.ok) return toast.error("Could not create the application");
                    toast.success("Application created");
                    markResolved(e.message_id);
                  }}
                  onDismiss={() => dismiss(e.message_id)}
                />
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReviewRow({
  event,
  applications,
  expanded,
  onToggle,
  onAssign,
  onCreate,
  onDismiss,
}: {
  event: EmailEvent;
  applications: PickableApplication[];
  expanded: "assign" | "create" | null;
  onToggle: (mode: "assign" | "create") => void;
  onAssign: (applicationId: string) => void;
  onCreate: (company: string, role: string) => void;
  onDismiss: () => void;
}) {
  const [company, setCompany] = useState(event.company ?? "");
  const [role, setRole] = useState(event.role ?? "");
  const eventKey = event.company ? normalizeCompanyKey(event.company) : undefined;
  const suggestions = eventKey ? applications.filter((a) => normalizeCompanyKey(a.company) === eventKey) : [];
  const why = event.reasons.at(-1);

  return (
    <li className="rounded-md border p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{event.from_name ?? event.from_email}</span>
        <span className="text-xs text-muted-foreground">{format(new Date(event.received_at), "MMM d, yyyy")}</span>
      </div>
      <p className="truncate text-muted-foreground">{event.subject}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{EVENT_TYPE_LABELS[event.event_type as EventType] ?? event.event_type}</p>

      {why && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Why: {why}</p>}

      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {suggestions.map((a) => (
            <Button key={a.id} size="sm" onClick={() => onAssign(a.id)}>
              Link to {a.company} · {a.role}
            </Button>
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => onToggle("assign")}>
          Assign to existing…
        </Button>
        <Button size="sm" variant="outline" onClick={() => onToggle("create")}>
          Create new
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>

      {expanded === "assign" && (
        <div className="mt-2">
          <ApplicationPicker applications={applications} onPick={onAssign} />
        </div>
      )}

      {expanded === "create" && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground">Company</label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground">Role (optional)</label>
            <Input value={role} onChange={(e) => setRole(e.target.value)} />
          </div>
          <Button size="sm" disabled={!company.trim()} onClick={() => onCreate(company.trim(), role.trim() || "Unknown")}>
            Create
          </Button>
        </div>
      )}
    </li>
  );
}
