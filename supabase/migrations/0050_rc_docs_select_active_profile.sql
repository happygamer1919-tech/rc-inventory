-- 0050_rc_docs_select_active_profile.sql
-- RC Inventory phase 3, card P3-70. Ivan's finding F1: reading a stored document
-- needs an ACTIVE profile, not merely a signed-in session.
--
-- WHAT IT CHANGES, AND IT REMOVES NOTHING
--
--   policy    rc_docs_select on storage.objects    was: any authenticated session
--                                                  now: an active profile, any role
--
-- NO ROW IS INSERTED, UPDATED OR DELETED. NO TABLE IS DROPPED OR TRUNCATED. The
-- one DROP in this file is DROP POLICY, a rule about rows, and the policy is
-- created again with the same name in the same transaction. Every stored object
-- stays exactly where it is.
--
-- ===========================================================================
-- WHY
-- ===========================================================================
--
-- 0002 wrote rc_docs_select as `for select to authenticated using (bucket_id =
-- 'rc-docs')`. That lets ANY authenticated session read and sign every object in
-- the bucket: supplier confirmations, client contracts, invoices, site photos.
-- An account whose profile the owner has switched off (profiles.active = false)
-- keeps a valid access token until it expires, and with it could call the
-- storage API directly and receive a signed link to any document. The app's
-- screens already turn that account away (proxy.ts rewrites every request to the
-- no-access screen), but the storage API is not behind proxy.ts.
--
-- THE PREDICATE IS THE ONE EVERY OTHER READ ALREADY TRUSTS. 0001 section 6:
-- public.current_app_role() returns profiles.role only when profiles.active is
-- true, and null otherwise, including for an account with no profile row at all.
-- `current_app_role() is not null` therefore means "an active operator, owner or
-- account manager". It is SECURITY DEFINER, so reading profiles from inside a
-- storage policy does not recurse through the profiles policies.
--
-- WHAT IS NOT CHANGED: rc_docs_insert, rc_docs_update and rc_docs_delete. Delete
-- is already owner-only through public.is_owner(), which is active-only too.
-- Insert and update are left for their own finding; this card is about reads.
--
-- THE NAME IS KEPT, so assertions/0044_documents.sql, which lists the four
-- rc_docs_* policies by name and command, still holds.
--
-- ===========================================================================
--
-- MERGING THIS FILE APPLIES IT TO PRODUCTION, within about two minutes, through
-- the Supabase GitHub app. CLAUDE.md 8.0 and ruling R-124. No application code
-- waits on it: every screen that signs a document link runs as an active
-- profile already, so the only sessions it turns away are the ones F1 names.
--
-- IT RUNS AS ONE TRANSACTION and IS safe to run twice: `drop policy if exists`
-- then `create policy`.
--
-- PROVEN BEFORE IT WAS MERGED by `npm run check:migrations`, which applies it
-- unmodified to a throwaway postgres and then runs
-- scripts/poc-free/local-db/assertions/0050_rc_docs_select_active_profile.sql,
-- and against a real local Supabase stack by
-- tests/e2e/document-download-security.spec.ts.

begin;

drop policy if exists rc_docs_select on storage.objects;

create policy rc_docs_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'rc-docs'
    and public.current_app_role() is not null
  );

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Runs after COMMIT. Expect one row: rc_docs_select, SELECT, {authenticated},
-- with a qual naming rc-docs and current_app_role().

select policyname, cmd, roles, qual
from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname = 'rc_docs_select';
