-- 0055_active_profile_table_reads.sql
-- RC Inventory phase 3, card P3-81, goal G32. Follow-up of the two findings the
-- P3-70 report (docs/reports/2026-09-17-executor-g26-document-download-security.md)
-- reported and did not fix: reading a client, project or document row, and adding
-- a new object to rc-docs, need an ACTIVE profile, not merely a signed-in session.
--
-- WHAT IT CHANGES, AND IT REMOVES NOTHING
--
--   policy    clients_select   on public.clients     was: any authenticated session
--                                                    now: an active profile, any role
--   policy    projects_select  on public.projects    was: any authenticated session
--                                                    now: an active profile, any role
--   policy    documents_select on public.documents   was: any authenticated session
--                                                    now: an active profile, any role
--   policy    rc_docs_insert   on storage.objects    was: any authenticated session, inside rc-docs
--                                                    now: an active profile, any role, inside rc-docs
--
-- NO ROW IS INSERTED, UPDATED OR DELETED. NO TABLE IS DROPPED OR TRUNCATED. The
-- four DROPs in this file are DROP POLICY, rules about rows, and each policy is
-- created again with the same name, the same command and the same role in the
-- same transaction. Every client, project, document and stored object stays
-- exactly where it is.
--
-- ===========================================================================
-- WHY
-- ===========================================================================
--
-- 0013, 0016 and 0044 wrote clients_select, projects_select and documents_select
-- as `for select to authenticated using (true)`. 0002 wrote rc_docs_insert as
-- `for insert to authenticated with check (bucket_id = 'rc-docs')`. An account
-- whose profile the owner has switched off (profiles.active = false) keeps a
-- valid access token until it expires, and with it could call the database API
-- directly and read every client record, every project and every document name,
-- or add a new object to the bucket. The app's screens already turn that account
-- away (proxy.ts rewrites every request to the no-access screen), and since 0050
-- it can no longer read a stored file, but the database API is not behind
-- proxy.ts.
--
-- THE PREDICATE IS THE ONE 0050 ALREADY USES FOR rc_docs_select. 0001 section 6:
-- public.current_app_role() returns profiles.role only when profiles.active is
-- true, and null otherwise, including for an account with no profile row at all.
-- `current_app_role() is not null` therefore means "an active operator, owner or
-- account manager". It is SECURITY DEFINER, so reading profiles from inside these
-- policies does not recurse through the profiles policies.
--
-- A REFUSED READ IS AN EMPTY RESULT, NOT AN ERROR. Row level security filters
-- rows on select: the same token now gets HTTP 200 and `[]` from the database API.
-- A refused insert into rc-docs is an error from the storage API.
--
-- WHAT IS NOT CHANGED:
--   - the insert, update and delete policies on clients, projects and documents:
--     they are already owner-only through public.is_owner(), which is active-only;
--   - rc_docs_select (already active-only since 0050), rc_docs_update (its own
--     finding) and rc_docs_delete (owner-only through public.is_owner());
--   - every other table's select policy. categories, units, products, inbound
--     orders and the rest stay `using (true)` by design; this card is scoped to
--     the three tables the P3-70 report names together.
--
-- THE NAMES ARE KEPT, so assertions/0044_documents.sql, which lists the four
-- rc_docs_* policies by name and command, still holds.
--
-- ===========================================================================
--
-- MERGING THIS FILE APPLIES IT TO PRODUCTION, within about two minutes, through
-- the Supabase GitHub app. CLAUDE.md 8.0 and ruling R-124. No application code
-- waits on it: every screen that reads these tables or uploads a document runs as
-- an active profile already, and service role reads bypass row level security.
-- The list and detail functions that read these tables (0018, 0020 to 0023,
-- 0040) are SECURITY INVOKER, so they apply the new rule too: an active caller
-- reads exactly what it read before, and a deactivated one reads nothing through
-- them either. The only sessions it turns away are deactivated ones and accounts
-- with no profile.
--
-- IT RUNS AS ONE TRANSACTION and IS safe to run twice: `drop policy if exists`
-- then `create policy`, four times.
--
-- PROVEN BEFORE IT WAS MERGED by `npm run check:migrations`, which applies it
-- unmodified to a throwaway postgres and then runs
-- scripts/poc-free/local-db/assertions/0055_active_profile_table_reads.sql,
-- and against a real local Supabase stack by
-- tests/e2e/active-profile-table-reads.spec.ts.

begin;

drop policy if exists clients_select on public.clients;

create policy clients_select on public.clients
  for select to authenticated
  using (public.current_app_role() is not null);

drop policy if exists projects_select on public.projects;

create policy projects_select on public.projects
  for select to authenticated
  using (public.current_app_role() is not null);

drop policy if exists documents_select on public.documents;

create policy documents_select on public.documents
  for select to authenticated
  using (public.current_app_role() is not null);

drop policy if exists rc_docs_insert on storage.objects;

create policy rc_docs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'rc-docs'
    and public.current_app_role() is not null
  );

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Runs after COMMIT. Expect four rows: clients_select, projects_select and
-- documents_select, SELECT, {authenticated}, with a qual naming
-- current_app_role(); and rc_docs_insert, INSERT, {authenticated}, with a
-- with_check naming rc-docs and current_app_role().

select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where (schemaname = 'public' and policyname in ('clients_select', 'projects_select', 'documents_select'))
   or (schemaname = 'storage' and tablename = 'objects' and policyname = 'rc_docs_insert')
order by policyname;
