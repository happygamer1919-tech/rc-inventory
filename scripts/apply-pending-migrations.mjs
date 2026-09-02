#!/usr/bin/env node
// apply-pending-migrations.mjs
// Card P3-27a. THE ASSERTION-BEARING MIGRATION APPLIER.
//
// WHAT THIS IS. The only mechanism by which a terminal may apply merged
// migrations to the production database, under the ruling that amended
// CLAUDE.md 8.6 (R-082). Everything about it exists to remove a decision from
// whoever is at the keyboard.
//
//   - the whole batch runs inside ONE transaction
//   - the pending register and the applied ledger are recorded BEFORE and AFTER
//   - every assertion is evaluated IN SQL, inside that transaction, after the
//     mutations and before the commit
//   - it commits ONLY on all-pass; otherwise it rolls back whole and exits
//     non-zero naming EVERY failure
//   - IT NEVER CHOOSES. It does not read a grid and decide. It does not judge
//     whether a count is close enough. It does not continue past a deviation
//     because the deviation is explainable. The script decides; the terminal
//     reports what the script decided and nothing else.
//
// R-047 IS A DIFFERENT GRANT AND THIS DOES NOT RIDE ON IT. R-047 permits a
// terminal to execute an assertion-bearing SCRIPT against the phase 2 database.
// It says in terms that MIGRATIONS ARE NOT IN SCOPE, because migrations have
// their own path in 8.5 and their own stop in 8.6. R-049, R-056 and R-059
// widened the SELF-MERGE grant and touched none of that: merging a migration
// file is not applying it. So the gap this file closes was real and open, and
// it is closed explicitly by R-082 rather than by inference from any of them.
//
// THE ABSOLUTE EXCLUSION IS UNCHANGED. DROP TABLE, TRUNCATE and DELETE are
// never applied by this script or by any other. Encountering one is an
// immediate refusal with the statement quoted, and the card goes blocked on the
// owner. DROP FUNCTION is permitted, and only under the dependency assertion in
// section 6 below.
//
// HOW IT REACHES A DATABASE, AND WHY THERE IS NO HOST ARGUMENT.
// It takes NO connection argument. Two targets exist and each must be named
// deliberately in the environment:
//
//   RC_APPLY_TARGET=shim        with RC_APPLY_CONTAINER=<docker container name>
//                               psql runs INSIDE that container, over its unix
//                               socket. This is what the proof harness uses and
//                               it cannot reach anything on a network.
//
//   RC_APPLY_TARGET=production  psql runs on this machine against the PG*
//                               environment variables (PGHOST, PGPORT, PGUSER,
//                               PGDATABASE, PGPASSWORD). PG* rather than a
//                               connection string, per CLAUDE.md 8.3: a
//                               connection string appears in error messages and
//                               a PG* variable does not.
//
// A BARE RUN WITH NO RC_APPLY_TARGET DOES NOTHING. There is no default, because
// a default would eventually be the wrong one.
//
// IT NEVER USES `docker cp`. That kills Docker Desktop on the build machine.
// SQL is delivered on stdin to `docker exec -i`.
//
// EXIT CODES, part of the contract:
//   0  applied and committed, every assertion passed. Or: nothing was pending.
//   1  an assertion failed. Rolled back whole. Every failure named on stderr.
//   2  a forbidden statement was found. NOTHING was executed. Statement quoted.
//   3  the environment is not usable (no target, no psql, no container).
//   4  the tree is not shaped the way this script expects.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadModule, parseSync } from "pgsql-parser";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
// THE TWO OVERRIDES BELOW ARE HONOURED ONLY WHEN THE TARGET IS THE SHIM.
// The proof harness needs to point this script at a mutated copy of the tree so
// that a deliberately broken migration can be shown to roll the batch back. On
// the production target both paths are fixed and no environment variable can
// move them, so a mutated tree can never be applied to the client's database.
const shimTarget = process.env.RC_APPLY_TARGET === "shim";
// A DRY RUN NEVER EXECUTES ANYTHING, so it is safe to let it read a fixture tree
// even when the named target is production. That is what makes the
// production-only deploy gate testable without weakening the rule that a mutated
// tree can never be APPLIED to the client's database: this mode exits before the
// first psql call, always.
const dryRun = process.env.RC_APPLY_DRY_RUN === "yes";
const overridable = shimTarget || dryRun;
const MIGRATIONS_DIR =
  (overridable && process.env.RC_APPLY_MIGRATIONS_DIR) || join(ROOT, "supabase", "migrations");
const APPLY_LOG =
  (overridable && process.env.RC_APPLY_REGISTER) || join(ROOT, "docs", "migrations", "APPLY-LOG.md");
const WRITES_LOG = join(ROOT, "docs", "PRODUCTION-WRITES.md");

const EXIT_OK = 0;
const EXIT_ASSERTION_FAILED = 1;
const EXIT_FORBIDDEN = 2;
const EXIT_ENV = 3;
const EXIT_BAD_TREE = 4;

const out = (s) => process.stdout.write(s);
const err = (s) => process.stderr.write(s);

function die(code, message) {
  err(`\n${message}\n`);
  process.exit(code);
}

// ---------------------------------------------------------------------------
// 1. THE PENDING REGISTER
// ---------------------------------------------------------------------------
//
// Read from docs/migrations/APPLY-LOG.md, the same lines and the same shape
// check-pending-schema-reads.mjs reads. One source of truth for "what is
// pending", so the two can never disagree about it.

// THE CARD ID ACCEPTS A LOWERCASE SUFFIX, AND THAT IS A BUG FIX RATHER THAN A
// LOOSENING. The pattern was `[A-Z0-9-]+`, so `P3-04b` did not match and the
// register reported ZERO pending files while a line for it sat right there.
// tests/e2e/headers.spec.ts fails loudly on that state, but THIS script does
// not: a batch of nothing exits 0 and reports "already current", which is the
// worst possible way to be wrong about a migration. Card ids on this board have
// carried lowercase suffixes since P3-04b was authored.
function pendingFromRegister() {
  if (!existsSync(APPLY_LOG)) die(EXIT_BAD_TREE, `apply log not found at ${APPLY_LOG}`);
  const log = readFileSync(APPLY_LOG, "utf8");
  const files = [];
  for (const line of log.split("\n")) {
    const m = /^-\s+`(\d{4}_[a-z0-9_]+\.sql)`\s*,\s*card de aplicare\s+[A-Za-z0-9-]+\s*$/.exec(
      line.trim(),
    );
    if (m) files.push(m[1]);
  }
  return files;
}

// ---------------------------------------------------------------------------
// 2. THE FORBIDDEN SET, DECIDED BY THE REAL GRAMMAR AND NOT BY A REGEX
// ---------------------------------------------------------------------------
//
// pgsql-parser is the PostgreSQL grammar compiled to WebAssembly, so a parse
// here is the parse the server does. A regex over SQL text cannot tell a
// `delete` inside a string literal or a comment from a DELETE statement, and
// the difference is the whole point of the rule.
//
// DROP TABLE, TRUNCATE, DELETE  -> refuse, nothing executes, exit 2
// DROP FUNCTION                 -> permitted, gated by the dependency assertion

const DROP_OBJECT_TABLE = "OBJECT_TABLE";
const DROP_OBJECT_FUNCTION = "OBJECT_FUNCTION";

function classifyStatements(sql, label) {
  const parsed = parseSync(sql);
  const stmts = Array.isArray(parsed?.stmts) ? parsed.stmts : [];
  const forbidden = [];
  const dropFunctions = [];
  const transactions = [];
  const enumAdds = [];
  const kinds = [];

  stmts.forEach((s, i) => {
    const kind = Object.keys(s.stmt ?? {})[0];
    const loc = s.stmt_location ?? 0;
    const len = s.stmt_len ?? sql.length - loc;
    const text = sql.slice(loc, loc + len).trim();

    if (kind !== "TransactionStmt") kinds.push(kind);
    if (kind === "AlterEnumStmt") enumAdds.push({ label, node: s.stmt.AlterEnumStmt, text });
    if (kind === "TransactionStmt") {
      transactions.push({ index: i, loc, len, kind: s.stmt.TransactionStmt.kind, text });
      return;
    }
    if (kind === "DeleteStmt") forbidden.push({ label, kind: "DELETE", text });
    if (kind === "TruncateStmt") forbidden.push({ label, kind: "TRUNCATE", text });
    if (kind === "DropStmt") {
      const removeType = s.stmt.DropStmt.removeType;
      if (removeType === DROP_OBJECT_TABLE) forbidden.push({ label, kind: "DROP TABLE", text });
      if (removeType === DROP_OBJECT_FUNCTION) dropFunctions.push({ label, text });
    }
  });

  return { stmts, forbidden, dropFunctions, transactions, enumAdds, kinds };
}

// ---------------------------------------------------------------------------
// 3. ONE TRANSACTION, WHICH MEANS THE INNER ONES HAVE TO GO
// ---------------------------------------------------------------------------
//
// EVERY MIGRATION FILE OPENS AND CLOSES ITS OWN TRANSACTION. PostgreSQL has no
// nested transactions: an inner `begin` inside an open transaction is a warning
// and an inner `commit` COMMITS THE OUTER ONE. Concatenating the files as they
// are and wrapping the result in `begin ... commit` would therefore produce
// thirteen separate transactions wearing one, and the first inner `commit`
// would make everything before it permanent. A batch that cannot roll back
// whole is the thing this script exists to prevent, so this is not cosmetic.
//
// THE ONLY BYTES REMOVED ARE TOP-LEVEL TRANSACTION CONTROL, AND THAT IS PROVEN
// RATHER THAN PROMISED. Each file is parsed, the byte range of each
// TransactionStmt is blanked to spaces of equal length so every other byte
// keeps its offset, and the result is RE-PARSED and compared statement by
// statement against the original minus its transaction statements. A mismatch
// in count or in kind refuses the run. Nothing is rewritten, reordered,
// reindented or deparsed: the bytes that execute are the bytes in the file,
// less the two words that would break the batch.

// Dollar-quoted bodies are masked to spaces of equal length before the scan, so
// the `begin` that opens a plpgsql body and the `commit` inside a quoted
// migration string can never be mistaken for transaction control. Offsets in the
// mask are offsets in the original, because the mask preserves length.
function maskDollarQuoted(sql) {
  const chars = [...sql];
  const re = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/g;
  let m;
  let open = null;
  while ((m = re.exec(sql)) !== null) {
    if (open === null) {
      open = { tag: m[0], end: m.index + m[0].length };
    } else if (m[0] === open.tag) {
      for (let i = open.end; i < m.index; i++) if (chars[i] !== "\n") chars[i] = " ";
      open = null;
    }
  }
  return chars.join("");
}

function stripTransactionControl(sql, label) {
  const before = classifyStatements(sql, label);
  const wanted = before.transactions.map((t) => t.kind);

  // stmt_location from the grammar points at the start of the statement
  // INCLUDING its leading comments, so slicing by it lands on a comment rather
  // than on the keyword. The keywords are located by scanning instead, and the
  // scan is then held to the grammar's own count and order.
  const masked = maskDollarQuoted(sql);
  const found = [];
  const lineRe = /^[ \t]*(begin|commit|rollback)[ \t]*;[ \t]*$/gim;
  let m;
  while ((m = lineRe.exec(masked)) !== null) {
    const kind =
      m[1].toLowerCase() === "begin"
        ? "TRANS_STMT_BEGIN"
        : m[1].toLowerCase() === "commit"
          ? "TRANS_STMT_COMMIT"
          : "TRANS_STMT_ROLLBACK";
    found.push({ start: m.index, end: m.index + m[0].length, kind });
  }

  if (found.length !== wanted.length || found.some((f, i) => f.kind !== wanted[i]))
    die(
      EXIT_BAD_TREE,
      `${label}: the grammar reports ${wanted.length} transaction statement(s) [${wanted.join(", ")}] ` +
        `but the scan found ${found.length} [${found.map((f) => f.kind).join(", ")}]. Refusing to guess.`,
    );

  const chars = [...sql];
  for (const f of found) for (let i = f.start; i < f.end; i++) chars[i] = " ";
  const stripped = chars.join("");

  const after = classifyStatements(stripped, label);
  const expected = before.stmts
    .filter((s) => Object.keys(s.stmt ?? {})[0] !== "TransactionStmt")
    .map((s) => Object.keys(s.stmt ?? {})[0]);
  const actual = after.stmts.map((s) => Object.keys(s.stmt ?? {})[0]);

  if (after.transactions.length !== 0)
    die(EXIT_BAD_TREE, `${label}: transaction control survived stripping, refusing to continue`);
  if (expected.length !== actual.length || expected.some((k, i) => k !== actual[i]))
    die(
      EXIT_BAD_TREE,
      `${label}: stripping transaction control changed the statement list.\n` +
        `expected ${expected.length} statements: ${expected.join(", ")}\n` +
        `got      ${actual.length} statements: ${actual.join(", ")}`,
    );

  return { stripped, removed: found.length };
}

// ---------------------------------------------------------------------------
// 4. THE OBJECTS EACH PENDING FILE PROMISES TO CREATE
// ---------------------------------------------------------------------------
//
// Taken from the parse tree rather than from a regex, so a name inside a
// comment or a string is not mistaken for a definition. These become the
// existence assertions in section 6: every table, column and function the batch
// claims to add must be present after the apply, or the batch rolls back.

// APPLY-01. THE IDENTITY ARGUMENT LIST A `CREATE FUNCTION` DECLARES.
//
// PostgreSQL identifies a function by name plus its IN, INOUT and VARIADIC
// argument types. OUT and TABLE parameters are not part of that identity, and a
// type modifier is not either: `varchar(20)` and `varchar` are the same
// function. So both are dropped here.
//
// THE TYPE NAME IS TAKEN VERBATIM FROM THE PARSE TREE AND NOT TRANSLATED.
// `int` parses to `pg_catalog.int4` and `varchar` to `pg_catalog.varchar`, and
// PostgreSQL accepts both spellings in `to_regprocedure`. Building a mapping
// table from internal names to display names here would be a second, private
// copy of a thing PostgreSQL already does, and it would be wrong for the first
// type nobody thought of. The last element of the name is what is used, so a
// schema qualifier falls away and a domain type resolves in the search_path,
// which is what a CREATE in the same file means by it.
function typeNameText(typeName) {
  const names = (typeName?.names ?? []).map((n) => n?.String?.sval).filter(Boolean);
  if (names.length === 0) return null;
  return names[names.length - 1] + "[]".repeat((typeName?.arrayBounds ?? []).length);
}

function declaredArgList(node) {
  const parts = [];
  for (const wrap of node?.parameters ?? []) {
    const p = wrap?.FunctionParameter;
    if (!p) continue;
    // OUT and TABLE columns are not part of the identity.
    if (p.mode === "FUNC_PARAM_OUT" || p.mode === "FUNC_PARAM_TABLE") continue;
    const t = typeNameText(p.argType);
    if (t === null) return null;
    parts.push(t);
  }
  return parts.join(", ");
}

/** The identity argument list a `DROP FUNCTION` names, or null when it names none. */
function droppedArgList(objectWithArgs) {
  if (objectWithArgs?.objargs === undefined) return null;
  const parts = [];
  for (const a of objectWithArgs.objargs) {
    const t = typeNameText(a?.TypeName);
    if (t === null) return null;
    parts.push(t);
  }
  return parts.join(", ");
}

function objectsPromisedBy(files) {
  const tables = new Set();
  const columns = new Set();
  const dropped = new Set();
  // THE LAST ACTION ON A FUNCTION NAME WINS, AND ORDER IS THE WHOLE ANSWER.
  // 0018 drops create_outbound_issue and then creates it: alive. 0017 creates
  // backfill_outbound_project_ids and 0026 drops it: dead. A pair of sets built
  // independently cannot tell those apart, and two passes over them fight.
  // Files arrive in register order and statements in file order, so a single
  // walk recording the last verb per name is exact.
  const funcState = new Map();
  // APPLY-01. What the batch DECLARES about each function it creates: the set of
  // identity argument lists, and whether it also dropped that name first.
  // APPLY-01. SIGNATURE-LEVEL STATE, NOT NAME-LEVEL, AND THE DIFFERENCE MATTERS.
  //
  // funcState above answers "does this NAME survive the batch". That is the
  // right question for the drop assertions and the wrong one here: a batch can
  // legitimately drop one signature of a name and create another in the same
  // run, which is exactly what a change of signature IS. Keyed by name alone,
  // the batch would appear to both drop and keep the function and the
  // declaration would be self-contradictory.
  //
  // The last verb on each `name(args)` wins, walked in register and file order,
  // for the same reason funcState does it that way.
  const sigState = new Map(); // "name(args)" -> alive

  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
    const { stmts } = classifyStatements(sql, f);
    for (const s of stmts) {
      const kind = Object.keys(s.stmt ?? {})[0];
      const node = s.stmt[kind];

      if (kind === "CreateStmt" && node?.relation?.relname) {
        if ((node.relation.schemaname ?? "public") === "public") tables.add(node.relation.relname);
      }
      // A FUNCTION THE BATCH DROPS IS NOT A FUNCTION THE BATCH PROMISES.
      // 0017 creates backfill_outbound_project_ids and 0026 drops it, both in
      // one batch, so a promised-set built only from CREATE would demand a
      // function the same batch deliberately removed.
      if (kind === "DropStmt" && node?.removeType === "OBJECT_FUNCTION") {
        for (const o of node.objects ?? []) {
          const names = (o?.ObjectWithArgs?.objname ?? []).map((x) => x?.String?.sval).filter(Boolean);
          const fname = names[names.length - 1];
          const schema = names.length > 1 ? names[0] : "public";
          if (fname && schema === "public") {
            funcState.set(fname, false);
            const dropped = droppedArgList(o?.ObjectWithArgs);
            // A drop with no argument list names every version of the name.
            if (dropped === null) {
              for (const key of [...sigState.keys()])
                if (key.startsWith(fname + "(")) sigState.set(key, false);
            } else {
              sigState.set(`${fname}(${dropped})`, false);
            }
          }
        }
      }
      if (kind === "CreateFunctionStmt") {
        const names = (node?.funcname ?? []).map((n) => n?.String?.sval).filter(Boolean);
        const fname = names[names.length - 1];
        const schema = names.length > 1 ? names[0] : "public";
        if (fname && schema === "public") {
          funcState.set(fname, true);
          const args = declaredArgList(node);
          if (args !== null) sigState.set(`${fname}(${args})`, true);
        }
      }
      if (kind === "AlterTableStmt" && node?.relation?.relname) {
        const rel = node.relation.relname;
        if ((node.relation.schemaname ?? "public") !== "public") continue;
        for (const cmdWrap of node.cmds ?? []) {
          const cmd = cmdWrap?.AlterTableCmd;
          if (cmd?.subtype === "AT_AddColumn" && cmd?.def?.ColumnDef?.colname)
            columns.add(`${rel}.${cmd.def.ColumnDef.colname}`);
          if (cmd?.subtype === "AT_DropColumn" && cmd?.name)
            dropped.add(`${rel}.${cmd.name}`);
        }
      }
    }
  }
  const functions = new Set([...funcState].filter(([, alive]) => alive).map(([n]) => n));
  const droppedFunctions = new Set([...funcState].filter(([, alive]) => !alive).map(([n]) => n));
  // What the batch DECLARES is alive at the end, grouped by name.
  const funcSignatures = new Map();
  for (const [key, alive] of sigState) {
    if (!alive) continue;
    const name = key.slice(0, key.indexOf("("));
    const args = key.slice(key.indexOf("(") + 1, -1);
    if (!funcSignatures.has(name)) funcSignatures.set(name, new Set());
    funcSignatures.get(name).add(args);
  }
  return { tables, columns, functions, dropped, droppedFunctions, funcSignatures };
}

// ---------------------------------------------------------------------------
// 5. PSQL, ON ONE OF EXACTLY TWO TARGETS
// ---------------------------------------------------------------------------

const target = process.env.RC_APPLY_TARGET ?? "";
const container = process.env.RC_APPLY_CONTAINER ?? "";

if (target !== "shim" && target !== "production") {
  die(
    EXIT_ENV,
    "RC_APPLY_TARGET must be set to `shim` or `production`. There is no default, because a default would eventually be the wrong one.\n" +
      "  shim:        also set RC_APPLY_CONTAINER=<docker container name>\n" +
      "  production:  also set the PG* variables (PGHOST, PGPORT, PGUSER, PGDATABASE, PGPASSWORD)",
  );
}
if (target === "shim" && !container)
  die(EXIT_ENV, "RC_APPLY_TARGET=shim requires RC_APPLY_CONTAINER=<docker container name>");

// psql is not on the default PATH on this machine. The location is read from
// the environment so this file names no absolute path of its own.
const PSQL = process.env.RC_PSQL ?? "psql";

function psql(sql, { quiet = false } = {}) {
  const args = ["--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--quiet"];
  let res;
  if (target === "shim") {
    res = spawnSync(
      "docker",
      ["exec", "--interactive", container, "psql", "--username", "postgres", "--dbname", "postgres", ...args],
      { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
  } else {
    res = spawnSync(PSQL, args, { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  }
  if (res.error && res.error.code === "ENOENT")
    die(EXIT_ENV, target === "shim" ? "docker is not on PATH" : `${PSQL} is not on PATH. Set RC_PSQL to its location.`);
  if (!quiet && res.stdout) out(res.stdout);
  return res;
}


// ---------------------------------------------------------------------------
// 6. THE RUN
// ---------------------------------------------------------------------------

await loadModule();

const pending = pendingFromRegister();

out("=".repeat(78) + "\n");
out("APPLY PENDING MIGRATIONS\n");
out("=".repeat(78) + "\n");
out(`target                 ${target}${target === "shim" ? ` (container ${container})` : ""}\n`);
out(`pending register       docs/migrations/APPLY-LOG.md\n`);
out(`pending file count     ${pending.length}\n`);

// --- AN APPLIER THAT CANNOT SEE ITS WORK MUST FAIL, NEVER REPORT CLEAN -------
//
// THE REGISTER LINE COUNT IS ASSERTED AGAINST THE PARSED FILE COUNT, because
// this script has already been silently wrong about exactly this. The card id
// pattern was `[A-Z0-9-]+`, `P3-04b` did not match it, and the register parsed
// to ZERO pending files while a line for it sat plainly in the file. The run
// then exited 0 saying "already current", which is INDISTINGUISHABLE FROM
// SUCCESS: nothing was applied, nothing was journalled, and the report said the
// database was up to date.
//
// The parse and the eye must agree. Lines are counted with a deliberately loose
// pattern, one that only asks whether a line LOOKS like a register entry, and
// compared against what the strict pattern actually extracted. A line that looks
// like an entry and did not parse is a defect in this script, not a line to skip.
const looseRegisterLines = readFileSync(APPLY_LOG, "utf8")
  .split("\n")
  .filter((l) => /^-\s+`\d{4}_.*\.sql`\s*,\s*card de aplicare/i.test(l.trim()));

if (looseRegisterLines.length !== pending.length) {
  const parsed = new Set(pending);
  const unparsed = looseRegisterLines.filter((l) => {
    const m = /`(\d{4}_[^`]+\.sql)`/.exec(l);
    return !m || !parsed.has(m[1]);
  });
  die(
    EXIT_BAD_TREE,
    `THE REGISTER AND THE PARSER DISAGREE, so this run is refusing rather than reporting a clean database.\n` +
      `  lines that look like register entries: ${looseRegisterLines.length}\n` +
      `  lines this script actually parsed:     ${pending.length}\n` +
      (unparsed.length
        ? `\nThese lines were not parsed:\n${unparsed.map((l) => `  ${l.trim()}`).join("\n")}\n`
        : "") +
      `\nA pending migration this script cannot see is a migration it will silently not apply.`,
  );
}

// STOP: nothing pending means the database is already current. Re-running would
// be a write with nothing to write, and the register is the authority.
if (pending.length === 0) {
  out("\nzero pending migrations. The register is empty, so production is already current.\n");
  out("Nothing was executed and nothing was written.\n");
  process.exit(EXIT_OK);
}

for (const f of pending) {
  const full = join(MIGRATIONS_DIR, f);
  if (!existsSync(full)) die(EXIT_BAD_TREE, `pending register names ${f}, which does not exist`);
}


// --- 6a. Parse every file BEFORE anything executes -------------------------
//
// The forbidden-statement stop happens here, on the text, with nothing open
// against any database. A file carrying DELETE, TRUNCATE or DROP TABLE means
// NOTHING runs at all: not that file, not the twelve around it.

const allForbidden = [];
const allDropFunctions = [];
const strippedFiles = [];
let totalStatements = 0;

for (const f of pending) {
  const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
  const cls = classifyStatements(sql, f);
  allForbidden.push(...cls.forbidden);
  allDropFunctions.push(...cls.dropFunctions);
  totalStatements += cls.stmts.length;
  const { stripped, removed } = stripTransactionControl(sql, f);
  strippedFiles.push({
    file: f, sql: stripped, statements: cls.stmts.length, txRemoved: removed,
    enumAdds: cls.enumAdds, kinds: cls.kinds,
  });
}

out(`total statements       ${totalStatements}\n`);

// THE DROP STATEMENT IS PRINTED WHATEVER HAPPENS NEXT, so it can be quoted to
// the owner from this output alone, whether the run commits, rolls back or
// refuses. CLAUDE.md 8.6 requires it quoted verbatim in the report.
out("\n" + "-".repeat(78) + "\n");
out("DROP FUNCTION STATEMENTS IN THIS BATCH, QUOTED VERBATIM\n");
out("-".repeat(78) + "\n");
if (allDropFunctions.length === 0) out("(none)\n");
for (const d of allDropFunctions) out(`${d.label}:\n  ${d.text};\n`);

if (allForbidden.length > 0) {
  err("\n" + "!".repeat(78) + "\n");
  err("REFUSED. A row-destroying statement is present and NOTHING was executed.\n");
  err("!".repeat(78) + "\n");
  for (const v of allForbidden) err(`\n${v.label}: ${v.kind}\n  ${v.text};\n`);
  err(
    "\nCLAUDE.md 8.6: DROP TABLE, TRUNCATE and DELETE are never auto-applied.\n" +
      "This card goes blocked on ivan with the statement above quoted.\n",
  );
  process.exit(EXIT_FORBIDDEN);
}
out("\nno DELETE, TRUNCATE or DROP TABLE in any pending file\n");



// --- 6b. The 0018 gate, evaluated against the repository -------------------
//
// The database half of this gate is an assertion inside the transaction
// (section 6d). This is the other half: is the four-argument signature named by
// a deployed route?
//
// IT IS, AND THAT IS NOT A FAILURE. lib/data/outbound-actions.ts calls the
// four-argument version in one branch, and that branch is taken only when
// hasPhase3Schema() is false, which is exactly the state this apply ends. What
// this check enforces is that every such call site is INSIDE that gate. A call
// to the four-argument version that is not behind the probe would be a route
// this apply breaks, and that refuses the run.

const ROUTE_DIRS = ["app", "lib", "components"];

// Read the call sites directly. A regex is correct here because the question is
// about TypeScript source, not SQL, and the shape being looked for is literal.
function unguardedFourArgCallSites() {
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name)) {
        const src = readFileSync(full, "utf8");
        if (!src.includes("create_outbound_issue")) continue;
        // Every rpc call to this function, with the argument object that follows.
        const re = /\.rpc\(\s*["'`]create_outbound_issue["'`]\s*,\s*\{([\s\S]*?)\}\s*\)/g;
        let m;
        while ((m = re.exec(src)) !== null) {
          const args = m[1];
          const fourArg = !args.includes("p_project_id");
          if (!fourArg) continue;
          // A four-argument call is acceptable only where the phase 3 probe
          // gates it. The gate is the ternary on `phase3` in the same call.
          const window = src.slice(Math.max(0, m.index - 600), m.index);
          const guarded = /phase3\s*\n?\s*\?/.test(window) || /\bphase3\b/.test(window);
          if (!guarded) hits.push(`${full.slice(ROOT.length + 1)}`);
        }
      }
    }
  };
  for (const d of ROUTE_DIRS) if (existsSync(join(ROOT, d))) walk(join(ROOT, d));
  return hits;
}

const unguarded = unguardedFourArgCallSites();
out("\n" + "-".repeat(78) + "\n");
out("0018 GATE, REPOSITORY HALF: who names the four-argument signature\n");
out("-".repeat(78) + "\n");
if (unguarded.length === 0) {
  out("every four-argument call site is behind the hasPhase3Schema() gate: OK\n");
} else {
  err("\nREFUSED. A four-argument call site is NOT behind the phase 3 probe:\n");
  for (const h of unguarded) err(`  ${h}\n`);
  err("Dropping the four-argument function would break that route. Nothing was executed.\n");
  process.exit(EXIT_FORBIDDEN);
}

// --- 6b2. THE ENUM PRE-PHASE, FORCED BY POSTGRESQL AND NOT BY PREFERENCE ---
//
// POSTGRESQL WILL NOT LET THIS BATCH BE ONE TRANSACTION, and the reason is a
// documented server rule rather than anything about these files being wrong.
//
//   0015 runs   alter type public.status_entity add value if not exists 'project';
//   0021 creates project_status_history, which is LANGUAGE SQL, and whose body
//        names 'project'.
//
// A `language sql` body is parsed and validated at CREATE time, so the new
// label is USED in the same transaction that added it, and the server refuses:
//
//   ERROR:  unsafe use of new value "project" of enum type status_entity
//   HINT:   New enum values must be committed before they can be used.
//
// Found on the shim, which is what the shim is for. Against production this
// would have rolled the whole batch back at 0021 and P3-27 would have failed.
//
// SO THE ENUM ADDITIONS GO FIRST, IN THEIR OWN COMMITTED TRANSACTION, AND
// NOTHING ELSE TRAVELS WITH THEM. That is the smallest possible deviation from
// "one transaction" and it is bounded by four assertions made here, before
// anything runs:
//
//   1. a file may join the pre-phase ONLY if it contains an enum addition
//   2. such a file may contain NOTHING but AlterEnumStmt and SelectStmt, so it
//      cannot leave a table, column, function or policy half-created
//   3. every enum addition must be idempotent (`add value IF NOT EXISTS`), so a
//      re-run after a rolled-back main batch is a no-op rather than an error
//   4. everything else stays in the one transaction it was always going to be in
//
// WHAT CAN SURVIVE A ROLLBACK OF THE MAIN BATCH IS THEREFORE EXACTLY ONE THING:
// an unused enum label. It references nothing, is read by nothing, and the next
// run adds it again as a no-op. That is not a partial apply in the sense 8.5
// forbids, and the report says so in those words rather than hoping nobody asks.

const PRE_PHASE_ALLOWED = new Set(["AlterEnumStmt", "SelectStmt"]);
const prePhase = strippedFiles.filter((f) => f.enumAdds.length > 0);
const mainPhase = strippedFiles.filter((f) => f.enumAdds.length === 0);

out("\n" + "-".repeat(78) + "\n");
out("ENUM PRE-PHASE: files that add an enum label, committed before the batch\n");
out("-".repeat(78) + "\n");
if (prePhase.length === 0) {
  out("(none: the whole batch is one transaction)\n");
}
for (const f of prePhase) {
  const offending = f.kinds.filter((k) => !PRE_PHASE_ALLOWED.has(k));
  if (offending.length > 0)
    die(
      EXIT_BAD_TREE,
      `${f.file} adds an enum label AND contains ${offending.join(", ")}. The pre-phase carries ` +
        `enum additions and nothing else, so this batch cannot be applied safely by this script. ` +
        `Split the file and re-run.`,
    );
  for (const e of f.enumAdds) {
    if (e.node.skipIfNewValExists !== true)
      die(
        EXIT_BAD_TREE,
        `${f.file}: "${e.text}" is not idempotent. The pre-phase commits separately, so every ` +
          `statement in it must be re-runnable. Use ADD VALUE IF NOT EXISTS.`,
      );
    out(`${f.file}:  ${e.text};   (idempotent, IF NOT EXISTS)\n`);
  }
}

// --- 6c. The batch --------------------------------------------------------
//
// ONE transaction, opened here and closed exactly once. Between them: the
// pre-check, the row-count snapshot, the thirteen stripped files in register
// order, the ledger repair, and every assertion. `\set ON_ERROR_STOP 1` means
// any raised exception aborts the transaction, so a failed assertion rolls the
// whole batch back rather than leaving half of it applied.

const versions = pending.map((f) => f.slice(0, 4));
const highest = versions[versions.length - 1];
const { tables, columns, functions, dropped, droppedFunctions, funcSignatures } =
  objectsPromisedBy(pending);

// --- THE REMOVAL DIRECTION, WHICH IS INC-06 ---------------------------------
//
// A batch that TAKES SOMETHING AWAY may only be applied once nothing still reads
// it. check:removal-safety enumerates readers against the TABLE, and this script
// refuses to run the batch while that check is red.
//
// BOTH HALVES ARE ASSERTED HERE NOW. P3-11e CLOSED THE SECOND ONE.
//
// The rule is that a removal applies after the code that stops reading it is
// merged AND DEPLOYED. check-removal-safety proves MERGED: no reader remains on
// main. check-deployed-commit proves DEPLOYED: it asks /api/health which commit
// production is running and refuses unless git says the commit being applied
// against is an ancestor of it, which is true only when the live deployment
// CONTAINS this tree.
//
// IT NEEDS NO CREDENTIAL. Vercel exposes VERCEL_GIT_COMMIT_SHA to the
// application at build time, so the deployment states its own commit. There is
// no Vercel API call and no VERCEL_TOKEN, and that is deliberate: this check
// survives P2-13's credential revocation, and a check that dies when the keys
// rotate is a check that dies on the day it matters.
//
// RC_DEPLOY_CONFIRMED IS GONE AND IS NOT KEPT AS A FALLBACK. It was an operator
// statement, which is precisely the guess that produced INC-06. An operator
// statement that survives beside a machine check is the one that gets used at
// three in the morning. If the health route cannot be reached, this REFUSES; it
// does not fall back to asking.
const batchRemoves =
  dropped.size > 0 || droppedFunctions.size > 0 || allDropFunctions.length > 0;

if (batchRemoves) {
  out("\n" + "-".repeat(78) + "\n");
  out("REMOVAL DIRECTION: this batch takes something away\n");
  out("-".repeat(78) + "\n");

  const safety = spawnSync("node", [join(ROOT, "scripts/poc-free/check-removal-safety.mjs")], {
    encoding: "utf8",
  });
  if (safety.stdout) out(safety.stdout);
  if (safety.status !== 0) {
    err(safety.stderr || "");
    err("\n" + "!".repeat(78) + "\n");
    err("REFUSED. Something still reads what this batch removes. NOTHING was executed.\n");
    err("!".repeat(78) + "\n");
    process.exit(EXIT_FORBIDDEN);
  }

  if (target === "production") {
    // P3-11e. THE DEPLOYED HALF, ASKED OF PRODUCTION ITSELF.
    const deployedCheck = spawnSync(
      "node",
      [join(ROOT, "scripts/poc-free/check-deployed-commit.mjs")],
      { encoding: "utf8" },
    );
    if (deployedCheck.stdout) out(deployedCheck.stdout);
    if (deployedCheck.status !== 0) {
      err(deployedCheck.stderr || "");
      err("\n" + "!".repeat(78) + "\n");
      err("REFUSED. This batch removes schema and the DEPLOY is not proven. NOTHING was executed.\n");
      err("!".repeat(78) + "\n");
      err(
        "\nRC_DEPLOY_CONFIRMED no longer exists and is not coming back. It was an operator\n" +
          "statement standing in for a fact, which is what produced INC-06. The fact is now\n" +
          "available: /api/health reports the commit production is running, with no credential.\n\n" +
          "If the deployment has not finished, wait for it. If the health route is unreachable,\n" +
          "fix that. Neither is a reason to apply.\n",
      );
      process.exit(EXIT_FORBIDDEN);
    }
    // A leftover from the old path is named rather than ignored: an operator who
    // still exports it is working from an instruction that no longer applies,
    // and silence would let them believe it did something.
    if (process.env.RC_DEPLOY_CONFIRMED !== undefined) {
      out(
        "\nNOTE: RC_DEPLOY_CONFIRMED is set in this environment and was IGNORED.\n" +
          "P3-11e replaced it with check-deployed-commit, which just passed on its own.\n",
      );
    }
  }
}

if (dryRun) {
  out("\n" + "=".repeat(78) + "\n");
  out("DRY RUN: every refusal above was evaluated and NOTHING will be executed.\n");
  out("=".repeat(78) + "\n");
  process.exit(EXIT_OK);
}


// A TYPED ARRAY LITERAL, ALWAYS. `array[]` with no members has no type and
// PostgreSQL refuses it: "cannot determine type of empty array". A batch that
// creates no tables, or no columns, or no functions produces exactly that, and
// the assertion then fails for a reason that has nothing to do with the schema.
// Found by applying P3-04b's single-file batch to production, which creates no
// table at all; the shim proof never hit it because its batch always had one.
const sqlTextArray = (items) =>
  items.length === 0
    ? "array[]::text[]"
    : `array[${items.map((i) => `'${String(i).replace(/'/g, "''")}'`).join(",")}]::text[]`;

const sqlParts = [];
const P = (s) => sqlParts.push(s);

P(`\\set ON_ERROR_STOP 1`);
P(`\\timing off`);
P(`begin;`);

// The ledger must exist before it is read. On a real Supabase project it does;
// on the shim it is created by the proof harness, and this is idempotent.
P(`create schema if not exists supabase_migrations;`);
P(`create table if not exists supabase_migrations.schema_migrations (
     version text primary key, name text, statements text[]);`);

P(`\\echo '=============================================================================='`);
P(`\\echo 'PRE-CHECK GRID: the applied ledger BEFORE anything runs'`);
P(`\\echo '=============================================================================='`);
P(`select version, name from supabase_migrations.schema_migrations order by version;`);
P(`select count(*) as ledger_rows_before from supabase_migrations.schema_migrations;`);

P(`\\echo ''`);
P(`\\echo 'PRE-CHECK GRID: row counts on every public table BEFORE anything runs'`);
P(`create temporary table rc_rowcounts_before (tbl text primary key, n bigint) on commit drop;`);
P(`do $rc$
declare r record; c bigint;
begin
  for r in select tablename from pg_tables where schemaname = 'public' order by tablename loop
    execute format('select count(*) from public.%I', r.tablename) into c;
    insert into rc_rowcounts_before values (r.tablename, c);
  end loop;
end $rc$;`);
P(`select tbl, n from rc_rowcounts_before order by tbl;`);

P(`\\echo ''`);
P(`\\echo 'PRE-CHECK: every column in public, so a disappearance can be noticed'`);
P(`create temporary table rc_columns_before (tbl text, col text) on commit drop;`);
P(`insert into rc_columns_before
     select table_name, column_name from information_schema.columns
     where table_schema = 'public';`);
P(`select count(*) as columns_before from rc_columns_before;`);

// --- the 0018 gate, database half, BEFORE the drop executes ---------------
P(`\\echo ''`);
P(`\\echo '0018 GATE, DATABASE HALF: dependents of the four-argument function'`);
P(`do $rc$
declare v_oid oid; v_deps bigint;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_outbound_issue'
    and array_to_string(array(select format_type(t, null) from unnest(p.proargtypes) as t), ', ')
        = 'text, text, text, jsonb';

  if v_oid is null then
    raise notice '0018 gate: the four-argument function is not present, nothing to drop';
    return;
  end if;

  -- Objects that DEPEND ON this function: a view, a trigger, a default
  -- expression, a constraint. Internal rows (deptype i) and the function's own
  -- dependencies on its schema and argument types are not in this direction.
  select count(*) into v_deps
  from pg_depend d
  where d.refclassid = 'pg_proc'::regclass
    and d.refobjid = v_oid
    and d.deptype not in ('i', 'a');

  raise notice '0018 gate: dependent objects on the four-argument function = %', v_deps;
  if v_deps <> 0 then
    raise exception 'ASSERTION FAILED [0018-dependents]: the four-argument create_outbound_issue has % dependent object(s). The whole batch is rolled back.', v_deps;
  end if;
end $rc$;`);

// --- the thirteen files, in register order --------------------------------
for (const f of mainPhase) {
  P(`\\echo ''`);
  P(`\\echo '--- applying ${f.file} (${f.statements} statements) ---'`);
  P(f.sql);
}

// --- the ledger --------------------------------------------------------------
//
// 0010, 0011 and 0012 first: the strategy record says their rows were never
// written, so the ledger's newest row is 0009 while the schema is at 0012.
// Written here, in the same transaction, and asserted afterwards. ON CONFLICT
// DO NOTHING so a database where somebody already repaired them is not an error.
P(`\\echo ''`);
P(`\\echo '--- ledger: the three rows the strategy record says were never written ---'`);
for (const [v, n] of [
  ["0010", "confirm_extraction_draft"],
  ["0011", "extraction_confirm_corrections"],
  ["0012", "manager_flagged_products"],
]) {
  P(`insert into supabase_migrations.schema_migrations (version, name)
     values ('${v}', '${n}') on conflict (version) do nothing;`);
}
P(`\\echo '--- ledger: the thirteen rows for this batch ---'`);
for (const f of pending) {
  const v = f.slice(0, 4);
  const n = f.slice(5).replace(/\.sql$/, "");
  P(`insert into supabase_migrations.schema_migrations (version, name)
     values ('${v}', '${n}') on conflict (version) do nothing;`);
}

// --- 6d. THE ASSERTIONS ---------------------------------------------------
//
// Every one raises. A raise aborts the transaction under ON_ERROR_STOP, so a
// failure rolls the whole batch back and there is no path on which a failed
// assertion commits. Nothing here prints a grid for a human to judge.

P(`\\echo ''`);
P(`\\echo '=============================================================================='`);
P(`\\echo 'ASSERTIONS'`);
P(`\\echo '=============================================================================='`);

const assertions = [];
const A = (name, body) => assertions.push({ name, body });

A("every-pending-applied", `
declare missing text;
begin
  select string_agg(v, ', ' order by v) into missing
  from unnest(array[${versions.map((v) => `'${v}'`).join(",")}]) as v
  where not exists (select 1 from supabase_migrations.schema_migrations m where m.version = v);
  if missing is not null then
    raise exception 'ASSERTION FAILED [every-pending-applied]: not in the ledger after apply: %', missing;
  end if;
end`);

A("ledger-no-gaps-ends-at-highest", `
declare v_max text; v_count int; v_expected int;
begin
  select max(version), count(*) into v_max, v_count from supabase_migrations.schema_migrations;
  if v_max <> '${highest}' then
    raise exception 'ASSERTION FAILED [ledger-no-gaps-ends-at-highest]: ledger ends at %, expected ${highest}', v_max;
  end if;
  -- No gaps: every integer from 1 to the highest is present exactly once.
  v_expected := ${parseInt(highest, 10)};
  if v_count <> v_expected then
    raise exception 'ASSERTION FAILED [ledger-no-gaps-ends-at-highest]: ledger holds % rows, expected % with no gaps', v_count, v_expected;
  end if;
  if exists (
    select 1 from generate_series(1, v_expected) g
    where not exists (
      select 1 from supabase_migrations.schema_migrations m
      where m.version = lpad(g::text, 4, '0'))
  ) then
    raise exception 'ASSERTION FAILED [ledger-no-gaps-ends-at-highest]: the ledger has at least one gap below %', v_expected;
  end if;
end`);

A("ledger-0010-0011-0012-present", `
begin
  if (select count(*) from supabase_migrations.schema_migrations
      where version in ('0010','0011','0012')) <> 3 then
    raise exception 'ASSERTION FAILED [ledger-0010-0011-0012-present]: the three repaired rows are not all present';
  end if;
end`);

A("promised-tables-exist", `
declare missing text;
begin
  select string_agg(t, ', ' order by t) into missing
  from unnest(${sqlTextArray([...tables])}) as t
  where to_regclass('public.' || t) is null;
  if missing is not null then
    raise exception 'ASSERTION FAILED [promised-tables-exist]: missing after apply: %', missing;
  end if;
end`);

A("promised-columns-exist", `
declare missing text;
begin
  select string_agg(c, ', ' order by c) into missing
  from unnest(${sqlTextArray([...columns])}) as c
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = split_part(c, '.', 1)
      and column_name = split_part(c, '.', 2));
  if missing is not null then
    raise exception 'ASSERTION FAILED [promised-columns-exist]: missing after apply: %', missing;
  end if;
end`);

A("promised-functions-exist", `
declare missing text;
begin
  select string_agg(f, ', ' order by f) into missing
  from unnest(${sqlTextArray([...functions])}) as f
  where not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = f);
  if missing is not null then
    raise exception 'ASSERTION FAILED [promised-functions-exist]: missing after apply: %', missing;
  end if;
end`);

A("declared-function-drops-happened", `
declare surviving text;
begin
${droppedFunctions.size === 0 ? "  -- This batch declares no function drops." : `  -- This batch declares ${droppedFunctions.size}: ${[...droppedFunctions].join(", ")}.`}
  select string_agg(f, ', ' order by f) into surviving
  from unnest(${sqlTextArray([...droppedFunctions])}) as f
  where f is not null and exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = f);
  if surviving is not null then
    raise exception 'ASSERTION FAILED [declared-function-drops-happened]: the batch declared these functions dropped and they are still present: %', surviving;
  end if;
end`);

A("declared-column-drops-only", `
declare missing text; surviving text;
begin
  -- A COLUMN MAY ONLY VANISH IF A PENDING MIGRATION SAID IT WOULD.
  --
  -- This replaced a hardcoded list asserting that client_name, project_name and
  -- supplier_name were still present. That was right for the wave 1 batch, whose
  -- job was explicitly NOT to drop them, and it became wrong the moment a card
  -- existed whose whole job IS to drop one: the applier would have refused the
  -- migration it was built to apply.
  --
  -- HARDCODING THE ANSWER WAS THE DEFECT, TWICE OVER. The first version guarded
  -- three named columns, so it could not notice ANY OTHER column disappearing.
  -- A mutation that dropped clients.notes committed cleanly under it. This
  -- version snapshots every column in the schema before the batch and requires
  -- every disappearance to have been DECLARED by an ALTER TABLE ... DROP COLUMN
  -- in a pending file, which is the same shape as the row-count assertion and
  -- catches the accident rather than a list of three guesses about it.
  --
  -- IT GUARDS PRE-EXISTING COLUMNS, WHICH IS THE SCOPE THAT MATTERS. A column the
  -- batch itself creates and then drops never appears in the snapshot and is not
  -- flagged. That is deliberate: the loss this exists to prevent is of data that
  -- was already there, and a column that lived only inside one transaction never
  -- held any.
${dropped.size === 0 ? `
  -- This batch declares no column drops, so ANY disappearance fails.` : `
  -- This batch declares ${dropped.size}: ${[...dropped].join(", ")}.`}
  select string_agg(b.tbl || '.' || b.col, ', ' order by b.tbl, b.col) into missing
  from rc_columns_before b
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = b.tbl and c.column_name = b.col)
  and (b.tbl || '.' || b.col) <> all (${sqlTextArray([...dropped])});
  if missing is not null then
    raise exception 'ASSERTION FAILED [declared-column-drops-only]: these columns are gone and NO pending migration declared dropping them: %', missing;
  end if;

  -- And the inverse: a declared drop that did not happen is a migration that
  -- silently did not do what its own text says.
  select string_agg(c, ', ' order by c) into surviving
  from unnest(${sqlTextArray([...dropped])}) as c
  where c is not null and exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = split_part(c, '.', 1)
      and column_name = split_part(c, '.', 2));
  if surviving is not null then
    raise exception 'ASSERTION FAILED [declared-column-drops-only]: the batch declared these columns dropped and they are still present: %', surviving;
  end if;
end`);

A("zero-rows-deleted", `
declare bad text;
begin
  select string_agg(format('%s: %s -> %s', b.tbl, b.n, a.n), ', ' order by b.tbl) into bad
  from rc_rowcounts_before b
  join lateral (
    select (xpath('/row/c/text()',
      query_to_xml(format('select count(*) as c from public.%I', b.tbl), false, true, '')))[1]::text::bigint as n
  ) a on true
  where a.n < b.n;
  if bad is not null then
    raise exception 'ASSERTION FAILED [zero-rows-deleted]: row count fell on: %', bad;
  end if;
end`);

A("outbound-destination-backfill", `
declare v_unmatched bigint;
begin
  select count(*) into v_unmatched from public.outbound_issues where project_id is null;
  raise notice 'P3-04 reconciliation: outbound_issues with no project_id = %', v_unmatched;
end`);

A("supplier-backfill", `
declare v_unmatched bigint;
begin
  -- SAME REASON AS THE GRID: what exists is a question for the database, not for
  -- this batch's declarations. A column dropped by an EARLIER run is gone and
  -- not in the dropped set, so keying off it named a column that had not existed
  -- since the previous apply.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'supplier_name'
  ) then
    execute 'select count(*) from public.products
             where supplier_id is null and supplier_name is not null and btrim(supplier_name) <> $q$$q$'
      into v_unmatched;
  else
    select count(*) into v_unmatched from public.products where supplier_id is null;
  end if;
  raise notice 'P3-05 reconciliation: products with no supplier_id = %', v_unmatched;
end`);

// APPLY-01. THE SIGNATURE IS DECLARED INTENT NOW, NOT A SNAPSHOT.
//
// WHAT THIS REPLACES AND WHY. The assertion here used to be
// `one-create-outbound-issue-five-args`, and it was UNCONDITIONAL: it demanded
// that public.create_outbound_issue exist exactly once with the literal argument
// list (text, text, text, jsonb, uuid), on EVERY future run of this script, for
// EVERY batch, whether or not the batch touched that function at all.
//
// R-082 makes this script the only lawful route from a merged migration file to
// the production database, and a raised assertion rolls the WHOLE batch back. So
// the first migration that legitimately changed that signature, and a
// deviz-aware outbound issue is a near and plausible reason to, would have taken
// down every unrelated migration travelling with it. The failure would have been
// invisible until the apply, and the apply is the last step.
//
// WHAT WAS RIGHT ABOUT IT AND IS KEPT. Its real concern was 0018's shape:
// DROP then CREATE, where two surviving versions mean the drop did not happen and
// every call is ambiguous. That half is not loosened at all. It is generalised
// from one hardcoded name to every function a batch replaces.
//
// THE DECLARATION IS PARSED FROM THE MIGRATION FILE AND IS NEVER PASSED AT THE
// PROMPT. R-082 and R-047 both rest on the script deciding rather than the
// terminal choosing, and anything a terminal can type is a choice.
//
// to_regprocedure DOES THE TYPE RESOLUTION, not a mapping table in here.
// It is PostgreSQL's own parser, so `int` and `integer` and `int4` all resolve,
// and a type nobody thought of resolves too.

if (funcSignatures.size > 0) {
  const rows = [];
  for (const [name, sigs] of funcSignatures) for (const args of sigs) rows.push([name, args]);
  A("declared-function-signatures-exist", `
declare missing text;
begin
  select string_agg(sig, ', ') into missing
  from (values ${rows.map(([n, a]) => `('public.${n}(${a})')`).join(", ")}) as v(sig)
  where to_regprocedure(sig) is null;
  if missing is not null then
    raise exception 'ASSERTION FAILED [declared-function-signatures-exist]: this batch declares these functions and they are not present with the signature it declared: %', missing;
  end if;
end`);
}

if (funcSignatures.size > 0) {
  // AS MANY VERSIONS AS THE BATCH DECLARED, AND NOT ONE MORE.
  //
  // This is 0018's assertion, one hardcoded name widened into a derived rule.
  // 0018 drops create_outbound_issue(text, text, text, jsonb) and creates the
  // five-argument one: one declared, one alive, pass. Remove that drop and two
  // survive against one declared, which fails, and every call to the name is
  // ambiguous from then on. That is the defect the original was written for and
  // it is not loosened by one inch.
  //
  // IT IS KEYED ON WHAT THE BATCH CREATES, NOT ON WHAT IT DROPS, and that
  // distinction is the whole reason this shape was chosen. A rule keyed on
  // "names the batch drops and re-creates" stops applying the moment somebody
  // deletes the drop, which is EXACTLY the accident it exists to catch: the
  // check would disappear together with the thing it was checking.
  //
  // A DELIBERATE OVERLOAD IS DECLARED, NOT ASSUMED. Two signatures in the batch
  // means two are expected. A function that already carries an overload from an
  // earlier migration and is created again here without declaring both will
  // fail, and the message says the count and the declaration so the author can
  // see which of the two is wrong. This repository has no intentional overloads:
  // the assertion this replaces demanded exactly one, forever, for one name.
  const rows = [...funcSignatures].map(([n, sigs]) => [n, sigs.size]);
  A("declared-function-versions-only", `
declare bad text;
begin
  select string_agg(format('%s has %s version(s), this batch declared %s', v.fname, actual.n, v.declared), '; ')
    into bad
  from (values ${rows.map(([n, k]) => `('${n}', ${k})`).join(", ")}) as v(fname, declared)
  cross join lateral (
    select count(*) as n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = v.fname
  ) as actual
  where actual.n <> v.declared;
  if bad is not null then
    raise exception 'ASSERTION FAILED [declared-function-versions-only]: %. A leftover overload makes every call to that name ambiguous.', bad;
  end if;
end`);
}

for (const a of assertions) {
  P(`\\echo '  assert ${a.name}'`);
  P(`do $rc$ ${a.body} $rc$;`);
}

// --- 6e. The post-check grid, still inside the transaction ----------------
P(`\\echo ''`);
P(`\\echo '=============================================================================='`);
P(`\\echo 'POST-CHECK GRID: the applied ledger AFTER the batch'`);
P(`\\echo '=============================================================================='`);
P(`select version, name from supabase_migrations.schema_migrations order by version;`);
P(`select count(*) as ledger_rows_after from supabase_migrations.schema_migrations;`);
P(`\\echo ''`);
P(`\\echo 'POST-CHECK GRID: row counts on every public table AFTER the batch'`);
P(`select b.tbl, b.n as before,
     (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', b.tbl), false, true, '')))[1]::text::bigint as after
   from rc_rowcounts_before b order by b.tbl;`);
P(`\\echo ''`);
P(`\\echo 'RECONCILIATION: outbound_issues with no project_id, with their destination text'`);
// THE GRID ADAPTS TO THE LIVE SCHEMA, NOT TO THIS BATCH'S DECLARATIONS.
//
// It keyed off `dropped`, the set of columns THIS batch declares it will drop,
// and that was wrong twice over. A column dropped by an EARLIER batch is not in
// this batch's set, so the grid named a column that had been gone since the
// previous apply and the whole transaction failed on its last step. P3-05b hit
// exactly that: 0026 dropped client_name in one run, and 0027's run then tried
// to print it.
//
// The only thing that knows which columns exist is the database, so the grid is
// built with dynamic SQL from information_schema at the moment it runs. That is
// correct whether the column was dropped by this batch, by an earlier one, or
// never existed.
P(`do $rc$
declare
  has_text boolean;
begin
  select count(*) = 2 into has_text
  from information_schema.columns
  where table_schema = 'public' and table_name = 'outbound_issues'
    and column_name in ('client_name', 'project_name');

  if has_text then
    raise notice 'reconciliation grid includes the free-text destination columns';
    execute 'create temporary view rc_recon_outbound as
      select id, reference, client_name, project_name from public.outbound_issues
      where project_id is null';
  else
    execute 'create temporary view rc_recon_outbound as
      select id, reference, project_id::text as project_id from public.outbound_issues
      where project_id is null';
  end if;
end $rc$;`);
P(`select * from rc_recon_outbound;`);P(`\\echo ''`);
P(`\\echo 'RECONCILIATION: products with a supplier_name and no supplier_id'`);
P(`do $rc$
declare
  has_name boolean;
begin
  select count(*) = 1 into has_name
  from information_schema.columns
  where table_schema = 'public' and table_name = 'products'
    and column_name = 'supplier_name';

  if has_name then
    execute 'create temporary view rc_recon_products as
      select id, sku, name, supplier_name from public.products
      where supplier_id is null and supplier_name is not null and btrim(supplier_name) <> $q$$q$';
  else
    execute 'create temporary view rc_recon_products as
      select id, sku, name from public.products where supplier_id is null';
  end if;
end $rc$;`);
P(`select * from rc_recon_products;`);P(`\\echo ''`);
P(`\\echo 'RLS and policy count per new table'`);
P(`select c.relname as table_name, c.relrowsecurity as rls_enabled,
     (select count(*) from pg_policies pol where pol.schemaname='public' and pol.tablename=c.relname) as policies
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r'
     and c.relname = any(${sqlTextArray([...tables])})
   order by c.relname;`);

P(`commit;`);
P(`\\echo ''`);
P(`\\echo 'COMMITTED'`);

// ---------------------------------------------------------------------------
// 7. EXECUTE, AND LET THE SCRIPT DECIDE
// ---------------------------------------------------------------------------

const batch = sqlParts.join("\n\n");
const batchSha = createHash("sha256").update(batch).digest("hex");
const scriptSha = createHash("sha256")
  .update(readFileSync(fileURLToPath(import.meta.url)))
  .digest("hex");

out("\n" + "=".repeat(78) + "\n");
out(`batch sha256           ${batchSha}\n`);
out(`script sha256          ${scriptSha}\n`);
out(`assertions             ${assertions.length}\n`);
out("=".repeat(78) + "\n\n");

const started = new Date();

// --- the pre-phase, committed on its own ----------------------------------
if (prePhase.length > 0) {
  const preParts = [`\\set ON_ERROR_STOP 1`, `begin;`];
  preParts.push(`create schema if not exists supabase_migrations;`);
  preParts.push(`create table if not exists supabase_migrations.schema_migrations (
     version text primary key, name text, statements text[]);`);
  for (const f of prePhase) {
    preParts.push(`\\echo '--- pre-phase: ${f.file} ---'`);
    preParts.push(f.sql);
    const v = f.file.slice(0, 4);
    const n = f.file.slice(5).replace(/\.sql$/, "");
    preParts.push(`insert into supabase_migrations.schema_migrations (version, name)
       values ('${v}', '${n}') on conflict (version) do nothing;`);
  }
  preParts.push(`commit;`);
  out("\n--- applying the enum pre-phase ---\n");
  const pre = psql(preParts.join("\n\n"));
  if (pre.stderr) err(pre.stderr);
  if (pre.status !== 0) {
    err("\n" + "!".repeat(78) + "\n");
    err("ROLLED BACK in the enum pre-phase. Nothing was committed.\n");
    err("!".repeat(78) + "\n");
    process.exit(EXIT_ASSERTION_FAILED);
  }
  out("enum pre-phase committed\n");
}

const res = psql(batch);

if (res.stderr) err(res.stderr);

if (res.status !== 0) {
  // ON_ERROR_STOP aborted the transaction, so nothing was committed. psql exits
  // non-zero and the server has already rolled the batch back whole.
  const failures = (res.stderr || "")
    .split("\n")
    .filter((l) => l.includes("ASSERTION FAILED") || l.startsWith("ERROR:"));
  err("\n" + "!".repeat(78) + "\n");
  err("ROLLED BACK. Nothing was committed.\n");
  err("!".repeat(78) + "\n");
  if (failures.length === 0) err("psql exited non-zero with no assertion line; full stderr above.\n");
  for (const f of failures) err(`${f}\n`);
  process.exit(EXIT_ASSERTION_FAILED);
}

const finished = new Date();
out(`\napplied and committed: ${pending.length} migrations, ${assertions.length} assertions passed\n`);

// ---------------------------------------------------------------------------
// 8. THE JOURNALS, WRITTEN ONLY AFTER A COMMIT
// ---------------------------------------------------------------------------
//
// R-055: every production write gets a row, and a write with no row in one of
// the two journals is a violation. The row goes in BEFORE the pull request that
// performs the write is merged. On the shim target nothing is written, because
// nothing was written to production.

if (target === "production") {
  const day = finished.toISOString().slice(0, 10);
  const reportPath = process.env.RC_APPLY_REPORT ?? `docs/reports/${day}-executor-p3-27-apply.md`;
  const row =
    `| ${day} | **EXECUTOR terminal**, under R-082 | \`scripts/apply-pending-migrations.mjs\` | ` +
    `\`${scriptSha}\` | **${assertions.length} of ${assertions.length} passed**, committed on all-pass | ` +
    `**0 rows deleted**, ${pending.length} migrations applied (${versions[0]} to ${highest}) | \`${reportPath}\` |\n`;

  const writes = readFileSync(WRITES_LOG, "utf8");
  const marker = "\n**Total written to production outside a migration:";
  const at = writes.indexOf(marker);
  writeFileSync(
    WRITES_LOG,
    at === -1 ? writes + row : writes.slice(0, at) + row + writes.slice(at),
    "utf8",
  );
  out(`wrote a row to docs/PRODUCTION-WRITES.md\n`);

  // THE PENDING REGISTER IS CLEARED, which is what switches
  // check:pending-schema-reads off by its own design: that script exits 0 the
  // moment the register is empty, without being edited.
  const log = readFileSync(APPLY_LOG, "utf8");
  const cleared = log
    .split("\n")
    .filter(
      (l) =>
        !/^-\s+`\d{4}_[a-z0-9_]+\.sql`\s*,\s*card de aplicare\s+[A-Za-z0-9-]+\s*$/.test(l.trim()),
    )
    .join("\n");
  writeFileSync(APPLY_LOG, cleared, "utf8");
  out(`cleared ${pending.length} lines from the pending register in docs/migrations/APPLY-LOG.md\n`);
  out(`check:pending-schema-reads switches itself off on the next run: the register is empty\n`);
} else {
  out("\ntarget was the shim, so NOTHING was written to any journal and the pending register is untouched.\n");
}

out(`\nstarted  ${started.toISOString()}\nfinished ${finished.toISOString()}\n`);
process.exit(EXIT_OK);
