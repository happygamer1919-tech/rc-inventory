-- assertions/0036_supplier_document_series.sql
-- Card EXT-11. The supplier's document series and number, asserted against the
-- finished schema.
--
-- WHAT THE CARD'S ACCEPTANCE DEMANDS, VERBATIM: "an assertions file proving a
-- row carrying a series and a row carrying none both INSERT". Both are below,
-- and the second is the one that matters: the card's defaults say a callback
-- that omits the series is still accepted, and a column that quietly refused a
-- null would turn that promise into a 500 on Andre's side.

do $$
declare
  n   integer;
  txt text;
  t   text;
  c   text;
begin
  -- --- all four columns exist, and every one of them is NULLABLE -------------
  --
  -- Asserted as a loop over the pairs rather than four copied blocks, so that a
  -- column added to the set later cannot be added to the migration and
  -- forgotten here.
  foreach t in array array['extraction_drafts', 'inbound_orders'] loop
    foreach c in array array['order_ref', 'order_ref_series'] loop
      select count(*) into n
      from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = c;
      if n <> 1 then
        raise exception 'public.%.% is missing', t, c;
      end if;

      select is_nullable into txt
      from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = c;
      if txt <> 'YES' then
        raise exception 'public.%.% is NOT NULL, and the absence of a supplier reference is not an error', t, c;
      end if;

      -- No default, for the same reason 0033 has none: a default would rewrite
      -- every row stored before this migration into a claim nobody made.
      select coalesce(column_default, '(none)') into txt
      from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = c;
      if txt <> '(none)' then
        raise exception 'public.%.% carries a column default (%), which would rewrite rows that predate it', t, c, txt;
      end if;
    end loop;
  end loop;

  -- --- OUR reference is untouched, and still unique --------------------------
  --
  -- The whole card turns on theirs and ours being different things. If this
  -- migration had disturbed inbound_orders.reference, the identifier we generate
  -- would have stopped being the one we can rely on, silently.
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'inbound_orders'
    and column_name = 'reference' and is_nullable = 'NO';
  if n <> 1 then
    raise exception 'inbound_orders.reference is no longer a NOT NULL column';
  end if;

  select count(*) into n
  from pg_constraint
  where conrelid = 'public.inbound_orders'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) like '%reference%';
  if n < 1 then
    raise exception 'the unique constraint on inbound_orders.reference is gone';
  end if;
end $$;

-- --- a row WITH a series inserts, and a row WITHOUT one inserts too ----------
--
-- One block, because both are expected to succeed: the point is that neither
-- shape is refused. A failure of either aborts the block and is reported with
-- the server's own message, so a reader sees WHICH shape was refused.
do $$
begin
  insert into public.extraction_drafts
    (order_id, document_path, document_filename, mime_type, size_bytes, order_ref, order_ref_series)
  values
    ('00000000-0000-4000-8000-0000000e11a1'::uuid, 'p', 'f.pdf', 'application/pdf', 1, '0009312', 'TG');

  insert into public.extraction_drafts
    (order_id, document_path, document_filename, mime_type, size_bytes, order_ref, order_ref_series)
  values
    ('00000000-0000-4000-8000-0000000e11b2'::uuid, 'p', 'f.pdf', 'application/pdf', 1, '0009312', null);

  -- And a third supplier issuing the same NUMBER under a different series is two
  -- different documents, which is the sentence the card was authored from. It
  -- inserts, because nothing here is unique on the pair.
  insert into public.extraction_drafts
    (order_id, document_path, document_filename, mime_type, size_bytes, order_ref, order_ref_series)
  values
    ('00000000-0000-4000-8000-0000000e11c3'::uuid, 'p', 'f.pdf', 'application/pdf', 1, '0009312', 'AV');
exception when others then
  raise exception 'a legal supplier document reference was REFUSED: %', sqlerrm;
end $$;

-- The three fixture rows are removed so this file leaves nothing behind. It runs
-- against a shim, never against a real database, but a fixture that survives its
-- own assertion is a fixture somebody will later mistake for data.
delete from public.extraction_drafts
where order_id in (
  '00000000-0000-4000-8000-0000000e11a1'::uuid,
  '00000000-0000-4000-8000-0000000e11b2'::uuid,
  '00000000-0000-4000-8000-0000000e11c3'::uuid
);
