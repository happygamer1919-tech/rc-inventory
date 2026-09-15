-- 0044_documents.sql
-- RC Inventory phase 3, card P3-15. Documents per client and per project:
-- contracts, acts, invoices and site photos, kept in the rc-docs bucket that
-- 0002 already provisioned.
--
-- WHAT IT ADDS, AND IT REMOVES NOTHING
--
--   type      public.document_kind                 contract, act, factura, foto, altele
--   table     public.documents                     one row per stored file
--   table     public.document_deletions            which document was removed, by whom, when
--   function  public.record_document_deletion()    the trigger function that writes that record
--   trigger   documents_record_deletion            before delete on public.documents
--   update    storage.buckets, row rc-docs         20 MB and nine file types, was 10 MB and three
--   policy    rc_docs_delete on storage.objects    owner only, rc-docs client/ and project/ only
--
-- NO DELETE, NO DROP AND NO TRUNCATE RUN IN THIS FILE. The one UPDATE changes the
-- rc-docs bucket row in place: its size ceiling goes up and its list of types
-- grows. Every object already stored is inside both the old and the new limits,
-- so no stored file is affected and nothing that was accepted is now refused.
--
-- NUMBER 0044, NOT 0042. On the day this was written, pull request #290 (card
-- EXT-28) held 0042 and 0043 on its own branch. A number taken twice is the 0032
-- incident in CLAUDE.md 3.1.
--
-- ===========================================================================
-- THE THREE DECISIONS THIS FILE CARRIES
-- ===========================================================================
--
-- 1. THE BUCKET IS WIDENED, not a second bucket created. Card P3-15 decides 20 MB
--    and nine types (pdf, jpg, jpeg, png, webp, doc, docx, xls, xlsx). 0002 set
--    10 MB and three types for supplier confirmations, and Supabase refuses a file
--    outside the bucket's own limits before the application ever sees it, so the
--    card's limits were unreachable without this. Asked of the owner as q013,
--    recommended default taken: widen it here.
--
-- 2. DELETE IS ALLOWED ON A DOCUMENT, AND IT IS THE ONE DELIBERATE EXCEPTION.
--    Card P3-15: a document uploaded to the wrong client is a confidentiality
--    problem, and deactivating it does not solve that. public.documents carries
--    an owner-only delete policy, and rc-docs gets an owner-only delete policy on
--    storage.objects. 0002 had none, for every role, because an inbound order
--    document backs its order forever. THE STORAGE DELETE REACHES ONLY THIS
--    CARD'S OWN FOLDERS, client/ and project/. An inbound order document lives
--    under inbound/ (lib/data/inbound-actions.ts) and stays undeletable by every
--    role, owner included, as 0002 intended. An earlier draft of this file let an
--    owner delete anywhere in the bucket; the owner had it narrowed before the
--    merge (q013). It is scoped to public.is_owner(), so an account manager
--    cannot use it.
--
-- 3. WHO DELETED A DOCUMENT IS WRITTEN BY THE DATABASE, NOT BY THE APPLICATION.
--    A trigger copies the row into public.document_deletions, with auth.uid(),
--    before the row goes and in the same transaction as the delete. A delete
--    that arrives by any path leaves the record, which is the reasoning 0021
--    gives about a status that changes without its history row. status_history
--    was considered and not used: it records a move between two states of a row
--    that still exists, and this row does not.
--
-- ===========================================================================
--
-- MERGING THIS FILE APPLIES IT TO PRODUCTION, within about two minutes, through
-- the Supabase GitHub app. CLAUDE.md 8.0 and ruling R-124. The application code
-- that reads the new table ships in the same merge and asks first whether it
-- exists (hasDocuments in lib/data/schema-capability.ts), so the minutes between
-- the code landing and this file landing show a Romanian "not active yet" state
-- on the Documente tab rather than an error.
--
-- IT RUNS AS ONE TRANSACTION and is NOT safe to run twice: a second run fails on
-- CREATE TYPE and rolls the whole file back.
--
-- PROVEN BEFORE IT WAS MERGED by `npm run check:migrations`, which applies it
-- unmodified to a throwaway postgres:16 and then runs
-- scripts/poc-free/local-db/assertions/0044_documents.sql.

begin;


-- ===========================================================================
-- 1. WHAT KIND OF DOCUMENT
-- ===========================================================================
--
-- FIVE VALUES, from the card. An enum and not text for the reason 0016 gives for
-- project_status: five spellings of one kind in a text column is a filter that
-- silently misses rows. 'altele' exists so nobody mislabels a document to make
-- the form accept it. The Romanian labels live in the application.

create type public.document_kind as enum ('contract', 'act', 'factura', 'foto', 'altele');

comment on type public.document_kind is
  'What a stored document is. Card P3-15. Labels in the interface: Contract, Act, Factură, Fotografie, Altele.';


-- ===========================================================================
-- 2. THE DOCUMENTS
-- ===========================================================================

create table public.documents (
  id             uuid                 primary key default gen_random_uuid(),
  -- ON DELETE RESTRICT on both, as projects.client_id in 0016. Clients and
  -- projects are deactivated, never deleted, and a document must not be the thing
  -- that silently disappears if one ever is.
  client_id      uuid                 null references public.clients (id) on delete restrict,
  project_id     uuid                 null references public.projects (id) on delete restrict,
  storage_path   text                 not null unique,
  original_name  text                 not null,
  mime_type      text                 not null,
  size_bytes     bigint               not null,
  kind           public.document_kind not null,
  notes          text                 null,
  uploaded_by    uuid                 default auth.uid() references auth.users (id) on delete set null,
  created_at     timestamptz          not null default now(),
  updated_at     timestamptz          not null default now(),

  -- A DOCUMENT BELONGS TO A CLIENT OR TO A PROJECT, never to both and never to
  -- neither. A project already names its client, so both set would be two
  -- answers to one question that can disagree.
  constraint documents_one_owner
    check (num_nonnulls(client_id, project_id) = 1),

  -- THE STORAGE PATH IS STRUCTURED AND NEVER DERIVED FROM THE FILE NAME:
  -- client/<client_id>/<uuid>.<ext> or project/<project_id>/<uuid>.<ext>. A
  -- user-supplied name in a storage path is a traversal question nobody needs to
  -- have. The original name is kept in original_name, for display only.
  constraint documents_storage_path_shape
    check (storage_path ~ '^(client|project)/[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{1,5}$'),

  -- AND THE PATH NAMES THE ROW'S OWN CLIENT OR PROJECT, so a row cannot point at
  -- a file filed under somebody else.
  constraint documents_storage_path_matches_owner
    check (
      (client_id is not null and storage_path like ('client/' || client_id::text || '/%'))
      or (project_id is not null and storage_path like ('project/' || project_id::text || '/%'))
    ),

  -- 20 MB, the same ceiling as the bucket below. An empty file is not a document.
  constraint documents_size_within_limit
    check (size_bytes > 0 and size_bytes <= 20971520)
);

comment on table public.documents is
  'Files attached to a client or to a project. Card P3-15. The file itself is an object in the private rc-docs bucket at storage_path and is read only through a short-lived signed link. The one table in phase 3 with a delete policy: a document on the wrong client is a confidentiality problem, so an owner may remove the row and the object, and the trigger documents_record_deletion writes who did it into public.document_deletions.';
comment on column public.documents.original_name is
  'The file name as uploaded, for display only. Never part of storage_path.';
comment on column public.documents.mime_type is
  'The canonical type for the file extension, checked on the server against the first bytes of the stored object before this row is written.';

-- AN INDEX ON EVERY FOREIGN KEY, ON THE REFERENCING SIDE. Postgres indexes only
-- the referenced side, and both tabs filter on the other one, newest first.
create index documents_client_id_idx on public.documents (client_id, created_at desc);
create index documents_project_id_idx on public.documents (project_id, created_at desc);
create index documents_uploaded_by_idx on public.documents (uploaded_by);

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- RLS COPIED FROM 0013, with the one exception the card names. anon is revoked
-- explicitly rather than assumed, because Supabase grants anon and authenticated
-- at CREATE TABLE time from project-level default privileges.
revoke all on table public.documents from anon;
grant select, insert, update, delete on table public.documents to authenticated;

alter table public.documents enable row level security;

create policy documents_select on public.documents
  for select to authenticated using (true);

create policy documents_insert on public.documents
  for insert to authenticated with check (public.is_owner());

create policy documents_update on public.documents
  for update to authenticated
  using (public.is_owner())
  with check (public.is_owner());

create policy documents_delete on public.documents
  for delete to authenticated using (public.is_owner());


-- ===========================================================================
-- 3. WHO DELETED WHICH DOCUMENT
-- ===========================================================================
--
-- A RECORD OF SOMETHING THAT NO LONGER EXISTS, so client_id, project_id and
-- uploaded_by carry no foreign key: a reference would make this record a reason
-- the thing it describes could not change. deleted_by does reference auth.users,
-- on delete set null, the same as created_by everywhere else.
--
-- ONLY THE TRIGGER WRITES IT. authenticated gets select and nothing else, and the
-- select is for owners only: the record keeps the original file name, and the
-- whole reason a document is deleted can be that its name sat on the wrong client.

create table public.document_deletions (
  id             uuid                 primary key default gen_random_uuid(),
  document_id    uuid                 not null,
  client_id      uuid                 null,
  project_id     uuid                 null,
  storage_path   text                 not null,
  original_name  text                 not null,
  kind           public.document_kind not null,
  uploaded_by    uuid                 null,
  uploaded_at    timestamptz          not null,
  deleted_by     uuid                 null references auth.users (id) on delete set null,
  deleted_at     timestamptz          not null default now()
);

comment on table public.document_deletions is
  'One row per document removed from public.documents, written by the trigger documents_record_deletion in the same transaction as the delete. deleted_by is auth.uid() at that moment, null only for a delete made without a signed-in user. Card P3-15.';

create index document_deletions_document_id_idx on public.document_deletions (document_id);
create index document_deletions_deleted_by_idx on public.document_deletions (deleted_by);

revoke all on table public.document_deletions from anon;
revoke all on table public.document_deletions from authenticated;
grant select on table public.document_deletions to authenticated;

alter table public.document_deletions enable row level security;

create policy document_deletions_select on public.document_deletions
  for select to authenticated using (public.is_owner());

-- SECURITY DEFINER, with a fixed search_path, so the record is written whatever
-- the deleting role may insert, and nobody can write one any other way.
create function public.record_document_deletion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.document_deletions
    (document_id, client_id, project_id, storage_path, original_name, kind,
     uploaded_by, uploaded_at, deleted_by, deleted_at)
  values
    (old.id, old.client_id, old.project_id, old.storage_path, old.original_name, old.kind,
     old.uploaded_by, old.created_at, auth.uid(), clock_timestamp());
  return old;
end;
$$;

comment on function public.record_document_deletion() is
  'Trigger function for documents_record_deletion. Copies the row being deleted into public.document_deletions with auth.uid() as deleted_by. Card P3-15.';

revoke all on function public.record_document_deletion() from public;
revoke all on function public.record_document_deletion() from anon;

create trigger documents_record_deletion
  before delete on public.documents
  for each row execute function public.record_document_deletion();


-- ===========================================================================
-- 4. THE BUCKET: 20 MB AND NINE TYPES, AND AN OWNER MAY DELETE
-- ===========================================================================
--
-- The types are the canonical ones for the card's nine extensions; jpg and jpeg
-- are one type. The application stores every file under the type of its
-- extension, after checking the first bytes of the file on the server.

update storage.buckets
set file_size_limit = 20971520,
    allowed_mime_types = array[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
where id = 'rc-docs';

-- AN UPDATE THAT MATCHES NOTHING SUCCEEDS SILENTLY. Without this the file would
-- apply cleanly on a project where rc-docs is missing and every upload would
-- then be refused for a reason nobody could see.
do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'rc-docs' and file_size_limit = 20971520 and public = false
  ) then
    raise exception 'P3-15: the rc-docs bucket was not widened: it is missing, public, or the update did not land';
  end if;
end
$$;

-- ONLY UNDER client/ AND project/, the two folders this card writes. Every other
-- object in rc-docs, the inbound order documents under inbound/ among them, stays
-- undeletable by every role, exactly as 0002 decided. The owner approved this
-- narrowing in the operator's mailbox, q013.
create policy rc_docs_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'rc-docs'
    and public.is_owner()
    and (name like 'client/%' or name like 'project/%')
  );

commit;


-- ===========================================================================
-- 5. VERIFICATION
-- ===========================================================================
-- Runs after COMMIT. Expect two tables with rls_enabled true, four policies on
-- documents and one on document_deletions; the bucket at 20971520 with eight
-- types; four policies named rc_docs_*.

select
  c.relname                as table_name,
  c.relrowsecurity         as rls_enabled,
  count(p.polname)         as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relname in ('documents', 'document_deletions')
group by c.relname, c.relrowsecurity
order by c.relname;

select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'rc-docs';

select policyname, cmd, roles
from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like 'rc_docs_%'
order by policyname;
