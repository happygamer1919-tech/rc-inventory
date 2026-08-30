-- scripts/poc-free/local-db/assertions/0020_search_clients.sql
-- Card P3-06. Assertions for public.search_clients. Ruling R-062.
--
-- THE SEARCH RULE IS EXERCISED THROUGH THE FUNCTION THE SCREEN CALLS, never
-- through a copy of it. P3-04 learned that the hard way.
--
-- THE PLAYWRIGHT SPEC PROVES THE SCREEN. This proves the QUERY: the folding,
-- the four searchable columns, the two filters, the pagination arithmetic, the
-- window-function total and the open-project count. Those are the parts a
-- browser test can only see indirectly, and the parts most likely to be subtly
-- wrong.

do $$
declare
  n integer;
begin
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'search_clients';
  if n <> 1 then
    raise exception 'P3-06: expected exactly one public.search_clients, found %', n;
  end if;
end
$$;

begin;

insert into public.clients (id, name, type, fiscal_code, phone, email, active) values
  ('e6000000-0000-0000-0000-000000000001', 'Țiglă Construct SRL', 'company', '1001600000101', '069 111 111', 'a@tigla.md', true),
  ('e6000000-0000-0000-0000-000000000002', 'Beta Construct SRL',  'company', '1001600000102', '069 222 222', 'b@beta.md',  true),
  ('e6000000-0000-0000-0000-000000000003', 'Ion Popescu',         'individual', null,          '069 333 333', null,        true),
  ('e6000000-0000-0000-0000-000000000004', 'Firma Inactiva SRL',  'company', '1001600000104', null,          null,        false);

insert into public.projects (client_id, name, status, active) values
  ('e6000000-0000-0000-0000-000000000001', 'Bloc A',   'active',    true),
  ('e6000000-0000-0000-0000-000000000001', 'Bloc B',   'lead',      true),
  -- Closed and deactivated projects must NOT be counted: the column says how
  -- much work is in progress, and a closed job is not.
  ('e6000000-0000-0000-0000-000000000001', 'Bloc Vechi', 'closed',  true),
  ('e6000000-0000-0000-0000-000000000001', 'Bloc Sters', 'active',  false),
  -- Suspended IS counted. A stopped site is still a relationship in progress,
  -- and leaving it out would say this client has no work with the firm.
  ('e6000000-0000-0000-0000-000000000001', 'Bloc Oprit', 'suspended', true);

do $$
declare
  n     integer;
  first text;
  tot   bigint;
begin
  -- --- the default: active only, no search ---------------------------------
  select count(*) into n from public.search_clients();
  if n <> 3 then
    raise exception 'P3-06: expected 3 active clients by default, found %', n;
  end if;

  -- --- THE FOLD, which is the whole reason this is a function ---------------
  -- "tigla" typed without diacritics must find "Țiglă Construct SRL". An ilike
  -- over the raw column does not, and that is the defect phase 1 found on
  -- screen and wrote into LEARNINGS.
  select count(*) into n from public.search_clients('tigla');
  if n <> 1 then
    raise exception 'P3-06: searching "tigla" found % clients, expected 1', n;
  end if;
  select count(*) into n from public.search_clients('ȚIGLĂ');
  if n <> 1 then
    raise exception 'P3-06: searching with diacritics and caps found %, expected 1', n;
  end if;

  -- --- ONE BOX, FOUR COLUMNS -----------------------------------------------
  select count(*) into n from public.search_clients('1001600000102');
  if n <> 1 then
    raise exception 'P3-06: searching by IDNO found %, expected 1', n;
  end if;
  select count(*) into n from public.search_clients('069 333');
  if n <> 1 then
    raise exception 'P3-06: searching by phone found %, expected 1', n;
  end if;
  select count(*) into n from public.search_clients('beta.md');
  if n <> 1 then
    raise exception 'P3-06: searching by email found %, expected 1', n;
  end if;

  -- A needle that matches nothing matches NOTHING. A search that quietly falls
  -- back to the whole list is worse than one that finds nothing, because the
  -- operator believes the answer.
  select count(*) into n from public.search_clients('zzzz-nu-exista');
  if n <> 0 then
    raise exception 'P3-06: a search matching nothing returned % rows', n;
  end if;

  -- --- THE TYPE FILTER ------------------------------------------------------
  select count(*) into n from public.search_clients('', 'individual');
  if n <> 1 then
    raise exception 'P3-06: the individual filter found %, expected 1', n;
  end if;
  select count(*) into n from public.search_clients('', 'company');
  if n <> 2 then
    raise exception 'P3-06: the company filter found %, expected 2 active', n;
  end if;

  -- --- THE STATUS FILTER ----------------------------------------------------
  select count(*) into n from public.search_clients('', null, 'inactive');
  if n <> 1 then
    raise exception 'P3-06: the inactive filter found %, expected 1', n;
  end if;
  select count(*) into n from public.search_clients('', null, 'toate');
  if n <> 4 then
    raise exception 'P3-06: the "toate" filter found %, expected 4', n;
  end if;

  -- A NONSENSE STATUS BEHAVES AS 'active'. Somebody sends a stale link with
  -- ?stare=nonsense and gets a list, not an error page.
  select count(*) into n from public.search_clients('', null, 'aiurea');
  if n <> 3 then
    raise exception 'P3-06: an unknown status returned % rows, expected the active default of 3', n;
  end if;

  -- --- THE OPEN PROJECT COUNT ----------------------------------------------
  -- Three of five: active, lead and suspended. Not the closed one, not the
  -- deactivated one.
  select active_projects into n from public.search_clients('tigla');
  if n <> 3 then
    raise exception 'P3-06: expected 3 open projects (active, lead, suspended), found %', n;
  end if;
  select active_projects into n from public.search_clients('beta');
  if n <> 0 then
    raise exception 'P3-06: a client with no projects reported %', n;
  end if;

  -- --- THE TOTAL TRAVELS WITH THE PAGE -------------------------------------
  -- One row per page, and the total still says how many there are, or the page
  -- footer would claim a number of pages the list cannot produce.
  select count(*), max(total_count) into n, tot from public.search_clients('', null, 'toate', 1, 0);
  if n <> 1 or tot <> 4 then
    raise exception 'P3-06: a one-row page returned % rows with a total of %, expected 1 and 4', n, tot;
  end if;

  -- --- PAGINATION IS STABLE AND DOES NOT REPEAT A ROW ----------------------
  -- The order is lower(name) then id, so two pages of two cover all four
  -- exactly once. An unstable order silently shows a row twice and hides
  -- another, which nobody reports because both pages look plausible.
  select count(distinct id) into n from (
    select id from public.search_clients('', null, 'toate', 2, 0)
    union all
    select id from public.search_clients('', null, 'toate', 2, 2)
  ) both_pages;
  if n <> 4 then
    raise exception 'P3-06: two pages of two covered % distinct clients, expected 4', n;
  end if;

  -- An offset past the end is an empty page, not an error.
  select count(*) into n from public.search_clients('', null, 'toate', 25, 100);
  if n <> 0 then
    raise exception 'P3-06: an offset past the end returned % rows', n;
  end if;

  -- --- ORDERING IS BY NAME, CASE-INSENSITIVELY -----------------------------
  select name into first from public.search_clients('', null, 'toate', 1, 0);
  if first <> 'Beta Construct SRL' then
    raise exception 'P3-06: expected Beta Construct SRL first by name, found %', first;
  end if;
end
$$;

rollback;
