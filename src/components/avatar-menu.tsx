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

export function AvatarMenu({ hasConnection }: { hasConnection: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={busy} />}>Menu</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={reprocessAll}>Re-process all</DropdownMenuItem>
        {hasConnection && <DropdownMenuItem onClick={disconnectGmail}>Disconnect Gmail</DropdownMenuItem>}
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
  );
}
