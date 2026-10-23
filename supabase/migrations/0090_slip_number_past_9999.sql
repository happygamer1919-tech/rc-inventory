-- 0090_slip_number_past_9999.sql
-- RC Inventory phase 3, card P3-334. Found by the bug check of 2026-10-22
-- (severity medium, verified on origin/main after 0089).
--
-- THE DEFECT
--
--   public.outbound_next_reference() (0089 section 2) and the app's
--   lib/data/outbound.ts nextOutboundReference both found the last slip number by
--   taking the highest reference with the prefix IES-<year>- in TEXT order. In
--   text order IES-2026-9999 sorts above IES-2026-10000. So once slip 10000
--   exists, both compute 10000 again, the 0089 guard passes (screen and server
--   agree), and the insert dies on outbound_issues_reference_unique. From then on
--   no project slip and no walk-in sale could be saved for the rest of the year.
--   The 0089 assertion proved 9999 to 10000 only, never the step after.
--
--   A second, smaller edge of the same rule: when the highest reference in text
--   order had a tail that is not a whole number (IES-2026-0041-X), the series
--   restarted at 0001, which is already taken in any year with slips.
--
-- WHAT IT CHANGES
--
--   function public.outbound_next_reference()  body only, same signature
--
--   The last number is now the highest NUMERIC value of the part after the
--   prefix, among references of this year whose part after the prefix is all
--   digits. A reference whose tail is not all digits is ignored: it neither
--   counts as the highest nor restarts the series. Plus one, at least four
--   digits, as before (0001 to 9999, then 10000, 10001 and on).
--
--   The app's nextOutboundReference now calls this function (rpc), so the screen
--   and the guard read ONE rule and cannot disagree again.
--
-- WHAT IT DOES NOT CHANGE. outbound_issues_guard (0089 word for word: it still
-- takes its advisory lock and calls this function), outbound_issue_take_stock,
-- create_outbound_issue, create_direct_client_issue, ship_outbound_issue, every
-- policy, every grant (repeated below with the same values as 0089), SECURITY
-- DEFINER and search_path. For every year with fewer than 10000 slips and only
-- numeric tails the result is exactly what 0089 returns. No existing slip is
-- renumbered.
--
-- WHAT IT REMOVES: nothing. There is NO DROP, NO TRUNCATE, NO DELETE and NO
-- UPDATE or INSERT of a row in this file. It replaces one read-only function.
--
-- MERGE IS APPLY. Merging this file applies it to the PRODUCTION database within
-- about two minutes (CLAUDE.md 8.0, ruling R-124). The function keeps its
-- signature, and the build deployed before this merge reads the same numbers
-- for every series below 10000, so nothing breaks in that window.
--
-- PROVEN BEFORE MERGE by `npm run check:migrations`, which applies it to a
-- throwaway postgres and runs
-- scripts/poc-free/local-db/assertions/0090_slip_number_past_9999.sql.

begin;


-- ===========================================================================
-- THE NEXT SLIP NUMBER, BY NUMERIC VALUE
-- ===========================================================================

create or replace function public.outbound_next_reference()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prefix text := 'IES-' || to_char(now() at time zone 'Europe/Chisinau', 'YYYY') || '-';
  v_last   numeric;
  v_next   numeric := 1;
  v_digits text;
begin
  -- P3-334. The highest number by value, not by text: 10000 is above 9999.
  -- A tail that is not all digits is left out of the series.
  select max(substr(oi.reference, length(v_prefix) + 1)::numeric) into v_last
  from public.outbound_issues oi
  where oi.reference like v_prefix || '%'
    and substr(oi.reference, length(v_prefix) + 1) ~ '^[0-9]+$';

  if v_last is not null then
    v_next := v_last + 1;
  end if;

  v_digits := v_next::text;
  if length(v_digits) < 4 then
    v_digits := lpad(v_digits, 4, '0');
  end if;

  return v_prefix || v_digits;
end;
$$;

comment on function public.outbound_next_reference() is
  'Cards P3-331 (0089) and P3-334 (0090). The next slip number: prefix IES-<year in Europe/Chisinau>-, the highest NUMERIC value of the part after the prefix among this year''s references whose part after the prefix is all digits (others are ignored), plus one (1 when there is none), at least four digits, so 9999 is followed by 10000 and 10000 by 10001. lib/data/outbound.ts nextOutboundReference calls it, so the screen and the guard share one rule. SECURITY DEFINER so the result does not depend on what the caller may read; read only. outbound_issues_guard calls it, under a transaction advisory lock, for every signed-in insert.';

revoke all on function public.outbound_next_reference() from public;
revoke all on function public.outbound_next_reference() from anon;
grant execute on function public.outbound_next_reference() to authenticated;

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect outbound_next_reference SECURITY DEFINER, its body naming P3-334, an
-- ACL naming authenticated and not anon, and the guard still naming P3-331.

select p.proname, p.prosecdef as security_definer,
       position('P3-334' in p.prosrc) > 0 as names_p3_334,
       position('P3-331' in p.prosrc) > 0 as names_p3_331,
       pg_catalog.array_to_string(p.proacl, E'\n') as acl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('outbound_issues_guard', 'outbound_next_reference')
order by p.proname;
