#!/usr/bin/env node
// prove-no-destructive-migration.mjs
// Proves check-no-destructive-migration.mjs REFUSES, on fixtures written for it.
// A check that has never been seen to fail is not a check.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const CHECK = join(ROOT, 'scripts/poc-free/check-no-destructive-migration.mjs');
const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}`);
  if (!pass && detail) console.log(`      ${detail}`);
};

function runOn(sql, filename = '0999_fixture.sql') {
  const dir = mkdtempSync(join(tmpdir(), 'rc-destructive-'));
  mkdirSync(join(dir, 'migrations'), { recursive: true });
  const path = join(dir, 'migrations', filename);
  writeFileSync(path, sql, 'utf8');
  try {
    const out = execFileSync(process.execPath, [CHECK, path], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, out };
  } catch (e) {
    return { status: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('\n1. each of the three forbidden statements turns it red, on its own');
for (const [label, sql] of [
  ['DROP TABLE', 'begin;\ndrop table public.products;\ncommit;\n'],
  ['TRUNCATE', 'begin;\ntruncate public.products;\ncommit;\n'],
  ['DELETE', "begin;\ndelete from public.products where sku = 'x';\ncommit;\n"],
]) {
  const r = runOn(sql);
  record(`${label} is refused`, r.status === 1 && r.out.includes(label), `exit ${r.status}`);
  record(`  ...and the statement is QUOTED verbatim`, r.out.toLowerCase().includes(sql.split('\n')[1].toLowerCase().slice(0, 20)), r.out.slice(0, 200));
}

console.log('\n2. a DELETE hidden among permitted statements is still found');
{
  const sql = `begin;
alter table public.t add column if not exists z integer;
comment on column public.t.z is 'x';
delete from public.t where z is null;
create index if not exists t_z on public.t (z);
commit;
`;
  const r = runOn(sql);
  record('a DELETE in the middle of a real-looking migration is refused', r.status === 1 && r.out.includes('DELETE'), `exit ${r.status}`);
}

console.log('\n3. the CONTROL: statements that remove a RULE about rows, never a row, PASS');
{
  const sql = `begin;
alter table public.t drop constraint if exists t_chk;
drop index if exists t_idx;
drop policy if exists t_pol on public.t;
drop trigger if exists t_trg on public.t;
alter table public.t alter column z drop default;
alter type public.unit_code add value if not exists 'q';
commit;
`;
  const r = runOn(sql);
  record('DROP CONSTRAINT, DROP INDEX, DROP POLICY, DROP TRIGGER, DROP DEFAULT and ADD VALUE all pass', r.status === 0, r.out.slice(0, 400));
  record('  ...and this proves it does not simply refuse the word DROP', r.status === 0);
}

console.log('\n4. it sees what check-pending-schema-reads cannot');
{
  const r = runOn("alter type public.unit_code add value if not exists 'q';\n");
  const seen = r.status === 0 && /1 statement\(s\)/.test(r.out);
  record('an enum addition is PARSED and classified, not skipped', seen, r.out.slice(0, 300));
}

console.log('\n5. a file it cannot parse is a FAILURE, never a pass');
{
  const r = runOn('this is not sql at all;\n');
  record('an unparseable migration is refused', r.status === 1 && r.out.includes('UNPARSEABLE'), `exit ${r.status}: ${r.out.slice(0, 200)}`);
}

console.log('\n6. FAIL CLOSED: a statement kind the check has not been taught is refused');
{
  // LISTEN is valid PostgreSQL, parses cleanly, is in no forbidden set, and is
  // in no permitted set either. It stands in for the statement class nobody has
  // thought of yet, which is the whole case this rule exists for.
  const r = runOn('listen my_channel;\n');
  record('an unclassified statement kind refuses the pull request', r.status === 1 && r.out.includes('FAIL-CLOSED'), `exit ${r.status}: ${r.out.slice(0, 250)}`);
}

console.log('\n7. the input count is asserted against the parse count');
{
  const r = runOn('select 1;\n');
  record('a clean single file reports 1 parsed', r.status === 0 && /1 file\(s\) parsed/.test(r.out), r.out.slice(0, 200));
  const missing = (() => {
    try {
      execFileSync(process.execPath, [CHECK, join(ROOT, 'supabase/migrations/does-not-exist.sql')], {
        cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { status: 0, out: '' };
    } catch (e) { return { status: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') }; }
  })();
  record('a named file that is not on disk is refused, not skipped', missing.status === 1 && missing.out.includes('MISSING'), `exit ${missing.status}`);
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed} of ${results.length} proofs passed`);
if (failed > 0) process.exit(1);
