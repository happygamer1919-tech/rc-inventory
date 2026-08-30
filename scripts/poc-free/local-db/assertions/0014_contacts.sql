-- scripts/poc-free/local-db/assertions/0014_contacts.sql
-- Card P3-02. The acceptance assertions for public.contacts, run against the
-- throwaway container after every migration has been applied. Ruling R-062.
--
-- It raises rather than prints. See the 0013 file for why.

do $$
declare
  n integer;
  txt text;
begin
  -- --- the table ----------------------------------------------------------
  select count(*) into n
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'contacts' and c.relkind = 'r';
  if n <> 1 then
    raise exception 'P3-02: expected public.contacts to exist as a table, found %', n;
  end if;

  -- --- row level security -------------------------------------------------
  select c.relrowsecurity into txt
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'contacts';
  if txt is distinct from 'true' then
    raise exception 'P3-02: expected rowsecurity true on public.contacts, found %', txt;
  end if;

  -- --- exactly three policies, and no delete policy ------------------------
  select string_agg(cmd, ',' order by cmd) into txt from pg_policies
  where schemaname = 'public' and tablename = 'contacts';
  if txt is distinct from 'INSERT,SELECT,UPDATE' then
    raise exception 'P3-02: expected policies for exactly INSERT, SELECT and UPDATE on public.contacts, found %', coalesce(txt, 'none');
  end if;

  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'contacts' and cmd = 'DELETE';
  if n <> 0 then
    raise exception 'P3-02: public.contacts must have NO delete policy, found %', n;
  end if;

  -- --- anon holds nothing, authenticated can read --------------------------
  select count(*) into n from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'contacts' and grantee = 'anon';
  if n <> 0 then
    raise exception 'P3-02: anon must hold no privilege on public.contacts, found % grants', n;
  end if;

  select count(*) into n from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'contacts'
    and grantee = 'authenticated' and privilege_type = 'SELECT';
  if n <> 1 then
    raise exception 'P3-02: authenticated must hold SELECT on public.contacts, found % grants', n;
  end if;

  -- --- the foreign key, and that it CASCADES -------------------------------
  -- The card names cascade as the one exception on this board, so the delete
  -- action is asserted and not only the existence of the key. A key that had
  -- silently become RESTRICT would satisfy "the foreign key is present" and
  -- would change what happens to a client's people.
  select pg_get_constraintdef(oid) into txt
  from pg_constraint
  where conrelid = 'public.contacts'::regclass and contype = 'f'
    and conkey = array[(select attnum from pg_attribute
                        where attrelid = 'public.contacts'::regclass and attname = 'client_id')];
  if txt is null then
    raise exception 'P3-02: expected a foreign key on public.contacts.client_id, found none';
  end if;
  if txt not like '%REFERENCES clients(id)%' or txt not like '%ON DELETE CASCADE%' then
    raise exception 'P3-02: expected client_id to reference clients(id) ON DELETE CASCADE, found %', txt;
  end if;

  -- --- the index on the referencing side -----------------------------------
  select count(*) into n from pg_indexes
  where schemaname = 'public' and tablename = 'contacts' and indexname = 'contacts_client_id_idx';
  if n <> 1 then
    raise exception 'P3-02: expected index contacts_client_id_idx, found %', n;
  end if;

  -- --- the partial unique index, asserted as PARTIAL -----------------------
  -- A plain unique index on client_id would satisfy a check for the name and
  -- would allow exactly one contact per client, which is the opposite of what
  -- this table is for. The WHERE clause is the whole point of it.
  select indexdef into txt from pg_indexes
  where schemaname = 'public' and tablename = 'contacts'
    and indexname = 'contacts_one_primary_per_client';
  if txt is null then
    raise exception 'P3-02: expected index contacts_one_primary_per_client, found none';
  end if;
  if txt not like 'CREATE UNIQUE INDEX%' or txt not like '%WHERE is_primary%' then
    raise exception 'P3-02: contacts_one_primary_per_client must be UNIQUE and PARTIAL on is_primary, found %', txt;
  end if;

  -- --- the updated_at trigger ---------------------------------------------
  select count(*) into n from pg_trigger
  where tgrelid = 'public.contacts'::regclass and tgname = 'contacts_set_updated_at'
    and not tgisinternal;
  if n <> 1 then
    raise exception 'P3-02: expected trigger contacts_set_updated_at, found %', n;
  end if;

  -- --- role is free text, deliberately -------------------------------------
  -- Asserted because a later reader tidying the schema is likely to "fix" this
  -- into an enum, and P3-02 spends a paragraph on why it must not be.
  select t.typname into txt
  from pg_attribute a join pg_type t on t.oid = a.atttypid
  where a.attrelid = 'public.contacts'::regclass and a.attname = 'role';
  if txt is distinct from 'text' then
    raise exception 'P3-02: contacts.role must stay free text per the card, found type %', txt;
  end if;
end
$$;


-- ===========================================================================
-- BEHAVIOURAL CHECKS
-- ===========================================================================
--
-- The rules, exercised. Superuser, so RLS is bypassed and these prove the
-- CONSTRAINTS. Rolled back at the end so the container is left as it was found.

begin;

insert into public.clients (id, name, fiscal_code)
values ('11111111-1111-1111-1111-111111111111', 'Constructii Test SRL', '1001600011111'),
       ('22222222-2222-2222-2222-222222222222', 'Alta Firma SRL',       '1001600022222');

do $$
declare
  n integer;
begin
  -- A client may hold several people, which is the entire reason for the table.
  insert into public.contacts (client_id, name, role, phone) values
    ('11111111-1111-1111-1111-111111111111', 'Ion Rusu',    'Sef de santier', '069 123 456'),
    ('11111111-1111-1111-1111-111111111111', 'Vera Munteanu','Contabil',      '+373 22 123456'),
    ('11111111-1111-1111-1111-111111111111', 'Petru Ciobanu','Administrator', '079123456');
  select count(*) into n from public.contacts
  where client_id = '11111111-1111-1111-1111-111111111111';
  if n <> 3 then
    raise exception 'P3-02: expected 3 contacts on one client, found %', n;
  end if;

  -- ZERO primaries is legal. Nothing above set one, and nothing raised.
  select count(*) into n from public.contacts
  where client_id = '11111111-1111-1111-1111-111111111111' and is_primary;
  if n <> 0 then
    raise exception 'P3-02: expected zero primary contacts to be legal, found %', n;
  end if;

  -- One primary is fine.
  update public.contacts set is_primary = true where name = 'Ion Rusu';

  -- A SECOND primary for the same client must be refused. This is the card's
  -- named acceptance and the reason the index is not a UI rule.
  begin
    update public.contacts set is_primary = true where name = 'Vera Munteanu';
    raise exception 'P3-02: a second primary contact was accepted for one client, so contacts_one_primary_per_client is not enforcing';
  exception
    when unique_violation then null;
  end;

  -- The same is true on INSERT, not only on UPDATE.
  begin
    insert into public.contacts (client_id, name, is_primary)
    values ('11111111-1111-1111-1111-111111111111', 'Cineva Altcineva', true);
    raise exception 'P3-02: a second primary contact was INSERTED for one client';
  exception
    when unique_violation then null;
  end;

  -- A DIFFERENT client may have its own primary. If the index were not
  -- partitioned by client_id this would fail, and the table would allow one
  -- primary contact in the entire system.
  insert into public.contacts (client_id, name, is_primary)
  values ('22222222-2222-2222-2222-222222222222', 'Maria Lungu', true);
  select count(*) into n from public.contacts where is_primary;
  if n <> 2 then
    raise exception 'P3-02: expected one primary per client across two clients, found % primaries', n;
  end if;

  -- Clearing the old primary then setting a new one is the supported path, and
  -- it works inside one transaction, which is what the card says the interface
  -- must do.
  update public.contacts set is_primary = false where name = 'Ion Rusu';
  update public.contacts set is_primary = true  where name = 'Vera Munteanu';
  select count(*) into n from public.contacts
  where client_id = '11111111-1111-1111-1111-111111111111' and is_primary;
  if n <> 1 then
    raise exception 'P3-02: expected exactly one primary after the handover, found %', n;
  end if;

  -- CASCADE: deleting a client takes its people and leaves the other client
  -- alone. Done here rather than trusted, because the card calls this the one
  -- cascade on the board.
  delete from public.clients where id = '11111111-1111-1111-1111-111111111111';
  select count(*) into n from public.contacts
  where client_id = '11111111-1111-1111-1111-111111111111';
  if n <> 0 then
    raise exception 'P3-02: expected contacts to cascade with their client, % survived', n;
  end if;
  select count(*) into n from public.contacts
  where client_id = '22222222-2222-2222-2222-222222222222';
  if n <> 1 then
    raise exception 'P3-02: the other client lost contacts to a cascade it was not part of, found %', n;
  end if;

  -- PHONE IS STORED VERBATIM. Four shapes of the same Moldovan number, all of
  -- which a person might copy off a business card, and every one comes back
  -- exactly as it went in. There is no normaliser and there must not be one:
  -- reformatting what somebody typed is a bug that looks like a feature.
  --
  -- Inserted fresh here rather than reused from above, because the rows above
  -- were just cascaded away by the delete. A check whose subject may or may not
  -- exist depending on an earlier assertion is a check nobody can reason about.
  insert into public.contacts (client_id, name, phone) values
    ('22222222-2222-2222-2222-222222222222', 'Format A', '069 123 456'),
    ('22222222-2222-2222-2222-222222222222', 'Format B', '+373 22 123456'),
    ('22222222-2222-2222-2222-222222222222', 'Format C', '079123456'),
    ('22222222-2222-2222-2222-222222222222', 'Format D', '+373 (22) 12-34-56');
  select count(*) into n from public.contacts
  where phone in ('069 123 456', '+373 22 123456', '079123456', '+373 (22) 12-34-56');
  if n <> 4 then
    raise exception 'P3-02: a phone number was altered on the way in, % of 4 survived verbatim', n;
  end if;
end
$$;

rollback;
