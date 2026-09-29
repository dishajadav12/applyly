import { DashboardBody } from "@/components/dashboard-body";
import { EmptyScanCta } from "@/components/empty-scan-cta";
import { Header } from "@/components/header";
import { ReconnectBanner } from "@/components/reconnect-banner";
import type { ActiveScan } from "@/components/scan-controls";
import { ScanControls } from "@/components/scan-controls";
import { getActiveScan, getGmailConnection, getUserSettings, listApplications, listReviewEvents } from "@/lib/db/repo";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  // gmail_connections is only reachable with the admin client (no RLS policies).
  const [connection, settings, scan, applications, reviewEvents] = userId
    ? await Promise.all([
        getGmailConnection(createAdminClient(), userId),
        getUserSettings(supabase, userId),
        getActiveScan(supabase),
        listApplications(supabase),
        listReviewEvents(supabase),
      ])
    : [null, null, null, [], []];

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

  const neverScanned = applications.length === 0 && !settings?.last_scan_at;

  return (
    <>
      <Header connection={connection} lastScanAt={settings?.last_scan_at} />
      <main className="mx-auto w-full max-w-[1600px] space-y-6 p-8">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        {connection?.status === "needs_reconnect" && <ReconnectBanner />}
        <ScanControls activeScan={activeScan} />

        {neverScanned ? (
          <EmptyScanCta />
        ) : applications.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No applications found yet. Try scanning a wider range.
          </p>
        ) : (
          <DashboardBody applications={applications} reviewEvents={reviewEvents} googleEmail={connection?.google_email} />
        )}
      </main>
    </>
  );
}
