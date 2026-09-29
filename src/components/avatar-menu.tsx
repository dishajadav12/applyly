"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AiProviderName } from "@/lib/config";

type Props = { hasConnection: boolean; aiProvider: AiProviderName | null };

const AI_OPTIONS: { value: string; label: string }[] = [
  { value: "off", label: "Off (default)" },
  { value: "gemini", label: "Gemini (cloud)" },
  { value: "ollama", label: "Ollama (local, dev)" },
];

export function AvatarMenu({ hasConnection, aiProvider }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savingAi, setSavingAi] = useState(false);

  async function reprocessAll() {
    setBusy(true);
    try {
      const res = await fetch("/api/scans/reprocess", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not reprocess");
      toast.success(
        body.clearedCount > 0
          ? `Cleared ${body.clearedCount} messages for reprocessing. Scan again to pick them up.`
          : "Everything is already processed with the current parser version.",
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reprocess");
    } finally {
      setBusy(false);
    }
  }

  async function disconnectGmail() {
    setBusy(true);
    try {
      const res = await fetch("/api/gmail/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Could not disconnect Gmail");
      toast.success("Gmail disconnected");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not disconnect Gmail");
    } finally {
      setBusy(false);
    }
  }

  async function saveAiProvider(value: string | null) {
    if (!value) return;
    setSavingAi(true);
    try {
      const provider = value === "off" ? null : value;
      const res = await fetch("/api/settings/ai-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) throw new Error("Could not save this setting");
      toast.success(provider ? `AI fallback set to ${provider}` : "AI fallback turned off");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save this setting");
    } finally {
      setSavingAi(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={busy} />}>Menu</DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={reprocessAll}>Re-process all</DropdownMenuItem>
          {hasConnection && <DropdownMenuItem onClick={disconnectGmail}>Disconnect Gmail</DropdownMenuItem>}
          <DropdownMenuItem onClick={() => setSettingsOpen(true)}>Settings</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              const form = document.createElement("form");
              form.method = "post";
              form.action = "/auth/sign-out";
              document.body.appendChild(form);
              form.submit();
            }}
          >
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              Optional AI fallback (Phase 12). Only runs for low-confidence or company/role-missing emails, and only sends the
              subject, sender, and the first 2KB of the email body — never the full message.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">AI fallback</label>
            <Select value={aiProvider ?? "off"} onValueChange={saveAiProvider} disabled={savingAi}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
