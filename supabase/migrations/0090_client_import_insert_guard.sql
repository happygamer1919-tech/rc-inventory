-- 0090_client_import_insert_guard.sql
-- RC Inventory phase 3, card P3-338. Found by the bug check of 2026-10-22
-- (finding 6): two people importing clients at the same time can both create the
-- same client.
--
-- THE DEFECT
--
--   The "one import per kind" lock (lib/import-lock.ts) lives in the browser's
--   localStorage, so it only stops a second tab of the same browser. The server
--   reads the stored clients once, plans, then inserts row by row, and the only
--   unique key on public.clients is the fiscal code (0013). Two operators who
--   upload overlapping files, or one operator on two machines, both read "not
--   stored" for the same email and both insert it.
--
-- WHAT IT CHANGES
--
--   function public.import_insert_client(jsonb, text, text, text, text[])   NEW
--
--   That is all: ONE NEW FUNCTION. No table, column, index, policy or trigger is
--   added, changed or dropped, and no row is removed.
--
-- WHAT THE FUNCTION DOES, IN ONE TRANSACTION
--
--   1. refuses anyone who is not the owner (42501), as the import screens do;
--   2. takes a transaction advisory lock, so every client import writer, the
--      client import and the lead import alike, goes through here ONE ROW AT A
--      TIME; the second waits until the first has committed;
--   3. looks for a stored client the row would duplicate, by the keys the import
--      plans use, each key only when the caller sends it:
--        p_email_key    the email (both imports)
--        p_name_key +   the name plus the last 8 digits of the phone, the client
--        p_phone_key    import's second key (lib/data/client-import-plan.ts): a
--                       row WITH an email matches only a stored client WITHOUT
--                       one, a row without an email matches any
--        p_phone_forms  the phone alone, the lead import's second key
--                       (lib/data/lead-import-plan.ts): the digits of the stored
--                       phone, with a leading 00 dropped, equal one of the forms
--                       the caller lists for the canonical number
--      an active client wins over a switched-off one;
--   4. when it finds one, writes nothing and answers
--        {"duplicate": {"id", "name", "active", "by"}}   by = email | phone | namePhone
--      otherwise inserts the row and answers {"id": "<new client id>"}.
--
-- WHY THE CHECK AND THE INSERT ARE ONE FUNCTION. Through PostgREST every request
-- is its own transaction on a pooled connection. A transaction lock is released
-- when the request ends, and a session lock cannot be held across requests (the
-- unlock may land on another connection and the lock would stay for good). So a
-- lock "for the whole batch" is not available; the lock that works is the one
-- taken in the same transaction as the insert, which is what this does. The
-- insert is the same row the app inserted before, now written by the function:
-- jsonb_populate_record with a column list taken from the keys of the row, so a
-- column the app does not send keeps its default, exactly as before.
--
-- THE IDNO needs nothing here: clients_fiscal_code_unique (0013) already refuses
-- a second client with the same IDNO, and the error comes out of this function
-- as the same 23505 the app already translates.
--
-- SECURITY INVOKER ON PURPOSE. The insert runs as the caller, so the policy
-- clients_insert (0076) and the triggers on public.clients apply exactly as for
-- a direct insert; the function only adds the lock and the duplicate check. The
-- owner reads every client, so the check sees every client.
--
-- THE APP IN THE MINUTES BEFORE THIS LANDS. lib/data/client-actions.ts calls the
-- function for the two imports only, and falls back to the plain insert when the
-- function does not exist yet (PostgREST PGRST202), so no import breaks between
-- the code and the migration.
--
-- THE DESTRUCTIVE-STATEMENT DECLARATION, per CLAUDE.md 8.6: none. The file is
-- one CREATE OR REPLACE FUNCTION, one COMMENT and the grants of that function. No
-- DROP, no TRUNCATE, no DELETE, no UPDATE, no row removed.

begin;

create or replace function public.import_insert_client(
  p_row          jsonb,
  p_email_key    text,
  p_name_key     text,
  p_phone_key    text,
  p_phone_forms  text[] default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_cols text;
  v_id   uuid;
  v_dup  record;
  v_mail text := nullif(p_email_key, '');
  v_name text := nullif(p_name_key, '');
  v_tail text := nullif(p_phone_key, '');
  v_forms text[] := case when coalesce(cardinality(p_phone_forms), 0) > 0 then p_phone_forms end;
begin
  if not public.is_owner() then
    raise exception 'Doar administratorul poate importa clienti.' using errcode = '42501';
  end if;

  if p_row is null or jsonb_typeof(p_row) <> 'object' or p_row = '{}'::jsonb then
    raise exception 'import_insert_client: p_row must be a JSON object with at least one column'
      using errcode = '22023';
  end if;

  -- One lock for every client import writer. It is released when this call's
  -- transaction ends, which is after the insert has committed.
  perform pg_advisory_xact_lock(hashtext('rc.client_import_insert'));

  if v_mail is not null or v_forms is not null or (v_name is not null and v_tail is not null) then
    select m.id, m.name, m.active, m.matched_by
      into v_dup
    from (
      select c.id, c.name, c.active, c.created_at,
             case
               when v_mail is not null and lower(btrim(coalesce(c.email, ''))) = v_mail then 'email'
               when v_forms is not null
                    and regexp_replace(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), '^00', '') = any (v_forms)
                 then 'phone'
               else 'namePhone'
             end as matched_by
      from public.clients c
      where (v_mail is not null and lower(btrim(coalesce(c.email, ''))) = v_mail)
         or (v_forms is not null
             and regexp_replace(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), '^00', '') = any (v_forms))
         or (v_name is not null
             and v_tail is not null
             and lower(regexp_replace(btrim(c.name), '\s+', ' ', 'g')) = v_name
             and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 8) = v_tail
             and (v_mail is null or btrim(coalesce(c.email, '')) = ''))
    ) m
    order by m.active desc,
             case m.matched_by when 'email' then 0 when 'phone' then 1 else 2 end,
             m.created_at, m.id
    limit 1;

    if found then
      return jsonb_build_object(
        'duplicate',
        jsonb_build_object(
          'id', v_dup.id,
          'name', v_dup.name,
          'active', v_dup.active,
          'by', v_dup.matched_by
        )
      );
    end if;
  end if;

  select string_agg(format('%I', k), ', ' order by k)
    into v_cols
  from jsonb_object_keys(p_row) as k;

  execute format(
    'insert into public.clients (%1$s) select %1$s from jsonb_populate_record(null::public.clients, $1) returning id',
    v_cols
  ) into v_id using p_row;

  return jsonb_build_object('id', v_id);
end;
$$;

comment on function public.import_insert_client(jsonb, text, text, text, text[]) is
  'Card P3-338 (0090). Inserts one client for the client and lead imports, one row at a time under a transaction advisory lock, after looking for a stored client the row would duplicate by the keys of the import plans: the email; the name plus the last 8 digits of the phone (client import); the phone alone, as the list of digit forms of the canonical number (lead import). Answers {"id": ...} or {"duplicate": {"id", "name", "active", "by"}}. Owner only (42501). SECURITY INVOKER: the insert runs under the caller''s policies and triggers. Writes no row but the one insert; removes nothing.';

revoke all on function public.import_insert_client(jsonb, text, text, text, text[]) from public;
revoke all on function public.import_insert_client(jsonb, text, text, text, text[]) from anon;
grant execute on function public.import_insert_client(jsonb, text, text, text, text[]) to authenticated;
grant execute on function public.import_insert_client(jsonb, text, text, text, text[]) to service_role;

commit;
