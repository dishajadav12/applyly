import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { STATUS_DISPLAY_ORDER } from "@/lib/config";
import { normalizeCompanyKey } from "@/lib/extract/company";
import * as repo from "@/lib/db/repo";
import type { Overrides } from "@/lib/match/derive";
import { normalizeRoleKey, rederiveApplication } from "@/lib/scan/step";
import { createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/db/types.gen";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.sub) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const [application, events] = await Promise.all([
    repo.getApplication(supabase, id),
    repo.listEventsForApplication(supabase, id),
  ]);
  // RLS scopes both queries to the caller; a foreign or missing id just comes back null.
  if (!application) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ application, events });
}

// "company" is deliberately not one of derive.ts's overridable fields (A8's "Derived fields" list
// covers only role/appliedAt/status/recruiterEmail — company is fixed at creation, never
// recomputed from events), so it has no "reset to auto" and is always a direct edit.
const EDITABLE_FIELDS = ["company", "role", "appliedAt", "status", "recruiterEmail"] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set"), field: z.enum(EDITABLE_FIELDS), value: z.string().min(1) }),
  z.object({ action: z.literal("reset"), field: z.enum(EDITABLE_FIELDS.filter((f) => f !== "company") as Exclude<EditableField, "company">[]) }),
]);

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.sub) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const application = await repo.getApplication(supabase, id);
  if (!application) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (parsed.data.action === "reset") {
    const overrides = { ...((application.overrides as Overrides | null) ?? {}) };
    delete overrides[parsed.data.field];
    await repo.updateApplication(supabase, id, { overrides });
    await rederiveApplication(supabase, id);
    return NextResponse.json({ application: await repo.getApplication(supabase, id) });
  }

  const { field, value } = parsed.data;
  const patch: TablesUpdate<"applications"> = {};

  if (field === "company") {
    patch.company = value;
    patch.company_key = normalizeCompanyKey(value);
  } else if (field === "role") {
    patch.role = value;
    patch.role_key = normalizeRoleKey(value);
    patch.overrides = { ...((application.overrides as Overrides | null) ?? {}), role: true };
  } else if (field === "appliedAt") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    patch.applied_at = date.toISOString();
    patch.applied_date_source = "explicit";
    patch.overrides = { ...((application.overrides as Overrides | null) ?? {}), appliedAt: true };
  } else if (field === "status") {
    if (!(STATUS_DISPLAY_ORDER as readonly string[]).includes(value)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    patch.status = value;
    patch.overrides = { ...((application.overrides as Overrides | null) ?? {}), status: true };
  } else if (field === "recruiterEmail") {
    patch.primary_recruiter_email = value;
    patch.overrides = { ...((application.overrides as Overrides | null) ?? {}), recruiterEmail: true };
  }

  const updated = await repo.updateApplication(supabase, id, patch);
  return NextResponse.json({ application: updated });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.sub) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  await repo.deleteApplication(supabase, id);
  return NextResponse.json({ ok: true });
}
