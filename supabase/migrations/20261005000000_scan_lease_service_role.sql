-- Auto-scan (D18) runs without a user session under the secret-key client, where auth.uid()
-- is NULL, so the original claim never matched. Let the service role claim a lease too.
-- Still SECURITY INVOKER: a signed-in user can only claim their own scan's lease.
create or replace function public.claim_scan_lease(scan_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  update public.scans
     set lock_token = gen_random_uuid(),
         locked_until = now() + interval '90 seconds'
   where id = scan_id
     and (
       user_id = (select auth.uid())
       or coalesce((select auth.jwt() ->> 'role'), '') = 'service_role'
     )
     and status = 'processing'
     and (locked_until is null or locked_until < now())
  returning lock_token;
$$;
