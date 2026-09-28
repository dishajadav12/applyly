import { NextResponse } from "next/server";
import { decrypt } from "@/lib/crypto";
import { deleteGmailConnection, getGmailConnection } from "@/lib/db/repo";
import { revokeToken } from "@/lib/gmail/google";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Revokes the Google token, then deletes the stored connection. */
export async function POST() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const connection = await getGmailConnection(admin, userId);
  if (!connection) return NextResponse.json({ ok: true });

  try {
    const revoked = await revokeToken(decrypt(connection.refresh_token_enc));
    // Keep the row if Google could not be reached, so the user can retry and the token is never orphaned.
    if (!revoked) return NextResponse.json({ error: "Could not revoke access at Google" }, { status: 502 });
  } catch {
    return NextResponse.json({ error: "Could not revoke access at Google" }, { status: 502 });
  }

  await deleteGmailConnection(admin, userId);
  return NextResponse.json({ ok: true });
}
