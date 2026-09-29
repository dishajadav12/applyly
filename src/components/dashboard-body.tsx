"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppTable } from "@/components/app-table";
import { DetailSheet } from "@/components/detail-sheet";
import { ReviewDialog } from "@/components/review-dialog";
import type { Application, EmailEvent } from "@/lib/db/repo";

type Props = { applications: Application[]; reviewEvents: EmailEvent[]; googleEmail?: string | null };

/** A9/A10: wires the table, the review banner+dialog, and the detail sheet together (client state). */
export function DashboardBody({ applications, reviewEvents, googleEmail }: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pickable = applications.map((a) => ({ id: a.id, company: a.company, role: a.role }));

  return (
    <div className="space-y-4">
      <ReviewDialog events={reviewEvents} applications={pickable} onMutated={() => router.refresh()} />
      <AppTable applications={applications} onSelect={setSelectedId} />
      <DetailSheet
        applicationId={selectedId}
        onClose={() => setSelectedId(null)}
        onMutated={() => router.refresh()}
        applications={pickable}
        googleEmail={googleEmail}
      />
    </div>
  );
}
