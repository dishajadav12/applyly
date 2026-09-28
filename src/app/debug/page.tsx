import { notFound } from "next/navigation";
import { DryRunPanel } from "@/components/dry-run-panel";

export default function DebugPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-8">
      <div>
        <h1 className="text-xl font-semibold">Debug: Gmail dry run</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dev only. Counts matching messages per query and the top sender domains, so Q2 can be tuned. Read-only; writes nothing to the
          database. Sign in first.
        </p>
      </div>
      <DryRunPanel />
    </main>
  );
}
