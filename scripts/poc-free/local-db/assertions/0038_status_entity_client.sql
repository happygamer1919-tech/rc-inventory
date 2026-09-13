-- assertions/0038_status_entity_client.sql
-- Card P3-43. What 0038 must have left behind. Ruling R-062.
--
-- TWO PROPERTIES, AND THE SECOND IS THE ONE A LABEL CHECK ALONE WOULD MISS.
--
--   1. 'client' is a label on public.status_entity, and the three labels that
--      were there before are all still there, in their order
--   2. a status_history row can actually BE WRITTEN carrying it
--
-- Property 1 checks the whole set and not only the new label, for the reason the
-- 0034 assertions give: on an enum "added a value" and "replaced the set" look
-- identical from a single-label check, and a lost label would make every
-- historical row of that kind unreadable.

begin;

do $$
declare
  n       integer;
  ordered text;
begin
  -- --- 1. THE LABEL EXISTS, AND NOTHING WAS LOST ------------------------------
  select count(*) into n
  from pg_enum e
  join pg_type t on t.oid = e.enumtypid
  join pg_namespace ns on ns.oid = t.typnamespace
  where ns.nspname = 'public' and t.typname = 'status_entity' and e.enumlabel = 'client';
  if n <> 1 then
    raise exception 'P3-43: client is not a label on public.status_entity (found %)', n;
  end if;

  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into ordered
  from pg_enum e
  join pg_type t on t.oid = e.enumtypid
  join pg_namespace ns on ns.oid = t.typnamespace
  where ns.nspname = 'public' and t.typname = 'status_entity';
  if ordered is distinct from 'inbound_order,outbound_issue,project,client' then
    raise exception 'P3-43: status_entity holds %, expected inbound_order,outbound_issue,project,client', coalesce(ordered, 'nothing');
  end if;
end
$$;

-- --- 2. IT CAN ACTUALLY BE WRITTEN ---------------------------------------------
-- A separate statement, outside the DO block, so the value travels through the
-- real column type of public.status_history.entity_type.
insert into public.status_history (entity_type, entity_id, from_status, to_status)
values ('client', 'e4380000-0000-4000-8000-000000000001', 'cold', 'nurture');

do $$
declare
  n integer;
begin
  select count(*) into n
  from public.status_history
  where entity_type = 'client' and entity_id = 'e4380000-0000-4000-8000-000000000001';
  if n <> 1 then
    raise exception 'P3-43: a status_history row with entity_type client read back % rows, expected 1', n;
  end if;
end
$$;

rollback;
