-- 0002_rc_docs_bucket.sql
-- RC Inventory phase 2, card P2-04. The private document bucket and its policies.
--
-- Applied by EXECUTOR under ruling R-001 (CLAUDE.md section 8), on a database
-- holding zero real client data. Runs as one transaction.
--
-- 0001 created every application table. It did not create the storage bucket,
-- because P2-01's table list was explicit and carried none. This file adds it,
-- plus the row level security policies on storage.objects that keep it private.
--
-- THE BUCKET IS PRIVATE AND STAYS PRIVATE. `public = false` means Supabase
-- serves nothing from it without a signed URL. A supplier confirmation carries
-- prices, terms and counterparty names; a public bucket URL is guessable
-- forever and cannot be recalled once it leaks.

begin;

-- ===========================================================================
-- 1. THE BUCKET
-- ===========================================================================
--
-- on conflict do nothing rather than a bare insert: a bucket that already
-- exists (created by hand in the dashboard, say) must not fail the migration
-- and must not be flipped to a different visibility behind anyone's back.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rc-docs',
  'rc-docs',
  false,
  -- 10 MB, the same ceiling the upload form refuses at. Enforced here too,
  -- because a client-side check is a courtesy and a server-side one is a rule.
  10485760,
  array['application/pdf', 'image/png', 'image/jpeg']
)
on conflict (id) do nothing;


-- ===========================================================================
-- 2. POLICIES ON storage.objects
-- ===========================================================================
--
-- RLS is already enabled on storage.objects by Supabase. These policies scope
-- what an authenticated user may do INSIDE the rc-docs bucket, and say nothing
-- about any other bucket.
--
-- No policy is granted to anon, anywhere. There is no anonymous read of a
-- supplier document, signed URL or not.
--
-- Deletion is deliberately absent, for every role including owner. A document
-- is the evidence behind an inbound order: an order that says a document
-- arrived, pointing at an object that no longer exists, is worse than either
-- fact alone. Removing one is a deliberate act through the dashboard, not a
-- button someone can reach on a bad day.

drop policy if exists rc_docs_select on storage.objects;
create policy rc_docs_select on storage.objects
  for select to authenticated
  using (bucket_id = 'rc-docs');

drop policy if exists rc_docs_insert on storage.objects;
create policy rc_docs_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'rc-docs');

drop policy if exists rc_docs_update on storage.objects;
create policy rc_docs_update on storage.objects
  for update to authenticated
  using (bucket_id = 'rc-docs')
  with check (bucket_id = 'rc-docs');

commit;


-- ===========================================================================
-- 3. VERIFICATION
-- ===========================================================================
-- Runs after COMMIT. Expect one row: rc-docs, public = false, with the size
-- limit and the three mime types. Then three policies named rc_docs_*.

select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'rc-docs';

select policyname, cmd, roles
from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like 'rc_docs_%'
order by policyname;
