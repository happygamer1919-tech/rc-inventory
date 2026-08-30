-- 0020_search_clients.sql
-- RC Inventory phase 3, card P3-06. The Clienti list, as one query.
--
-- WHY THIS IS A FUNCTION AND NOT A POSTGREST QUERY. P3-06 asks for ONE search
-- box over name, IDNO, phone and email, diacritic-folded and case-folded, with
-- filtering done server side and pagination at 25.
--
-- The folding is the part PostgREST cannot do. `ilike '%tigla%'` does not match
-- "Țiglă", which is the exact defect phase 1 found on screen and wrote into
-- docs/LEARNINGS.md, and a filter cannot call public.fold_text through the REST
-- interface: PostgREST filters name columns, not expressions. The alternatives
-- were a generated column on every searchable field or this. This keeps ONE
-- definition of the fold, the one migration 0017 created, so what the search box
-- finds and what a backfill matches cannot disagree.
--
-- IT RETURNS THE TOTAL WITH EVERY PAGE, via a window function over the filtered
-- set. A separate count query would be a second round trip that can disagree
-- with the first one under concurrent writes, and the page footer would then
-- claim a number of pages the list cannot produce.
--
-- IT RETURNS THE ACTIVE PROJECT COUNT IN THE SAME PASS, which is the fifth of
-- the five columns P3-06 allows. Counting it per row in a second query is a
-- query per page at best and a query per row at worst.
--
-- SECURITY INVOKER, so RLS still applies exactly as it does to a direct select.
-- This function widens nothing: it is a shape, not a permission.
--
-- NOT APPLIED TO PRODUCTION BY THIS PULL REQUEST. The apply is card P3-27.

begin;

create or replace function public.search_clients(
  p_q      text    default '',
  p_type   text    default null,
  p_status text    default 'active',
  p_limit  integer default 25,
  p_offset integer default 0
)
returns table (
  id              uuid,
  name            text,
  type            public.client_type,
  phone           text,
  active          boolean,
  active_projects bigint,
  total_count     bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with filtered as (
    select c.id, c.name, c.type, c.phone, c.active
    from public.clients c
    where
      -- STATUS. Anything other than the three known values behaves as 'active',
      -- because a stale link with ?stare=nonsense should show a list rather
      -- than an error page.
      (
        p_status = 'toate'
        or (p_status = 'inactive' and c.active = false)
        or (p_status not in ('toate', 'inactive') and c.active = true)
      )
      and (p_type is null or p_type = '' or c.type = p_type::public.client_type)
      and (
        p_q is null or btrim(p_q) = ''
        -- ONE BOX, FOUR COLUMNS, ONE FOLD. The needle is folded once and every
        -- column is folded the same way, so "tigla" finds "Țiglă" and "SRL"
        -- finds "srl" in any of the four.
        or public.fold_text(c.name)                  like '%' || public.fold_text(p_q) || '%'
        or public.fold_text(coalesce(c.fiscal_code, '')) like '%' || public.fold_text(p_q) || '%'
        or public.fold_text(coalesce(c.phone, ''))       like '%' || public.fold_text(p_q) || '%'
        or public.fold_text(coalesce(c.email, ''))       like '%' || public.fold_text(p_q) || '%'
      )
  )
  select
    f.id,
    f.name,
    f.type,
    f.phone,
    f.active,
    (
      -- Open, not merely not-closed-and-active: a suspended site is still a
      -- relationship in progress, and leaving it out would make the column say
      -- a client has no work with the firm.
      select count(*)
      from public.projects p
      where p.client_id = f.id and p.active and p.status <> 'closed'
    ) as active_projects,
    count(*) over () as total_count
  from filtered f
  order by lower(f.name), f.id
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0)
$$;

comment on function public.search_clients(text, text, text, integer, integer) is
  'The P3-06 Clienti list: one search box over name, IDNO, phone and email, folded with public.fold_text so a search without diacritics finds a name with them; a type filter; a status filter defaulting to active; pagination; the open-project count per row; and the total for the filtered set as a window function, so the page footer cannot disagree with the page. SECURITY INVOKER, so RLS applies unchanged.';

grant execute on function public.search_clients(text, text, text, integer, integer) to authenticated;

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'search_clients';
