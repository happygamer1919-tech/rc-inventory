-- 0089_sale_lines_and_slip_insert_lock.sql
-- RC Inventory phase 3, card P3-331. Found by the bug check of 2026-10-21
-- (findings 0 and 1): two direct requests that go around the slip screens.
--
-- THE TWO DEFECTS
--
--   1. (finding 0) 0075 section 2 left outbound_lines_insert and
--      outbound_lines_update on is_owner(), and no later migration replaced them
--      (0088 dropped only the delete policy). With the owner's session
--        PATCH /rest/v1/outbound_lines?id=eq.<line>  { "quantity": 0.01 }
--      gave the rest of the quantity back to stock (stock is batches minus
--      outbound lines) with no history row and no trace on the slip, and a POST
--      added a line with no overdraw check and no history row. 0088's header said
--      0087 already held the owner to the screens for inserts and updates; that
--      was true of batches and order lines, not of sale lines.
--   2. (finding 1) outbound_issues_insert (0067) admits every active account, and
--      the INSERT branch of outbound_issues_guard (0082, 0083, 0085) checked
--      created_by, status, the mode shape and the buyer, but not issued_at,
--      created_at or reference. 0083 (P3-274) locked those three only on UPDATE.
--      So
--        POST /rest/v1/outbound_issues
--        { ..., "issued_at": "2025-01-01", "reference": "IES-2026-0001-X" }
--      followed by POST /rest/v1/rpc/outbound_issue_take_stock (which accepts the
--      creator of an empty slip) saved a slip dated in the past, with a number of
--      the caller's choice, and took the stock on it.
--
-- WHAT IT CHANGES
--
--   policy   outbound_lines_insert             dropped, NOT created again
--   policy   outbound_lines_update             dropped, NOT created again
--   function public.outbound_next_reference()  NEW, the next slip number
--   function public.outbound_issues_guard()    body only, same trigger
--   comment  public.outbound_issue_take_stock  text only, body untouched
--
-- SALE LINES. EVERY WRITER WAS READ (grep of supabase/migrations, lib/, app/,
-- components/, scripts/ and tests/ for outbound_lines):
--
--   outbound_issue_take_stock (0085)   insert   SECURITY DEFINER since 0075, so
--                                               its insert never depended on the
--                                               caller's insert policy
--   create_outbound_issue (0067),
--   create_direct_client_issue (0084)  call outbound_issue_take_stock, write no
--                                      line themselves
--   no screen, server action, route or function updates a line; the screens only
--   read lines (lib/data/outbound.ts, facturare-create.ts, product-movement.ts,
--   movements-read.ts, stock-read.ts)
--   seeds (scripts/seed-test-*.mjs, scripts/guide/seed.mjs) write with the
--   service role, which bypasses row level security
--
-- So both policies go without replacement, the shape 0087 gave batches and
-- order lines: with row level security on and no insert or update policy, a
-- signed-in POST is refused and a signed-in PATCH matches no row, for every
-- role, the owner included. A line is added only by outbound_issue_take_stock,
-- under its locks, its overdraw check and its history row, and nothing signed in
-- changes a line once written.
--
-- THE SLIP INSERT, for a signed-in caller (owner included):
--   created_at, issued_at   empty is filled with now(); any other value than
--                           now() (the moment of the transaction, the column
--                           default) is refused
--   reference               empty is filled with the next number; any other
--                           value than the next number is refused
--
-- THE NEXT NUMBER is public.outbound_next_reference(), the app's numbering
-- (lib/data/outbound.ts nextOutboundReference) written once more in SQL: prefix
-- IES-<year in Chisinau>-, the highest reference with that prefix in text order,
-- the part after the prefix read as a whole number plus one (anything that is not
-- a whole number counts as none, as Number() gives NaN there), at least four
-- digits. Both slip doors receive exactly that string from the screen, so they
-- pass. The guard takes a transaction advisory lock before it reads the number,
-- so two slips saved at the same moment are numbered one after the other: the
-- second waits for the first to commit, then reads the new highest number. Before
-- this file the second one failed on outbound_issues_reference_unique; now, when
-- the screen's number was taken in between, it is refused with a sentence asking
-- to save again (P0001, which lib/data/outbound-actions.ts shows as written).
--
-- The function is SECURITY DEFINER so the number never depends on which slips the
-- caller may read, and it only reads. Granted to authenticated (the guard runs as
-- the caller and calls it), revoked from public and anon.
--
-- A CALLER WITH NO IDENTITY IS A SERVER ROLE and is not guarded, the convention
-- of 0075, 0077, 0082, 0084, 0085 and 0087: the test seeds write with the service
-- role and a migration that repairs data runs with no token.
--
-- WHAT IT DOES NOT CHANGE. outbound_lines_select (0070), the outbound_issues
-- policies (0067), the UPDATE half of the guard (0085 word for word), every
-- function signature and grant, the bodies of outbound_issue_take_stock,
-- create_outbound_issue, create_direct_client_issue and ship_outbound_issue, the
-- screens. An active account manager or owner saves a project slip and a walk-in
-- sale and ships it exactly as before.
--
-- WHAT IT REMOVES: no table, no row, no column. There is NO DROP TABLE, NO
-- TRUNCATE, NO DELETE and NO UPDATE or INSERT of a row in this file. The two
-- `drop policy if exists` remove rules about rows and remove no row (CLAUDE.md
-- 8.6); neither is created again, which takes a right away from signed-in callers
-- and touches no row. No existing row is read or changed when it applies: the new
-- checks run only on a new insert.
--
-- MERGE IS APPLY. Merging this file applies it to the PRODUCTION database within
-- about two minutes (CLAUDE.md 8.0, ruling R-124). Every function keeps its
-- signature and the deployed build already sends the next number, so it keeps
-- working in that window.
--
-- PROVEN BEFORE MERGE by `npm run check:migrations`, which applies it to a
-- throwaway postgres and runs
-- scripts/poc-free/local-db/assertions/0089_sale_lines_and_slip_insert_lock.sql.

begin;


-- ===========================================================================
-- 1. SALE LINES: NOBODY SIGNED IN ADDS OR CHANGES ONE DIRECTLY
-- ===========================================================================

drop policy if exists outbound_lines_insert on public.outbound_lines;
drop policy if exists outbound_lines_update on public.outbound_lines;


-- ===========================================================================
-- 2. THE NEXT SLIP NUMBER, THE APP'S NUMBERING ON THE SERVER
-- ===========================================================================

create or replace function public.outbound_next_reference()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prefix text := 'IES-' || to_char(now() at time zone 'Europe/Chisinau', 'YYYY') || '-';
  v_last   text;
  v_tail   text;
  v_next   numeric := 1;
  v_digits text;
begin
  select oi.reference into v_last
  from public.outbound_issues oi
  where oi.reference like v_prefix || '%'
  order by oi.reference desc
  limit 1;

  if v_last is not null then
    v_tail := btrim(substr(v_last, length(v_prefix) + 1));
    if v_tail ~ '^[0-9]+$' then
      v_next := v_tail::numeric + 1;
    end if;
  end if;

  v_digits := v_next::text;
  if length(v_digits) < 4 then
    v_digits := lpad(v_digits, 4, '0');
  end if;

  return v_prefix || v_digits;
end;
$$;

comment on function public.outbound_next_reference() is
  'Card P3-331 (0089). The next slip number, computed the way lib/data/outbound.ts nextOutboundReference computes it: prefix IES-<year in Europe/Chisinau>-, the highest reference with that prefix in text order, the rest read as a whole number plus one (1 when there is none or it is not a whole number), at least four digits. SECURITY DEFINER so the result does not depend on what the caller may read; read only. outbound_issues_guard calls it, under a transaction advisory lock, for every signed-in insert.';

revoke all on function public.outbound_next_reference() from public;
revoke all on function public.outbound_next_reference() from anon;
grant execute on function public.outbound_next_reference() to authenticated;


-- ===========================================================================
-- 3. THE SLIP GUARD: A NEW SLIP IS DATED NOW AND TAKES THE NEXT NUMBER
-- ===========================================================================
--
-- 0085's body word for word, plus the P3-331 block at the end of the INSERT
-- branch.

create or replace function public.outbound_issues_guard()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_next text;
begin
  -- A server role (no identity) is not guarded: seeds and data repairs.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by := auth.uid();
    end if;

    if new.created_by <> auth.uid() then
      raise exception 'O ieșire nouă se înregistrează numai pe numele contului care o salvează.'
        using errcode = '42501';
    end if;

    if new.status <> 'awaiting_shipment' or new.shipped_at is not null then
      raise exception 'O ieșire nouă începe ca neexpediată. Expedierea se confirmă separat.'
        using errcode = '42501';
    end if;

    if new.issue_mode = 'project'
       and (new.project_id is null or new.client_id is not null or new.pickup_date is not null) then
      raise exception 'O ieșire pe proiect are un proiect și nu are client direct sau dată de ridicare.'
        using errcode = '42501';
    end if;

    if new.issue_mode = 'direct_client'
       and (new.client_id is null or new.pickup_date is null or new.project_id is not null) then
      raise exception 'O vânzare la tejghea are un client și o dată de ridicare și nu are proiect.'
        using errcode = '42501';
    end if;

    -- P3-305. A switched-off buyer is refused here too, not only in
    -- create_direct_client_issue, so a direct POST cannot save the slip.
    if new.issue_mode = 'direct_client'
       and not exists (select 1 from public.clients c where c.id = new.client_id and c.active) then
      raise exception 'Clientul ales este dezactivat. Alege alt client sau reactivează-l din fișa lui.'
        using errcode = 'P0001';
    end if;

    -- P3-331. A new slip is dated by the server: the moment it is saved.
    if new.created_at is null then
      new.created_at := now();
    end if;

    if new.issued_at is null then
      new.issued_at := now();
    end if;

    if new.created_at is distinct from now() or new.issued_at is distinct from now() then
      raise exception 'O ieșire nouă poartă data și ora la care se salvează. Nu se poate alege altă dată.'
        using errcode = '42501';
    end if;

    -- P3-331. A new slip takes the next number in the series. The lock makes two
    -- slips saved at the same moment take their numbers one after the other.
    perform pg_advisory_xact_lock(hashtext('rc.outbound_next_reference'));
    v_next := public.outbound_next_reference();

    if new.reference is null or btrim(new.reference) = '' then
      new.reference := v_next;
    elsif new.reference is distinct from v_next then
      raise exception 'Numărul ieșirii nu este următorul din serie (%). Reîncarcă pagina și salvează din nou.', v_next
        using errcode = 'P0001';
    end if;

    return new;
  end if;

  -- UPDATE
  if new.issue_mode is distinct from old.issue_mode then
    raise exception 'Tipul ieșirii (proiect sau vânzare la tejghea) nu se mai poate schimba după salvare.'
      using errcode = '42501';
  end if;

  if new.client_id is distinct from old.client_id then
    raise exception 'Clientul unei ieșiri nu se mai poate schimba după salvare.'
      using errcode = '42501';
  end if;

  if new.project_id is distinct from old.project_id then
    raise exception 'Proiectul unei ieșiri nu se mai poate schimba după salvare.'
      using errcode = '42501';
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'Autorul unei ieșiri nu se mai poate schimba.'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status or new.shipped_at is distinct from old.shipped_at then
    if not (
      old.status = 'awaiting_shipment'
      and new.status = 'shipped'
      and coalesce(current_setting('rc.outbound_ship', true), '') = old.id::text
    ) then
      raise exception 'Starea unei ieșiri se schimbă numai prin confirmarea expedierii.'
        using errcode = '42501';
    end if;
  end if;

  -- P3-274. The number and the dates of a saved slip never change.
  if new.reference is distinct from old.reference then
    raise exception 'Numărul ieșirii nu se mai poate schimba după salvare.'
      using errcode = '42501';
  end if;

  if new.issued_at is distinct from old.issued_at then
    raise exception 'Data emiterii unei ieșiri nu se mai poate schimba.'
      using errcode = '42501';
  end if;

  if new.pickup_date is distinct from old.pickup_date then
    raise exception 'Data de ridicare a unei ieșiri nu se mai poate schimba după salvare.'
      using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'Data creării unei ieșiri nu se mai poate schimba.'
      using errcode = '42501';
  end if;

  if new.id is distinct from old.id then
    raise exception 'Identificatorul unei ieșiri nu se mai poate schimba.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.outbound_issues_guard() is
  'Cards P3-266 (0082), P3-274 (0083), P3-305 (0085) and P3-331 (0089). BEFORE INSERT OR UPDATE on public.outbound_issues, for a signed-in caller (owner included; a server role with no identity is not guarded). On UPDATE refuses any change of issue_mode, client_id, project_id, created_by, reference, issued_at, pickup_date, created_at or id, and any change of status or shipped_at other than awaiting_shipment to shipped made inside public.ship_outbound_issue (transaction-local flag rc.outbound_ship equal to the row id); updated_at stays free for its own trigger. On INSERT refuses a row the two doors would not write: created_by not the caller (an empty one is filled with the caller), a status other than awaiting_shipment, a project slip without a project or with a client or pickup date, a walk-in slip without a client or pickup date or with a project, (P3-305) a walk-in slip whose client is not active, and (P3-331) a created_at or issued_at other than now() (empty ones are filled with now()) or a reference other than public.outbound_next_reference(), read under a transaction advisory lock (an empty one is filled with it). Closes the direct PATCH that retyped a walk-in sale as a project sale, the one that renumbered or redated a saved slip, the direct POST of a walk-in slip to a switched-off buyer, and the direct POST of a backdated slip with a chosen number.';

revoke all on function public.outbound_issues_guard() from public;
revoke all on function public.outbound_issues_guard() from anon;


-- ===========================================================================
-- 4. TAKE STOCK IS NOW THE ONLY WAY A SALE LINE IS WRITTEN
-- ===========================================================================
--
-- Comment only: the body of 0085 is not touched.

comment on function public.outbound_issue_take_stock(uuid, jsonb) is
  'Card P3-118, ruling R-215: THE ONE SUBTRACTION, called by both outbound doors. CARD P3-195 (0075): SECURITY DEFINER; refuses a token holder with no active profile, an issue that does not exist and an issue that is not awaiting_shipment. CARD P3-199 (0077): a caller who is not the owner is also refused unless they created the slip and it has no line yet. CARD P3-305 (0085): a signed-in caller, owner included, is refused on a walk-in slip whose client is not active. CARD P3-331 (0089): outbound_lines has no insert and no update policy any more, so this routine is the only way a signed-in caller, the owner included, writes a sale line, and nothing signed in changes one. The locks, the summed overdraw check, the INSUFFICIENT_STOCK contract, the lines insert and the history row are unchanged.';

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect on outbound_lines one policy, select; no insert, update or delete
-- policy. Expect the trigger outbound_issues_guard, enabled; the guard body names
-- P3-331; outbound_next_reference SECURITY DEFINER with an ACL naming
-- authenticated and not anon.

select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'outbound_lines'
order by policyname;

select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.outbound_issues'::regclass and not tgisinternal
order by tgname;

select p.proname, p.prosecdef as security_definer,
       position('P3-331' in p.prosrc) > 0 as names_p3_331,
       pg_catalog.array_to_string(p.proacl, E'\n') as acl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('outbound_issues_guard', 'outbound_next_reference')
order by p.proname;
