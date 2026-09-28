-- Phase 3: initial schema (PROJECT_SPEC.md A5, A4, A8).
-- Email events are the source of truth; application fields are derived from them.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.user_settings (
  user_id uuid primary key references auth.users on delete cascade,
  first_name text,              -- signal: "Hi Disha," from a human sender
  last_scan_at timestamptz
);

create table public.gmail_connections (
  user_id uuid primary key references auth.users on delete cascade,
  google_email text not null,
  refresh_token_enc text not null,   -- AES-256-GCM, key = TOKEN_ENCRYPTION_KEY
  access_token_enc text,
  access_token_expires_at timestamptz,
  scope text not null,               -- granted scopes as reported by Google's tokeninfo endpoint
  status text not null default 'active'
    check (status in ('active', 'needs_reconnect', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  company text not null,
  company_key text not null,          -- normalized for matching
  role text not null default 'Unknown',
  role_key text not null default '',
  req_ids text[] not null default '{}',
  applied_at timestamptz,
  applied_date_source text not null default 'inferred'
    check (applied_date_source in ('explicit', 'inferred')),
  status text not null default 'Applied',   -- TS union, extensible (no check constraint)
  primary_recruiter_email text,
  recruiters jsonb not null default '[]',   -- [{email,name,lastSeen}]
  thread_ids text[] not null default '{}',
  overrides jsonb not null default '{}',    -- {"status":true,...} user-edited fields
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index applications_user_company_key_idx on public.applications (user_id, company_key);

create table public.email_events (
  user_id uuid not null references auth.users on delete cascade,
  message_id text not null,
  thread_id text not null,
  rfc822_message_id text,                    -- Message-ID header, used for "Open in Gmail" (D16)
  application_id uuid references public.applications on delete set null,
  state text not null default 'linked'
    check (state in ('linked', 'review', 'dismissed')),
  user_locked boolean not null default false, -- D15: application_id/state set by the user; scans never change them
  received_at timestamptz not null,
  from_email text not null,
  from_name text,
  subject text not null,
  snippet text,                              -- Gmail snippet (~200 chars) only; never the body
  event_type text not null,
  company text,
  role text,
  req_id text,
  recruiter_email text,
  recruiter_name text,
  ats_source text,
  confidence real not null,
  match_confidence real,
  reasons text[] not null default '{}',
  parser_version int not null,
  primary key (user_id, message_id)
);
create index email_events_user_thread_idx on public.email_events (user_id, thread_id);
create index email_events_user_application_idx on public.email_events (user_id, application_id);

-- Every scanned ID, job-related or not, so rescans skip it.
create table public.processed_messages (
  user_id uuid not null references auth.users on delete cascade,
  message_id text not null,
  parser_version int not null,
  is_job_related boolean not null,
  processed_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

create table public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  range_start timestamptz not null,
  range_end timestamptz not null,
  status text not null
    check (status in ('listing', 'processing', 'done', 'failed', 'cancelled')),
  total int not null default 0,
  processed int not null default 0,
  job_related int not null default 0,
  apps_created int not null default 0,
  apps_updated int not null default 0,
  error text,
  lock_token uuid,
  locked_until timestamptz,                  -- step lease (A4)
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
-- One active scan per user (D9).
create unique index scans_one_active_per_user
  on public.scans (user_id) where status in ('listing', 'processing');

create table public.scan_items (
  scan_id uuid not null references public.scans on delete cascade,
  user_id uuid not null,
  message_id text not null,
  seq int not null,
  status text not null default 'pending'
    check (status in ('pending', 'done', 'error')),
  error text,
  primary key (scan_id, message_id)
);
create index scan_items_scan_status_seq_idx on public.scan_items (scan_id, status, seq);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger gmail_connections_set_updated_at
  before update on public.gmail_connections
  for each row execute function public.set_updated_at();

create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.user_settings      enable row level security;
alter table public.gmail_connections  enable row level security;
alter table public.applications       enable row level security;
alter table public.email_events       enable row level security;
alter table public.processed_messages enable row level security;
alter table public.scans              enable row level security;
alter table public.scan_items         enable row level security;

-- Owner policies (user_id = auth.uid()) on every table EXCEPT gmail_connections,
-- which has RLS enabled and deliberately NO policies: only the admin (secret-key)
-- client can read it. Privileges are also revoked as defense in depth.
do $$
declare
  t text;
begin
  foreach t in array array[
    'user_settings', 'applications', 'email_events',
    'processed_messages', 'scans', 'scan_items'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      t || '_delete_own', t);
  end loop;
end
$$;

revoke all on public.gmail_connections from anon, authenticated;

-- ---------------------------------------------------------------------------
-- New auth user -> user_settings row
-- first_name: Google metadata given_name, else the first word of full_name / name.
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  first text;
begin
  first := nullif(btrim(meta ->> 'given_name'), '');
  if first is null then
    first := nullif(
      split_part(btrim(coalesce(nullif(meta ->> 'full_name', ''), meta ->> 'name', '')), ' ', 1),
      ''
    );
  end if;

  insert into public.user_settings (user_id, first_name)
  values (new.id, first)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RPCs (security invoker: RLS applies)
-- ---------------------------------------------------------------------------

-- Claims the step lease on a scan for 90 seconds (A4). Returns the new lock_token,
-- or NULL if the scan is not processing or another step holds a live lease.
create function public.claim_scan_lease(scan_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  update public.scans
     set lock_token = gen_random_uuid(),
         locked_until = now() + interval '90 seconds'
   where id = scan_id
     and user_id = (select auth.uid())
     and status = 'processing'
     and (locked_until is null or locked_until < now())
  returning lock_token;
$$;

-- Deletes an application; its events go to the review queue and are user-locked,
-- in one transaction (A8). Not relying on "on delete set null" alone.
create function public.delete_application(app_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.email_events
     set application_id = null,
         state = 'review',
         user_locked = true
   where application_id = app_id
     and user_id = (select auth.uid());

  delete from public.applications
   where id = app_id
     and user_id = (select auth.uid());
end;
$$;

revoke execute on function public.claim_scan_lease(uuid) from public, anon;
revoke execute on function public.delete_application(uuid) from public, anon;
grant execute on function public.claim_scan_lease(uuid) to authenticated;
grant execute on function public.delete_application(uuid) to authenticated;
