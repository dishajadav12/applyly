import { Header } from "@/components/header";
import { getGmailConnection } from "@/lib/db/repo";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  // gmail_connections is only reachable with the admin client (no RLS policies).
  const connection = userId ? await getGmailConnection(createAdminClient(), userId) : null;

  return (
    <>
      <Header connection={connection} />
      <main className="mx-auto w-full max-w-5xl p-8">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">Scanning and the applications table arrive in later phases.</p>
      </main>
    </>
  );
}
