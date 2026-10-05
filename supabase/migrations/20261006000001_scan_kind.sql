-- 'outreach' scans only collect recruiter outreach from sent mail: they never classify, match,
-- create applications, mark messages processed, or move user_settings.last_scan_at.
alter table public.scans
  add column kind text not null default 'full' check (kind in ('full', 'outreach'));
