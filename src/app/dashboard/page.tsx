import { Header } from "@/components/header";
import type { ActiveScan } from "@/components/scan-controls";
import { ScanControls } from "@/components/scan-controls";
import { getActiveScan, getGmailConnection, getUserSettings } from "@/lib/db/repo";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  // gmail_connections is only reachable with the admin client (no RLS policies).
  const [connection, settings, scan] = userId
    ? await Promise.all([getGmailConnection(createAdminClient(), userId), getUserSettings(supabase, userId), getActiveScan(supabase)])
    : [null, null, null];

  const activeScan: ActiveScan | null =
    scan && (scan.status === "listing" || scan.status === "processing")
      ? {
          id: scan.id,
          status: scan.status,
          processed: scan.processed,
          jobRelated: scan.job_related,
          appsCreated: scan.apps_created,
          appsUpdated: scan.apps_updated,
          total: scan.total,
        }
      : null;

  return (
    <>
      <Header connection={connection} lastScanAt={settings?.last_scan_at} />
      <main className="mx-auto w-full max-w-5xl space-y-6 p-8">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <ScanControls activeScan={activeScan} />
        <p className="text-sm text-muted-foreground">The applications table arrives in the next phase.</p>
      </main>
    </>
  );
}
