-- Recruiter outreach: one row per (sent message, recipient). Reference list of who the user
-- has emailed at which company. Only IDs, subject and addresses are stored, never the body.

create table public.outreach_emails (
  user_id uuid not null references auth.users on delete cascade,
  message_id text not null,
  to_email text not null,
  to_name text,
  thread_id text not null,
  rfc822_message_id text,                    -- Message-ID header, used for "Open in Gmail" (D16)
  company text not null,
  company_key text not null,                 -- normalized, same as applications.company_key
  subject text not null,
  sent_at timestamptz not null,
  parser_version int not null,
  primary key (user_id, message_id, to_email)
);
create index outreach_emails_user_company_key_idx on public.outreach_emails (user_id, company_key);

alter table public.outreach_emails enable row level security;

create policy outreach_emails_select_own on public.outreach_emails
  for select to authenticated using (user_id = (select auth.uid()));
create policy outreach_emails_insert_own on public.outreach_emails
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy outreach_emails_update_own on public.outreach_emails
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy outreach_emails_delete_own on public.outreach_emails
  for delete to authenticated using (user_id = (select auth.uid()));
