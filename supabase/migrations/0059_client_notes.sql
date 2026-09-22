-- 0059_client_notes.sql
-- RC Inventory phase 3, card P3-90, the platform owner's goal G45 of 2026-09-22.
-- "Ce s-a discutat": a short note about a conversation, logged against a lead or
-- client, shown on the Note tab of its page together with its stage changes, as
-- one timeline.
--
-- WHAT IT ADDS, AND IT CHANGES AND REMOVES NOTHING
--
--   table     public.client_notes                          new, append-only
--   index     client_notes_client_created_idx              (client_id, created_at desc)
--   check     client_notes_body_not_empty                  a note has a character that is not white space
--   policy    client_notes_select                          any ACTIVE profile, as clients_select today
--   policy    client_notes_insert                          the owner only, as clients_insert
--
-- NO UPDATE, NO DELETE, NO DROP AND NO TRUNCATE RUN IN THIS FILE. No existing
-- table, column, function, policy, grant or row is touched. public.clients.notes,
-- the single free text field on the client record, is a different thing and stays
-- exactly as it is.
--
-- WHY. Max, 2026-09-22, quoted: "Notes on the lead, 'Ce s-a discutat'. A new
-- table public.client_notes (id, client_id, body text, created_by, created_at),
-- RLS like the clients table, no delete policy. On the lead and client page: a
-- text box at the top ('Ce s-a discutat'), a 'Salvează' button, and the list of
-- notes below, newest first, with author and date in Romanian format. Saving a
-- note may also set the next step (G44) in the same form, one save. Stage changes
-- from client_stage_history appear in the same list, in a lighter style, so it
-- reads as one timeline."
--
-- THE STAGE HALF OF THE TIMELINE NEEDS NOTHING HERE. public.client_stage_history
-- (uuid) ALREADY EXISTS: 0039 section 5 wrote it, granted it to authenticated,
-- and until this card no screen called it. The application now calls it as it
-- is. This file neither creates nor replaces it, and status_history is not
-- written by anything this card adds: every stage change still goes through
-- set_client_stage.
--
-- 1. THE TABLE. The five columns the goal names, in 0013's order and style.
--    created_by defaults to auth.uid(), the way 0044 fills documents.uploaded_by,
--    so the application never sends an author. client_id cascades on delete like
--    contacts and documents do; clients have no delete policy, so in practice a
--    note outlives nothing.
--
--    AN EMPTY NOTE IS REFUSED HERE AS WELL AS IN THE SERVER ACTION: the body must
--    hold at least one character that is not white space. NOT btrim(body) <> '',
--    the first draft of this file: btrim removes only the space character, so a
--    note of spaces and a line break passed it, and the assertion file caught it.
--    A note keeps its own line breaks inside; the action trims before it writes,
--    so a stored note never starts or ends with white space.
--
-- 2. THE INDEX. The Note tab reads one client's notes newest first, the read
--    status_history_entity_idx exists for in 0001; the foreign key is its first
--    column, so it also covers the cascade.
--
-- 3. ROW LEVEL SECURITY, "LIKE THE CLIENTS TABLE", AS THAT TABLE IS TODAY:
--      select  `public.current_app_role() is not null`, clients_select since 0055
--              replaced 0013's `using (true)`: an active profile, owner or
--              account manager, reads every note; a deactivated one reads none.
--      insert  `public.is_owner()`, clients_insert from 0013, and the author must
--              be the caller, so the name shown beside a note is who wrote it.
--      update  NO POLICY AND NO GRANT. clients has one; a note does not, because
--              a note is written once. History that can be edited is not history,
--              the reason 0001 gives for status_history.
--      delete  NO POLICY AND NO GRANT, as the goal says.
--    anon is revoked explicitly, as 0013 does, although 0009 already closed it.
--
-- MERGING THIS FILE APPLIES IT TO PRODUCTION, within about two minutes, through
-- the Supabase GitHub app. CLAUDE.md 8.0 and ruling R-124. The application reads
-- and writes the table only once the schema gate hasClientNotes sees it; until
-- then the Note tab shows today's empty state.
--
-- IT RUNS AS ONE TRANSACTION and IS safe to run twice: `create table if not
-- exists`, `create index if not exists`, and `drop policy if exists` before each
-- `create policy` (a DROP POLICY removes a rule about rows, never a row; there is
-- none to remove the first time).
--
-- PROVEN BEFORE IT WAS MERGED by `npm run check:migrations`, which applies it
-- unmodified to a throwaway postgres:16 and then runs every assertion file,
-- scripts/poc-free/local-db/assertions/0059_client_notes.sql among them.

begin;


-- ===========================================================================
-- 1. THE TABLE
-- ===========================================================================

create table if not exists public.client_notes (
  id          uuid         primary key default gen_random_uuid(),
  client_id   uuid         not null references public.clients (id) on delete cascade,
  body        text         not null,
  created_by  uuid         default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz  not null default now(),
  constraint client_notes_body_not_empty check (body ~ '[^[:space:]]')
);

comment on table public.client_notes is
  'Card P3-90. Ce s-a discutat: notes about conversations with a lead or client, written once and never edited or deleted. Shown on the Note tab of the client page, merged with public.client_stage_history (0039) into one timeline, newest first.';

comment on column public.client_notes.created_by is
  'Who wrote the note. Filled by auth.uid() by default, and the insert policy requires it to be the caller.';


-- ===========================================================================
-- 2. THE INDEX
-- ===========================================================================

create index if not exists client_notes_client_created_idx
  on public.client_notes (client_id, created_at desc);


-- ===========================================================================
-- 3. ROW LEVEL SECURITY
-- ===========================================================================

revoke all on table public.client_notes from anon;
revoke all on table public.client_notes from authenticated;

grant select, insert on table public.client_notes to authenticated;

alter table public.client_notes enable row level security;

drop policy if exists client_notes_select on public.client_notes;

create policy client_notes_select on public.client_notes
  for select to authenticated
  using (public.current_app_role() is not null);

drop policy if exists client_notes_insert on public.client_notes;

create policy client_notes_insert on public.client_notes
  for insert to authenticated
  with check (public.is_owner() and created_by = auth.uid());

-- No update policy and no delete policy, and neither privilege is granted:
-- a note is history.

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect: public.client_notes with rowsecurity true and exactly two policies,
-- client_notes_select (SELECT) and client_notes_insert (INSERT); authenticated
-- holds SELECT and INSERT only; anon holds nothing.

select c.relname, c.relrowsecurity, count(p.polname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relname = 'client_notes'
group by c.relname, c.relrowsecurity;

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'client_notes'
order by policyname;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'client_notes'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;
