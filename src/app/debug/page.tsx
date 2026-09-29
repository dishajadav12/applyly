import { notFound } from "next/navigation";
import { ClassifyPreviewPanel } from "@/components/classify-preview-panel";
import { DryRunPanel } from "@/components/dry-run-panel";

export default function DebugPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto w-full max-w-6xl space-y-10 p-8">
      <div>
        <h1 className="text-xl font-semibold">Debug: Gmail dry run</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dev only. Counts matching messages per query and the top sender domains, so Q2 can be tuned. Read-only; writes nothing to the
          database. Sign in first.
        </p>
      </div>
      <DryRunPanel />

      <div className="border-t pt-8">
        <h2 className="text-xl font-semibold">Classify preview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Fetches and classifies a sample of matching messages (src/lib/extract). Click a row to see its reasons[]. Read-only; writes
          nothing to the database.
        </p>
      </div>
      <ClassifyPreviewPanel />
    </main>
  );
}
