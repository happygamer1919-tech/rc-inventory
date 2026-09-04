#!/usr/bin/env node
// check-no-destructive-migration.mjs
//
// REFUSES A PULL REQUEST THAT ADDS OR MODIFIES A MIGRATION CONTAINING
// DROP TABLE, TRUNCATE OR DELETE.
//
// ===========================================================================
// WHY THIS EXISTS AT MERGE TIME AND NOT AT APPLY TIME
// ===========================================================================
//
// CLAUDE.md 8.6 says a migration containing DROP TABLE, TRUNCATE or DELETE is
// never auto-applied, and `scripts/apply-pending-migrations.mjs` enforces that
// at APPLY time. On 2026-09-03 that stopped being the boundary that matters.
//
// A Supabase GitHub app applies merged migrations to production on every push to
// `main`. It was proven twice, by prediction with a control: `page_count` was
// absent from production, PR #180 was merged and PR #177 was left open, and
// within two minutes `page_count` was present while `document_source` was still
// absent. Merging #177 then made `document_source` appear in its turn.
//
// SO MERGE IS APPLY HERE, AND THE APPLIER IS NOT ON THAT PATH. A merged
// migration carrying DROP TABLE would execute against production while every
// terminal in the repository obeyed 8.6 perfectly. This check moves the
// destructive-statement boundary to the only place that now precedes production:
// the pull request.
//
// IT IS NOT GATED ON MIG-01's ANSWER. If the integration is turned off, this is a
// second line of defence behind the applier. If it stays, this is the only line.
// Both readings want it, which is why it is built before the decision.
//
// ===========================================================================
// WHAT THE PARSER SEES, AND WHAT IT DOES NOT
// ===========================================================================
//
// The parse is `pgsql-parser`, the real PostgreSQL grammar compiled to
// WebAssembly, so a parse here is the parse the server does. A REGEX IS NOT
// ACCEPTABLE FOR THIS and the repository has already paid for that lesson twice:
// `check-pending-schema-reads` captured a column named `if` because its pattern
// did not allow `if not exists`, and reported 52 false violations across the
// source tree.
//
// EVERY STATEMENT KIND THIS CHECK KNOWS IS LISTED BELOW, AND ANYTHING ELSE FAILS
// THE PULL REQUEST. That is the fail-closed rule and it is the whole design: a
// statement class nobody anticipated stops the merge until a human classifies
// it, rather than sliding through because no rule named it.
//
// The gap this closes in the existing guard, named because it is the reason the
// rule is written this way: `check-pending-schema-reads` builds its object list
// from `create table`, `alter table ... add column` and `create function` and
// NOTHING ELSE, so `alter type ... add value` is INVISIBLE to it. An enum
// addition can therefore never force a capability gate there. This check sees
// `AlterEnumStmt` because it asks the grammar rather than a pattern.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadModule, parseSync } from 'pgsql-parser';

const ROOT = new URL('../..', import.meta.url).pathname;
const MIGRATIONS = process.env.RC_DESTRUCTIVE_MIGRATIONS
  ? (process.env.RC_DESTRUCTIVE_MIGRATIONS.startsWith('/')
      ? process.env.RC_DESTRUCTIVE_MIGRATIONS
      : join(ROOT, process.env.RC_DESTRUCTIVE_MIGRATIONS))
  : join(ROOT, 'supabase/migrations');

// --- THE FORBIDDEN SET, AND IT IS EXACTLY CLAUDE.md 8.6's ---------------------
// The test 8.6 states: does executing this statement reduce the number of rows
// in any table? DROP TABLE takes the rows with the table. TRUNCATE and DELETE
// remove rows by definition.
const FORBIDDEN = new Map([
  ['DeleteStmt', 'DELETE'],
  ['TruncateStmt', 'TRUNCATE'],
]);
const FORBIDDEN_DROP = new Map([['OBJECT_TABLE', 'DROP TABLE']]);

// --- WHAT IS SEEN AND EXPLICITLY PERMITTED -----------------------------------
// Each entry is a statement kind the grammar reports that this check has been
// taught to classify. CLAUDE.md 8.6 permits every one of them: they change a
// schema object or a rule about rows, and none removes a row.
//
// ADDING A KIND HERE IS A DECISION SOMEBODY MAKES AND CAN BE READ IN A DIFF.
// That is the point of the list being explicit rather than a default-allow.
const PERMITTED = new Map([
  ['SelectStmt', 'a read. Verification blocks at the end of a migration are these.'],
  ['InsertStmt', 'adds rows. It cannot reduce a row count.'],
  ['UpdateStmt', 'changes rows in place. It cannot reduce a row count.'],
  ['CreateStmt', 'CREATE TABLE.'],
  ['CreateSchemaStmt', 'CREATE SCHEMA.'],
  ['CreateEnumStmt', 'CREATE TYPE ... AS ENUM.'],
  ['AlterEnumStmt', 'ALTER TYPE ... ADD VALUE. INVISIBLE to check-pending-schema-reads, which is why this list exists.'],
  ['AlterTableStmt', 'ADD COLUMN, DROP COLUMN, ADD/DROP CONSTRAINT, SET DEFAULT. See the AlterTable note below.'],
  ['CreateFunctionStmt', 'CREATE FUNCTION or CREATE OR REPLACE FUNCTION.'],
  ['CreateTrigStmt', 'CREATE TRIGGER.'],
  ['IndexStmt', 'CREATE INDEX.'],
  ['CreatePolicyStmt', 'CREATE POLICY.'],
  ['AlterPolicyStmt', 'ALTER POLICY.'],
  ['CommentStmt', 'COMMENT ON.'],
  ['GrantStmt', 'GRANT or REVOKE. Changes who may act, never what rows exist.'],
  ['TransactionStmt', 'BEGIN, COMMIT or ROLLBACK.'],
  ['DoStmt', 'a DO block. See the note below: its body is NOT parsed by this check.'],
  ['VariableSetStmt', 'SET.'],
  ['CreateSeqStmt', 'CREATE SEQUENCE.'],
  ['ViewStmt', 'CREATE VIEW.'],
  ['CreateExtensionStmt', 'CREATE EXTENSION.'],
  ['RenameStmt', 'ALTER ... RENAME. Renames an object, removes no row.'],
  ['AlterOwnerStmt', 'ALTER ... OWNER TO.'],
  ['AlterDefaultPrivilegesStmt', 'ALTER DEFAULT PRIVILEGES.'],
  ['CreateCastStmt', 'CREATE CAST.'],
  ['DefineStmt', 'CREATE AGGREGATE, OPERATOR, COLLATION and similar.'],
]);

// DropStmt is split by target, because DROP is the one keyword that spans both
// sides of 8.6's line: DROP TABLE takes rows with it, DROP INDEX takes a rule
// about rows and no row at all.
const PERMITTED_DROP = new Set([
  'OBJECT_INDEX', 'OBJECT_POLICY', 'OBJECT_TRIGGER', 'OBJECT_FUNCTION',
  'OBJECT_VIEW', 'OBJECT_SEQUENCE', 'OBJECT_TYPE', 'OBJECT_CAST',
  'OBJECT_RULE', 'OBJECT_SCHEMA', 'OBJECT_EXTENSION',
]);

// --- WHAT THIS CHECK DOES **NOT** SEE, STATED RATHER THAN LEFT TO BE FOUND ----
//
//   1. THE BODY OF A DO BLOCK, and of any plpgsql function body. Those are
//      strings to the outer grammar. A `delete from` inside `$$ ... $$` is NOT
//      caught here. It is caught at apply time by the applier, which is why that
//      path is not being removed.
//   2. DYNAMIC SQL, `execute format(...)`. Same reason, and unknowable before
//      it runs.
//   3. WHAT A TRIGGER OR A FUNCTION DOES WHEN LATER CALLED. This check reads the
//      migration, not the future.
//   4. `ALTER TABLE ... DROP COLUMN` is PERMITTED and is deliberately not
//      forbidden: 8.6 draws the line at statements that remove ROWS, and a
//      dropped column removes a field from every row rather than any row. It is
//      still a schema loss and the applier asserts it was DECLARED.
//
// Every one of those is a reason the applier keeps its own assertions. This
// check is the boundary that now precedes production, not a replacement for it.

const args = process.argv.slice(2);
const explicit = args.filter((a) => !a.startsWith('-'));

/** The migration files this pull request adds or modifies. */
function changedFiles() {
  if (explicit.length > 0) return { files: explicit, how: 'named on the command line' };
  const base = process.env.RC_DESTRUCTIVE_BASE || 'origin/main';
  try {
    const mergeBase = execFileSync('git', ['merge-base', base, 'HEAD'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    const out = execFileSync(
      'git',
      ['diff', '--name-only', '--diff-filter=AM', `${mergeBase}...HEAD`, '--', 'supabase/migrations'],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const files = out.split('\n').map((l) => l.trim()).filter((l) => l.endsWith('.sql'))
      .map((l) => join(ROOT, l));
    return { files, how: `added or modified against ${base} (${mergeBase.slice(0, 7)})` };
  } catch {
    // FAILS OPEN INTO CHECKING EVERYTHING, never into checking nothing. When the
    // base cannot be resolved the safe answer is MORE work, not less: the same
    // rule the applier proof follows.
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
      .map((f) => join(MIGRATIONS, f));
    return { files, how: 'EVERY migration, because the base commit could not be resolved' };
  }
}

await loadModule();

const { files, how } = changedFiles();
console.log(`check-no-destructive-migration: ${files.length} file(s), ${how}`);

const violations = [];
const unknown = [];
let parsedCount = 0;
let statementCount = 0;

for (const path of files) {
  if (!existsSync(path)) {
    // A file named as changed that is not on disk is a RENAME or a DELETE, and
    // the diff filter above already excludes deletions. Reaching here means the
    // input and the tree disagree, which is exactly the divergence this check
    // refuses to paper over.
    violations.push({ file: path, kind: 'MISSING', text: 'named as added or modified, but not present on disk' });
    continue;
  }
  const sql = readFileSync(path, 'utf8');
  let stmts;
  try {
    const parsed = parseSync(sql);
    stmts = parsed.stmts ?? parsed;
  } catch (err) {
    // A FILE IT CANNOT PARSE IS A FAILURE, NEVER A PASS. An unparseable
    // migration is one whose contents nobody has established, and "I could not
    // read it" must never render as "it is clean".
    violations.push({ file: path, kind: 'UNPARSEABLE', text: String(err && err.message ? err.message : err) });
    continue;
  }
  parsedCount += 1;

  for (const s of stmts) {
    const kind = Object.keys(s.stmt ?? {})[0];
    const node = (s.stmt ?? {})[kind] ?? {};
    statementCount += 1;
    const text = quote(sql, s);

    if (FORBIDDEN.has(kind)) {
      violations.push({ file: path, kind: FORBIDDEN.get(kind), text });
      continue;
    }
    if (kind === 'DropStmt') {
      const target = node.removeType;
      if (FORBIDDEN_DROP.has(target)) {
        violations.push({ file: path, kind: FORBIDDEN_DROP.get(target), text });
      } else if (!PERMITTED_DROP.has(target)) {
        unknown.push({ file: path, kind: `DropStmt ${target}`, text });
      }
      continue;
    }
    if (!PERMITTED.has(kind)) unknown.push({ file: path, kind, text });
  }
}

/** The statement as it appears in the file, so a reader sees what ran rather
 *  than a description of it. CLAUDE.md 8.6 requires the quote verbatim. */
function quote(sql, s) {
  const start = s.stmt_location ?? 0;
  const len = s.stmt_len;
  const raw = len ? sql.slice(start, start + len) : sql.slice(start);
  return raw.trim().replace(/\s+/g, ' ').slice(0, 300);
}

// --- THE COUNT ASSERTION -----------------------------------------------------
// The number of files handed in must equal the number parsed. They diverge
// exactly when a file was skipped, and a check that silently skips its input is
// a check that reports success about work it did not do.
const expected = files.length;
const accountedFor = parsedCount + violations.filter((v) => v.kind === 'UNPARSEABLE' || v.kind === 'MISSING').length;
if (accountedFor !== expected) {
  console.error(`\ncheck-no-destructive-migration: INPUT AND PARSE COUNT DIVERGE.`);
  console.error(`  handed in: ${expected}`);
  console.error(`  accounted for: ${accountedFor} (${parsedCount} parsed, ${accountedFor - parsedCount} refused)`);
  console.error('A file that was neither parsed nor refused was silently skipped. Refusing to report OK.');
  process.exit(2);
}

if (violations.length > 0 || unknown.length > 0) {
  console.error('');
  if (violations.length > 0) {
    console.error('REFUSED. A migration in this pull request removes rows, or could not be read.\n');
    console.error('MERGING A MIGRATION APPLIES IT ON THIS REPOSITORY. This is not a warning about');
    console.error('a later step: there is no later step.\n');
    for (const v of violations) {
      console.error(`  ${v.file.slice(ROOT.length).replace(/^\/+/, '')}`);
      console.error(`      ${v.kind}: ${v.text}`);
    }
  }
  if (unknown.length > 0) {
    console.error('\nREFUSED, FAIL-CLOSED. A statement kind this check has not been taught:\n');
    for (const u of unknown) {
      console.error(`  ${u.file.slice(ROOT.length).replace(/^\/+/, '')}`);
      console.error(`      ${u.kind}: ${u.text}`);
    }
    console.error('\nClassify it in PERMITTED or in the forbidden set, in this file, with its');
    console.error('reason next to it. A default-allow would let the next unanticipated statement');
    console.error('class through precisely because nobody had thought of it.');
  }
  process.exit(1);
}

console.log(
  `check-no-destructive-migration: OK. ${parsedCount} file(s) parsed, ${statementCount} statement(s), ` +
  'no DROP TABLE, no TRUNCATE, no DELETE, and every statement kind classified.',
);
