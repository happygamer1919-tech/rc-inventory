-- assertions/0044_documents.sql
-- Card P3-15. The documents table and its kind, the record of who deleted a
-- document, the widened rc-docs bucket and its new owner-only delete policy.
--
-- WHAT THIS FILE CANNOT PROVE, SAID HERE SO NOBODY READS IT AS PROVEN. It runs on
-- a bare postgres with a shim for the storage schema, so it proves what the
-- bucket row and the policies SAY, not that the storage server obeys them. That
-- half is tests/e2e/documents.spec.ts, against a real local Supabase stack.

begin;


-- ===========================================================================
-- 1. THE SHAPE
-- ===========================================================================

do $$
declare
  n        integer;
  declared text;
begin
  -- --- five kinds, in the card's order --------------------------------------
  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into declared
  from pg_enum e
  join pg_type t on t.oid = e.enumtypid
  join pg_namespace ns on ns.oid = t.typnamespace
  where ns.nspname = 'public' and t.typname = 'document_kind';
  if declared is distinct from 'contract,act,factura,foto,altele' then
    raise exception 'P3-15: document_kind is %, expected contract,act,factura,foto,altele', coalesce(declared, 'nothing');
  end if;

  -- --- the twelve columns, each with its type and nullability, and no others --
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'documents'
    and (
      (column_name = 'id'            and data_type = 'uuid'   and is_nullable = 'NO')
      or (column_name = 'client_id'     and data_type = 'uuid'   and is_nullable = 'YES')
      or (column_name = 'project_id'    and data_type = 'uuid'   and is_nullable = 'YES')
      or (column_name = 'storage_path'  and data_type = 'text'   and is_nullable = 'NO')
      or (column_name = 'original_name' and data_type = 'text'   and is_nullable = 'NO')
      or (column_name = 'mime_type'     and data_type = 'text'   and is_nullable = 'NO')
      or (column_name = 'size_bytes'    and data_type = 'bigint' and is_nullable = 'NO')
      or (column_name = 'kind'          and udt_name = 'document_kind' and is_nullable = 'NO')
      or (column_name = 'notes'         and data_type = 'text'   and is_nullable = 'YES')
      or (column_name = 'uploaded_by'   and data_type = 'uuid'   and is_nullable = 'YES')
      or (column_name = 'created_at'    and data_type = 'timestamp with time zone' and is_nullable = 'NO')
      or (column_name = 'updated_at'    and data_type = 'timestamp with time zone' and is_nullable = 'NO')
    );
  if n <> 12 then
    raise exception 'P3-15: expected the twelve documents columns with their types and nullability, found % matching', n;
  end if;
  select count(*) into n from information_schema.columns where table_schema = 'public' and table_name = 'documents';
  if n <> 12 then
    raise exception 'P3-15: public.documents has % columns, expected 12', n;
  end if;

  -- --- the three foreign keys, with their delete rules -----------------------
  select count(*) into n
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
  where c.conrelid = 'public.documents'::regclass
    and c.contype = 'f'
    and (
      (a.attname = 'client_id'   and c.confrelid = 'public.clients'::regclass  and c.confdeltype = 'r')
      or (a.attname = 'project_id'  and c.confrelid = 'public.projects'::regclass and c.confdeltype = 'r')
      or (a.attname = 'uploaded_by' and c.confrelid = 'auth.users'::regclass      and c.confdeltype = 'n')
    );
  if n <> 3 then
    raise exception 'P3-15: expected client_id and project_id on delete restrict and uploaded_by on delete set null, found % matching', n;
  end if;

  -- --- storage_path is unique on its own --------------------------------------
  select count(*) into n
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
  where c.conrelid = 'public.documents'::regclass
    and c.contype = 'u'
    and cardinality(c.conkey) = 1
    and a.attname = 'storage_path';
  if n <> 1 then
    raise exception 'P3-15: storage_path is not unique on its own (found %)', n;
  end if;

  -- --- the four checks, by name, and the one-owner rule by its expression ----
  select count(*) into n
  from pg_constraint
  where conrelid = 'public.documents'::regclass and contype = 'c'
    and conname in ('documents_one_owner', 'documents_storage_path_shape',
                    'documents_storage_path_matches_owner', 'documents_size_within_limit');
  if n <> 4 then
    raise exception 'P3-15: expected four named check constraints on documents, found %', n;
  end if;
  select pg_get_constraintdef(oid) into declared
  from pg_constraint
  where conrelid = 'public.documents'::regclass and conname = 'documents_one_owner';
  if declared not like '%num_nonnulls(client_id, project_id) = 1%' then
    raise exception 'P3-15: documents_one_owner is %, expected num_nonnulls(client_id, project_id) = 1', declared;
  end if;

  -- --- an index on every foreign key, on the referencing side ----------------
  select count(*) into n
  from pg_indexes
  where schemaname = 'public'
    and indexname in ('documents_client_id_idx', 'documents_project_id_idx',
                      'documents_uploaded_by_idx', 'document_deletions_deleted_by_idx');
  if n <> 4 then
    raise exception 'P3-15: expected the four foreign key indexes, found %', n;
  end if;

  -- --- row level security on both tables --------------------------------------
  select count(*) into n
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname in ('documents', 'document_deletions') and c.relrowsecurity;
  if n <> 2 then
    raise exception 'P3-15: row level security is enabled on % of documents and document_deletions', n;
  end if;

  -- --- four policies on documents, one per command, writes owner only --------
  select string_agg(cmd, ',' order by cmd) into declared
  from pg_policies where schemaname = 'public' and tablename = 'documents';
  if declared is distinct from 'DELETE,INSERT,SELECT,UPDATE' then
    raise exception 'P3-15: the documents policies cover %, expected DELETE,INSERT,SELECT,UPDATE', coalesce(declared, 'nothing');
  end if;
  select count(*) into n
  from pg_policies
  where schemaname = 'public' and tablename = 'documents'
    and roles = '{authenticated}'::name[]
    and (
      (cmd = 'SELECT' and qual = 'true')
      or (cmd = 'INSERT' and with_check like '%is_owner()%')
      or (cmd = 'UPDATE' and qual like '%is_owner()%' and with_check like '%is_owner()%')
      or (cmd = 'DELETE' and qual like '%is_owner()%')
    );
  if n <> 4 then
    raise exception 'P3-15: expected select for every signed-in user and insert, update, delete for owners only, to authenticated, found % matching', n;
  end if;

  -- --- the deletion record: one policy, a read, for owners only --------------
  select count(*) into n
  from pg_policies
  where schemaname = 'public' and tablename = 'document_deletions';
  if n <> 1 then
    raise exception 'P3-15: document_deletions has % policies, expected exactly one', n;
  end if;
  select count(*) into n
  from pg_policies
  where schemaname = 'public' and tablename = 'document_deletions'
    and cmd = 'SELECT' and roles = '{authenticated}'::name[] and qual like '%is_owner()%';
  if n <> 1 then
    raise exception 'P3-15: the document_deletions policy is not a select for owners only';
  end if;

  -- --- anon holds nothing on either table; authenticated only reads the record
  if has_table_privilege('anon', 'public.documents', 'select')
     or has_table_privilege('anon', 'public.documents', 'insert')
     or has_table_privilege('anon', 'public.documents', 'delete')
     or has_table_privilege('anon', 'public.document_deletions', 'select') then
    raise exception 'P3-15: anon holds a privilege on documents or document_deletions';
  end if;
  if not has_table_privilege('authenticated', 'public.document_deletions', 'select')
     or has_table_privilege('authenticated', 'public.document_deletions', 'insert')
     or has_table_privilege('authenticated', 'public.document_deletions', 'update')
     or has_table_privilege('authenticated', 'public.document_deletions', 'delete') then
    raise exception 'P3-15: authenticated must be able to read document_deletions and nothing else';
  end if;

  -- --- the trigger: before delete, for each row, security definer ------------
  select count(*) into n
  from pg_trigger tg
  where tg.tgrelid = 'public.documents'::regclass
    and tg.tgname = 'documents_record_deletion'
    and not tg.tgisinternal
    and tg.tgfoid = 'public.record_document_deletion()'::regprocedure
    and (tg.tgtype & 1) = 1   -- for each row
    and (tg.tgtype & 2) = 2   -- before
    and (tg.tgtype & 8) = 8;  -- delete
  if n <> 1 then
    raise exception 'P3-15: documents_record_deletion is not a before delete row trigger calling record_document_deletion()';
  end if;
  select count(*) into n
  from pg_proc
  where oid = 'public.record_document_deletion()'::regprocedure and prosecdef;
  if n <> 1 then
    raise exception 'P3-15: record_document_deletion() is not security definer';
  end if;

  -- --- the bucket: still private, 20 MB, the eight types in order ------------
  select count(*) into n
  from storage.buckets
  where id = 'rc-docs'
    and public = false
    and file_size_limit = 20971520
    and allowed_mime_types = array[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]::text[];
  if n <> 1 then
    raise exception 'P3-15: rc-docs is not private at 20971520 bytes with the eight types (found %)', n;
  end if;

  -- --- the storage policies: 0002's three, kept, plus the owner-only delete ---
  select string_agg(policyname || ':' || cmd, ',' order by policyname) into declared
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname like 'rc_docs_%';
  if declared is distinct from 'rc_docs_delete:DELETE,rc_docs_insert:INSERT,rc_docs_select:SELECT,rc_docs_update:UPDATE' then
    raise exception 'P3-15: the rc-docs storage policies are %', coalesce(declared, 'nothing');
  end if;
  select count(*) into n
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname = 'rc_docs_delete'
    and roles = '{authenticated}'::name[]
    and qual like '%rc-docs%'
    and qual like '%is_owner()%';
  if n <> 1 then
    raise exception 'P3-15: rc_docs_delete is not a delete to authenticated, inside rc-docs, for owners only';
  end if;
end
$$;


-- ===========================================================================
-- 2. WHAT A ROW MAY BE
-- ===========================================================================

insert into auth.users (id, email) values
  ('e3150000-0000-4000-8000-000000000001', 'p3-15-owner@rc-inventory.local'),
  ('e3150000-0000-4000-8000-000000000002', 'p3-15-manager@rc-inventory.local');

insert into public.profiles (id, email, role, active) values
  ('e3150000-0000-4000-8000-000000000001', 'p3-15-owner@rc-inventory.local', 'owner', true),
  ('e3150000-0000-4000-8000-000000000002', 'p3-15-manager@rc-inventory.local', 'account_manager', true);

insert into public.clients (id, name) values
  ('e3151000-0000-4000-8000-000000000001', 'P3-15 Client'),
  ('e3151000-0000-4000-8000-000000000002', 'P3-15 Alt client');

insert into public.projects (id, client_id, name) values
  ('e3152000-0000-4000-8000-000000000001', 'e3151000-0000-4000-8000-000000000001', 'P3-15 Santier');

set local request.jwt.claims = '{"sub":"e3150000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
declare
  c1        constant uuid := 'e3151000-0000-4000-8000-000000000001';
  c2        constant uuid := 'e3151000-0000-4000-8000-000000000002';
  p1        constant uuid := 'e3152000-0000-4000-8000-000000000001';
  actor     constant uuid := 'e3150000-0000-4000-8000-000000000001';
  d_client  constant uuid := 'e3153000-0000-4000-8000-000000000001';
  d_project constant uuid := 'e3153000-0000-4000-8000-000000000002';
  who       uuid;
  con       text;
  refused   boolean;
begin
  -- --- a client document and a project document insert ----------------------
  insert into public.documents (id, client_id, storage_path, original_name, mime_type, size_bytes, kind)
  values (d_client, c1, 'client/' || c1 || '/e3154000-0000-4000-8000-000000000001.pdf',
          'Contract semnat.pdf', 'application/pdf', 1024, 'contract');

  -- Exactly at the limit is accepted.
  insert into public.documents (id, project_id, storage_path, original_name, mime_type, size_bytes, kind)
  values (d_project, p1, 'project/' || p1 || '/e3154000-0000-4000-8000-000000000002.jpg',
          'Fatada.jpg', 'image/jpeg', 20971520, 'foto');

  -- --- uploaded_by defaults to the signed-in user ----------------------------
  select uploaded_by into who from public.documents where id = d_client;
  if who is distinct from actor then
    raise exception 'P3-15: uploaded_by defaulted to %, expected the signed-in user %', who, actor;
  end if;

  -- --- BOTH A CLIENT AND A PROJECT: REFUSED, BY THE ONE-OWNER RULE -----------
  -- The path names the client, so every other check passes and only this one can fire.
  refused := false;
  begin
    insert into public.documents (client_id, project_id, storage_path, original_name, mime_type, size_bytes, kind)
    values (c1, p1, 'client/' || c1 || '/e3154000-0000-4000-8000-000000000003.pdf',
            'Ambele.pdf', 'application/pdf', 10, 'altele');
  exception
    when check_violation then
      get stacked diagnostics con = constraint_name;
      refused := true;
  end;
  if not refused then
    raise exception 'P3-15: a document with both client_id and project_id was accepted';
  end if;
  if con is distinct from 'documents_one_owner' then
    raise exception 'P3-15: a document with both owners was refused by %, expected documents_one_owner', con;
  end if;

  -- --- NEITHER A CLIENT NOR A PROJECT: REFUSED --------------------------------
  refused := false;
  begin
    insert into public.documents (client_id, project_id, storage_path, original_name, mime_type, size_bytes, kind)
    values (null, null, 'client/' || c1 || '/e3154000-0000-4000-8000-000000000004.pdf',
            'Niciunul.pdf', 'application/pdf', 10, 'altele');
  exception
    when check_violation then
      get stacked diagnostics con = constraint_name;
      refused := true;
  end;
  if not refused then
    raise exception 'P3-15: a document with neither client_id nor project_id was accepted';
  end if;
  if con not in ('documents_one_owner', 'documents_storage_path_matches_owner') then
    raise exception 'P3-15: a document with no owner was refused by %, expected an owner rule', con;
  end if;

  -- --- THE PATH MUST NAME THE ROW'S OWN CLIENT OR PROJECT --------------------
  refused := false;
  begin
    insert into public.documents (client_id, storage_path, original_name, mime_type, size_bytes, kind)
    values (c2, 'client/' || c1 || '/e3154000-0000-4000-8000-000000000005.pdf',
            'Alt client.pdf', 'application/pdf', 10, 'altele');
  exception
    when check_violation then
      get stacked diagnostics con = constraint_name;
      refused := true;
  end;
  if not refused or con is distinct from 'documents_storage_path_matches_owner' then
    raise exception 'P3-15: a client document filed under another client was not refused by the owner path rule (refused=%, by %)', refused, con;
  end if;

  refused := false;
  begin
    insert into public.documents (project_id, storage_path, original_name, mime_type, size_bytes, kind)
    values (p1, 'client/' || c1 || '/e3154000-0000-4000-8000-000000000006.pdf',
            'Proiect sub client.pdf', 'application/pdf', 10, 'altele');
  exception
    when check_violation then
      get stacked diagnostics con = constraint_name;
      refused := true;
  end;
  if not refused or con is distinct from 'documents_storage_path_matches_owner' then
    raise exception 'P3-15: a project document filed under a client path was not refused by the owner path rule (refused=%, by %)', refused, con;
  end if;

  -- --- A PATH MADE FROM THE FILE NAME, OR CLIMBING OUT, IS REFUSED -----------
  refused := false;
  begin
    insert into public.documents (client_id, storage_path, original_name, mime_type, size_bytes, kind)
    values (c1, 'client/' || c1 || '/Contract semnat.pdf', 'Contract semnat.pdf', 'application/pdf', 10, 'contract');
  exception
    when check_violation then
      get stacked diagnostics con = constraint_name;
      refused := true;
  end;
  if not refused or con is distinct from 'documents_storage_path_shape' then
    raise exception 'P3-15: a storage path made from the file name was not refused by the shape rule (refused=%, by %)', refused, con;
  end if;

  refused := false;
  begin
    insert into public.documents (client_id, storage_path, original_name, mime_type, size_bytes, kind)
    values (c1, 'client/' || c1 || '/../e3154000-0000-4000-8000-000000000007.pdf', 'Urcare.pdf', 'application/pdf', 10, 'contract');
  exception
    when check_violation then refused := true;
  end;
  if not refused then
    raise exception 'P3-15: a storage path with .. in it was accepted';
  end if;

  -- --- AN EMPTY FILE AND ONE BYTE OVER 20 MB ARE REFUSED ---------------------
  refused := false;
  begin
    insert into public.documents (client_id, storage_path, original_name, mime_type, size_bytes, kind)
    values (c1, 'client/' || c1 || '/e3154000-0000-4000-8000-000000000008.pdf', 'Gol.pdf', 'application/pdf', 0, 'altele');
  exception
    when check_violation then
      get stacked diagnostics con = constraint_name;
      refused := true;
  end;
  if not refused or con is distinct from 'documents_size_within_limit' then
    raise exception 'P3-15: an empty document was not refused by the size rule (refused=%, by %)', refused, con;
  end if;

  refused := false;
  begin
    insert into public.documents (client_id, storage_path, original_name, mime_type, size_bytes, kind)
    values (c1, 'client/' || c1 || '/e3154000-0000-4000-8000-000000000009.pdf', 'Mare.pdf', 'application/pdf', 20971521, 'altele');
  exception
    when check_violation then
      get stacked diagnostics con = constraint_name;
      refused := true;
  end;
  if not refused or con is distinct from 'documents_size_within_limit' then
    raise exception 'P3-15: a document one byte over 20 MB was not refused by the size rule (refused=%, by %)', refused, con;
  end if;

  -- --- ONE PATH, ONE ROW -------------------------------------------------------
  refused := false;
  begin
    insert into public.documents (client_id, storage_path, original_name, mime_type, size_bytes, kind)
    values (c1, 'client/' || c1 || '/e3154000-0000-4000-8000-000000000001.pdf', 'Dublura.pdf', 'application/pdf', 10, 'altele');
  exception
    when unique_violation then refused := true;
  end;
  if not refused then
    raise exception 'P3-15: a second row with the same storage_path was accepted';
  end if;
end
$$;


-- ===========================================================================
-- 3. WHO MAY DELETE, AND THE RECORD OF WHO DID
-- ===========================================================================
--
-- The first two attempts run as the authenticated role, the way PostgREST runs a
-- signed-in user's request, so the policies apply. An account manager's delete
-- matches no row under the policy and removes nothing; an account manager's
-- insert is refused. Then the owner deletes, and the trigger writes the record.

set local role authenticated;
set local request.jwt.claims = '{"sub":"e3150000-0000-4000-8000-000000000002","role":"authenticated"}';

delete from public.documents where id = 'e3153000-0000-4000-8000-000000000001';

do $$
declare
  refused boolean := false;
begin
  begin
    insert into public.documents (client_id, storage_path, original_name, mime_type, size_bytes, kind)
    values ('e3151000-0000-4000-8000-000000000001',
            'client/e3151000-0000-4000-8000-000000000001/e3154000-0000-4000-8000-000000000010.pdf',
            'Operator.pdf', 'application/pdf', 10, 'altele');
  exception
    when insufficient_privilege then refused := true;
  end;
  if not refused then
    raise exception 'P3-15: an account manager inserted a document';
  end if;
end
$$;

reset role;

do $$
declare
  n integer;
begin
  select count(*) into n from public.documents where id = 'e3153000-0000-4000-8000-000000000001';
  if n <> 1 then
    raise exception 'P3-15: an account manager deleted a document (% row left, expected 1)', n;
  end if;
  select count(*) into n from public.document_deletions where document_id = 'e3153000-0000-4000-8000-000000000001';
  if n <> 0 then
    raise exception 'P3-15: a refused delete wrote % deletion record(s)', n;
  end if;
end
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"e3150000-0000-4000-8000-000000000001","role":"authenticated"}';

delete from public.documents where id = 'e3153000-0000-4000-8000-000000000001';

reset role;

do $$
declare
  n integer;
begin
  select count(*) into n from public.documents where id = 'e3153000-0000-4000-8000-000000000001';
  if n <> 0 then
    raise exception 'P3-15: the owner delete left the row in place';
  end if;

  select count(*) into n
  from public.document_deletions
  where document_id   = 'e3153000-0000-4000-8000-000000000001'
    and client_id     = 'e3151000-0000-4000-8000-000000000001'
    and project_id    is null
    and storage_path  = 'client/e3151000-0000-4000-8000-000000000001/e3154000-0000-4000-8000-000000000001.pdf'
    and original_name = 'Contract semnat.pdf'
    and kind          = 'contract'
    and uploaded_by   = 'e3150000-0000-4000-8000-000000000001'
    and deleted_by    = 'e3150000-0000-4000-8000-000000000001'
    and deleted_at    is not null
    and uploaded_at   is not null;
  if n <> 1 then
    raise exception 'P3-15: expected one deletion record naming the document, its client and the owner who deleted it, found %', n;
  end if;

  -- The other document is untouched.
  select count(*) into n from public.documents where id = 'e3153000-0000-4000-8000-000000000002';
  if n <> 1 then
    raise exception 'P3-15: deleting one document removed another';
  end if;
end
$$;

rollback;
