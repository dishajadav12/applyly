"use client";

import { format } from "date-fns";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ApplicationPicker, type PickableApplication } from "@/components/application-picker";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EVENT_TYPE_LABELS, STATUS_DISPLAY_ORDER, type EventType, type Status } from "@/lib/config";
import type { Application, EmailEvent } from "@/lib/db/repo";
import type { Overrides, Recruiter } from "@/lib/match/derive";
import { gmailMessageUrl } from "@/lib/gmail/links";
import { cn } from "@/lib/utils";

type Props = {
  applicationId: string | null;
  onClose: () => void;
  onMutated: () => void;
  applications: PickableApplication[];
  googleEmail?: string | null;
};

/** A9 detail panel: editable fields, timeline with Open-in-Gmail links, recruiters, and actions. */
export function DetailSheet({ applicationId, onClose, onMutated, applications, googleEmail }: Props) {
  const [application, setApplication] = useState<Application | null>(null);
  const [events, setEvents] = useState<EmailEvent[]>([]);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [movingEventId, setMovingEventId] = useState<string | null>(null);
  // Derived, not a separate state slot: true whenever we're showing a stale (or no) application
  // for the currently-selected id, i.e. between selecting a row and the fetch below resolving.
  const loading = applicationId !== null && application?.id !== applicationId;

  useEffect(() => {
    // Sheet is closed (and nothing reads application/events) when applicationId is null, so
    // there's nothing to reset here — just skip the fetch. Keeps this a plain synchronization
    // effect (fetch in, setState from the response) rather than one that also resets on unmount.
    if (!applicationId) return;
    fetch(`/api/applications/${applicationId}`)
      .then((res) => res.json())
      .then((body) => {
        setApplication(body.application ?? null);
        setEvents(body.events ?? []);
      })
      .catch(() => toast.error("Could not load this application"));
  }, [applicationId]);

  async function setField(field: "company" | "role" | "appliedAt" | "status" | "recruiterEmail", value: string) {
    if (!application) return;
    const res = await fetch(`/api/applications/${application.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set", field, value }),
    });
    const body = await res.json();
    if (!res.ok) {
      toast.error(body.error ?? "Could not save that change");
      return;
    }
    setApplication(body.application);
    onMutated();
  }

  async function resetField(field: "role" | "appliedAt" | "status" | "recruiterEmail") {
    if (!application) return;
    const res = await fetch(`/api/applications/${application.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset", field }),
    });
    const body = await res.json();
    if (!res.ok) {
      toast.error(body.error ?? "Could not reset that field");
      return;
    }
    setApplication(body.application);
    onMutated();
  }

  async function deleteApplication() {
    if (!application) return;
    if (!window.confirm(`Delete the application at ${application.company}? Its emails will move to the review queue.`)) return;
    const res = await fetch(`/api/applications/${application.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete this application");
      return;
    }
    toast.success("Application deleted");
    onMutated();
    onClose();
  }

  async function mergeInto(targetId: string) {
    if (!application) return;
    const res = await fetch(`/api/applications/${application.id}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId }),
    });
    const body = await res.json();
    if (!res.ok) {
      toast.error(body.error ?? "Could not merge these applications");
      return;
    }
    setMergeOpen(false);
    toast.success("Applications merged");
    onMutated();
    onClose();
  }

  async function moveEvent(messageId: string, targetApplicationId: string) {
    const res = await fetch(`/api/events/${encodeURIComponent(messageId)}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId: targetApplicationId }),
    });
    if (!res.ok) {
      toast.error("Could not move this email");
      return;
    }
    setMovingEventId(null);
    toast.success("Email moved");
    setEvents((prev) => prev.filter((e) => e.message_id !== messageId));
    onMutated();
  }

  const overrides = (application?.overrides as Overrides | null) ?? {};
  const recruiters = ((application?.recruiters as Recruiter[] | null) ?? []).slice().sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));

  return (
    <Sheet open={applicationId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {loading || !application ? (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>
                {application.company} · {application.role}
              </SheetTitle>
              <SheetDescription>
                <StatusBadge status={application.status as Status} />
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 px-4">
              <EditableText label="Company" value={application.company} onSave={(v) => setField("company", v)} />
              <EditableText
                label="Role"
                value={application.role}
                overridden={Boolean(overrides.role)}
                onSave={(v) => setField("role", v)}
                onReset={() => resetField("role")}
              />

              <FieldRow
                label="Applied date"
                overridden={Boolean(overrides.appliedAt)}
                onReset={() => resetField("appliedAt")}
              >
                <Input
                  type="date"
                  value={application.applied_at ? format(new Date(application.applied_at), "yyyy-MM-dd") : ""}
                  onChange={(e) => e.target.value && setField("appliedAt", e.target.value)}
                />
              </FieldRow>

              <FieldRow label="Status" overridden={Boolean(overrides.status)} onReset={() => resetField("status")}>
                <Select value={application.status} onValueChange={(v) => setField("status", v as string)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_DISPLAY_ORDER.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>

              <EditableText
                label="Recruiter email"
                value={application.primary_recruiter_email ?? ""}
                overridden={Boolean(overrides.recruiterEmail)}
                onSave={(v) => setField("recruiterEmail", v)}
                onReset={() => resetField("recruiterEmail")}
              />

              {recruiters.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Recruiters</p>
                  <ul className="space-y-1 text-sm">
                    {recruiters.map((r) => (
                      <li key={r.email} className="flex items-center justify-between">
                        <a href={`mailto:${r.email}`} className="text-primary hover:underline">
                          {r.name ? `${r.name} <${r.email}>` : r.email}
                        </a>
                        <span className="text-xs text-muted-foreground">{format(new Date(r.lastSeen), "MMM d, yyyy")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Timeline</p>
                <ul className="space-y-2">
                  {events.map((e) => (
                    <li key={e.message_id} className="rounded-md border p-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{EVENT_TYPE_LABELS[e.event_type as EventType] ?? e.event_type}</span>
                        <span className="text-xs text-muted-foreground">{format(new Date(e.received_at), "MMM d, yyyy")}</span>
                      </div>
                      <p className="truncate text-muted-foreground">{e.subject}</p>
                      <div className="mt-1 flex items-center gap-3 text-xs">
                        <a
                          href={gmailMessageUrl(googleEmail ?? "", e.rfc822_message_id, e.message_id)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          Open in Gmail
                        </a>
                        <button type="button" className="text-muted-foreground hover:underline" onClick={() => setMovingEventId(e.message_id)}>
                          Move event…
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-auto flex items-center justify-between gap-2 border-t p-4">
              <Button variant="outline" size="sm" onClick={() => setMergeOpen(true)}>
                Merge into…
              </Button>
              <Button variant="destructive" size="sm" onClick={deleteApplication}>
                Delete
              </Button>
            </div>
          </>
        )}
      </SheetContent>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge into…</DialogTitle>
          </DialogHeader>
          <ApplicationPicker applications={applications} excludeId={application?.id} onPick={mergeInto} />
        </DialogContent>
      </Dialog>

      <Dialog open={movingEventId !== null} onOpenChange={(open) => !open && setMovingEventId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move event to…</DialogTitle>
          </DialogHeader>
          <ApplicationPicker
            applications={applications}
            excludeId={application?.id}
            onPick={(targetId) => movingEventId && moveEvent(movingEventId, targetId)}
          />
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}

function FieldRow({
  label,
  overridden,
  onReset,
  children,
}: {
  label: string;
  overridden: boolean;
  onReset: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        {overridden && (
          <button type="button" onClick={onReset} className="text-xs text-primary hover:underline">
            Reset to auto
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function EditableText({
  label,
  value,
  overridden,
  onSave,
  onReset,
}: {
  label: string;
  value: string;
  overridden?: boolean;
  onSave: (value: string) => void;
  onReset?: () => void;
}) {
  // Uncontrolled + keyed on `value`: remounts (resetting to the new defaultValue) whenever the
  // server value changes (after a save, a reset-to-auto, or switching applications) without
  // needing a state-sync effect.
  return (
    <FieldRow label={label} overridden={Boolean(overridden)} onReset={onReset ?? (() => {})}>
      <Input
        key={value}
        defaultValue={value}
        onBlur={(e) => {
          const trimmed = e.target.value.trim();
          if (trimmed && trimmed !== value) onSave(trimmed);
        }}
        className={cn(!overridden && !onReset && "text-foreground")}
      />
    </FieldRow>
  );
}
