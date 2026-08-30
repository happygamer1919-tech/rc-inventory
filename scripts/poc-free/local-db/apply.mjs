// scripts/poc-free/local-db/apply.mjs
// AUT-14. Apply every migration in supabase/migrations/ to a throwaway
// postgres:16 container, unmodified, with no credentials and no network.
//
// WHAT THIS IS FOR. Migrations are already verified on every pull request:
// quality.yml runs `supabase start` and `supabase db reset` against a real
// stack. This does not make them verified. It makes them verifiable LOCALLY,
// OFFLINE, WITH NO CREDENTIALS, in one container instead of ten and in seconds
// instead of minutes. That is the capability that let a file containing eleven
// DELETE statements aimed at the client's database be proven, four mutated
// copies and all, before the owner ran it.
//
// IT CANNOT REACH A REAL DATABASE, AND THAT IS THE POINT.
//   - It takes NO arguments. No host, no connection string, no project ref.
//   - It reads NO environment variable naming a database, and no secret.
//   - Every path it reads is derived from this file's own location.
//   - It talks to exactly one thing: a container it started in this process.
// A flag that let it point somewhere else would be a defect, not a feature.
//
// IT NEVER USES `docker cp`. THAT KILLS DOCKER DESKTOP ON THE BUILD MACHINE.
// This is not a preference and it is not discoverable from any error message:
// the failure is a dead daemon, not a message. Recorded in docs/LEARNINGS.md
// and in the RST-01 report. SQL is delivered on stdin to `docker exec -i`, so
// nothing crosses into the container except bytes on a pipe.
//
// TEARDOWN ALWAYS RUNS: on success, on any failure, and on SIGINT or SIGTERM.
// A container left behind holds its name and the next run fails for a reason
// that has nothing to do with the migrations. The name carries this process id
// so two concurrent runs cannot collide in the first place.
//
// EXIT CODES, and they are part of the contract:
//   0  every migration applied
//   1  a migration failed. The failing FILE is named on stderr.
//   2  Docker is not usable. One line naming Docker, not a raw client error.
//   3  the container started but never became ready inside the timeout
//   4  the tree is not shaped the way this script expects

import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// scripts/poc-free/local-db -> repo root
const ROOT = resolve(HERE, '..', '..', '..');
const SHIM = join(HERE, 'shim.sql');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');

const IMAGE = 'postgres:16';
const CONTAINER = `rc-check-migrations-${process.pid}-${Date.now().toString(36)}`;
const READY_TIMEOUT_MS = 60_000;
const READY_POLL_MS = 500;

const EXIT_OK = 0;
const EXIT_MIGRATION_FAILED = 1;
const EXIT_NO_DOCKER = 2;
const EXIT_NOT_READY = 3;
const EXIT_BAD_TREE = 4;

let containerStarted = false;

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', ...opts });
}

function teardown() {
  if (!containerStarted) return;
  containerStarted = false;
  // -f because the container is running, and this must succeed whether the run
  // passed or failed. Output is swallowed: a teardown message on the failure
  // path would sit between the reader and the error they came for.
  run('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' });
}

function die(code, message) {
  teardown();
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

// The container outlives this process only if the process is killed in a way
// no handler can see. SIGINT and SIGTERM are the two that can be, and a Ctrl-C
// during a slow apply is the ordinary case.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    teardown();
    process.exit(130);
  });
}
process.on('exit', teardown);

// ---------------------------------------------------------------------------
// 0. The tree
// ---------------------------------------------------------------------------

if (!existsSync(SHIM)) {
  die(EXIT_BAD_TREE, `shim not found at ${SHIM}`);
}
if (!existsSync(MIGRATIONS_DIR)) {
  die(EXIT_BAD_TREE, `migrations directory not found at ${MIGRATIONS_DIR}`);
}

// Filename order, which is apply order, which is why the files are zero padded.
const migrations = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (migrations.length === 0) {
  die(EXIT_BAD_TREE, `no .sql files in ${MIGRATIONS_DIR}`);
}

// ---------------------------------------------------------------------------
// 1. Docker, or a sentence about Docker
// ---------------------------------------------------------------------------
//
// `docker version --format {{.Server.Version}}` is the check because it needs
// the DAEMON, not just the client binary. `docker --version` answers from the
// client alone and would report success against a stopped Docker Desktop,
// which is exactly the state this branch exists to name.

const version = run('docker', ['version', '--format', '{{.Server.Version}}']);

if (version.error && version.error.code === 'ENOENT') {
  die(
    EXIT_NO_DOCKER,
    'Docker is not installed, or `docker` is not on PATH. This check needs a running Docker daemon and nothing else.'
  );
}
if (version.status !== 0) {
  die(
    EXIT_NO_DOCKER,
    'Docker is installed but the daemon is not responding. Start Docker Desktop and run this again.'
  );
}

const serverVersion = (version.stdout || '').trim();
process.stdout.write(`docker server ${serverVersion}\n`);

// ---------------------------------------------------------------------------
// 2. The container
// ---------------------------------------------------------------------------
//
// No published port. Nothing outside this process ever connects to it, so
// binding a host port would only create a collision with the next run and with
// any local postgres. psql runs INSIDE the container over its unix socket.
//
// POSTGRES_PASSWORD is required by the image at startup and is never used by
// anything here: local socket connections in the official image are trusted.
// It is random so that it is not a value anyone could come to rely on.

const startedRun = run('docker', [
  'run',
  '--detach',
  '--name', CONTAINER,
  '--env', `POSTGRES_PASSWORD=${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
  // A throwaway database does not need to survive a crash, and fsync is most
  // of the wall clock on a twelve-file apply.
  IMAGE,
  '-c', 'fsync=off',
  '-c', 'full_page_writes=off',
]);

if (startedRun.status !== 0) {
  die(
    EXIT_NO_DOCKER,
    `Docker could not start a ${IMAGE} container:\n${(startedRun.stderr || '').trim()}`
  );
}
containerStarted = true;

// ---------------------------------------------------------------------------
// 3. Readiness
// ---------------------------------------------------------------------------
//
// THE PROBE IS OVER TCP AND NOT OVER THE UNIX SOCKET, AND THAT IS THE WHOLE
// POINT OF THIS BLOCK. The official postgres image starts TWO servers. The
// first is a temporary one that initdb runs so it can create the database and
// execute any init scripts, and the entrypoint starts it with
// `listen_addresses=''`, so it answers on the unix socket and on nothing else.
// It is then SHUT DOWN and the real server is started with TCP listening.
//
// A socket probe cannot tell those two apart. It reports ready against the
// temporary server, the migrations begin, and the shutdown lands in the middle
// of them:
//
//   FAILED: shim.sql
//   FATAL:  terminating connection due to administrator command
//   server closed the connection unexpectedly
//
// That is a real run, on a GitHub runner, at 2026-08-30. Locally the image was
// warm and the window was missed every time, which is exactly how this class of
// race reaches CI.
//
// A TCP probe is only satisfied by the real server. psql itself still connects
// over the unix socket, where local connections are trusted and no password is
// needed; only the readiness question is asked over TCP.
//
// TWO CONSECUTIVE SUCCESSES ARE REQUIRED. One is enough in principle now that
// the probe distinguishes the servers, and the second costs half a second and
// removes any argument about a partially-initialised listener.

const deadline = Date.now() + READY_TIMEOUT_MS;
let consecutive = 0;
let ready = false;
while (Date.now() < deadline) {
  const probe = run('docker', [
    'exec', CONTAINER,
    'pg_isready', '--host', '127.0.0.1', '--port', '5432', '--username', 'postgres', '--quiet',
  ]);
  consecutive = probe.status === 0 ? consecutive + 1 : 0;
  if (consecutive >= 2) {
    ready = true;
    break;
  }
  // Busy wait on a coarse interval. A sleep here would be a countdown, and a
  // countdown on this machine does not advance while it is suspended, so the
  // loop is bounded by the wall clock deadline above instead.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, READY_POLL_MS);
}

if (!ready) {
  const logs = run('docker', ['logs', '--tail', '20', CONTAINER]);
  die(
    EXIT_NOT_READY,
    `the ${IMAGE} container did not become ready within ${READY_TIMEOUT_MS / 1000}s.\n` +
      `last container output:\n${(logs.stdout || '') + (logs.stderr || '')}`
  );
}

// ---------------------------------------------------------------------------
// 4. Apply
// ---------------------------------------------------------------------------
//
// ON_ERROR_STOP=1 on every file. Without it psql reports an error, carries on
// to the next statement and exits 0, which would make this whole check report
// success on a broken migration.

function psql(label, sql) {
  const res = run(
    'docker',
    ['exec', '--interactive', CONTAINER, 'psql', '--username', 'postgres', '--dbname', 'postgres',
     '--set', 'ON_ERROR_STOP=1', '--quiet', '--no-psqlrc'],
    { input: sql }
  );
  if (res.status !== 0) {
    const detail = [(res.stdout || '').trim(), (res.stderr || '').trim()]
      .filter(Boolean)
      .join('\n');
    die(EXIT_MIGRATION_FAILED, `FAILED: ${label}\n${detail}`);
  }
  return res;
}

psql('shim.sql', readFileSync(SHIM, 'utf8'));
process.stdout.write('shim applied\n');

for (const file of migrations) {
  // Read from disk and send on stdin. UNMODIFIED: nothing here rewrites,
  // strips, splits or reorders the bytes. If a file needs editing to apply,
  // that is a finding about the file, not a job for this script.
  psql(`supabase/migrations/${file}`, readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  process.stdout.write(`applied ${file}\n`);
}

process.stdout.write(`\n${migrations.length} migration files applied, unmodified, on ${IMAGE}\n`);

// ---------------------------------------------------------------------------
// 5. Assertions
// ---------------------------------------------------------------------------
//
// Every .sql file in ./assertions runs against the finished schema, in filename
// order. Each one raises rather than prints, so a failure fails psql under
// ON_ERROR_STOP and fails this run. A file that printed a grid for a human to
// read would be the exact shape CLAUDE.md 8.6 was written to stop.
//
// WHAT THIS IS FOR. A schema card's acceptance asks for proof that a table
// exists with RLS on, the right policies, no delete policy and nothing granted
// to anon. That proof used to require an apply against production, which is the
// owner's and happens on his schedule. Everything in it except the words "on
// production" is checkable here, with no credentials, on every push. Ruling
// R-062.
//
// IT IS ALSO A REGRESSION SUITE AND THAT IS THE HALF THAT KEEPS PAYING. Once a
// card's assertions are in this directory, a LATER migration that quietly drops
// a policy, grants anon a privilege, or removes an updated_at trigger fails
// here, on the pull request that does it, rather than on the day somebody
// notices the data.
//
// An empty directory is not an error. Migrations 0001 to 0012 predate this and
// have none.

const ASSERTIONS_DIR = join(HERE, 'assertions');
const assertions = existsSync(ASSERTIONS_DIR)
  ? readdirSync(ASSERTIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  : [];

for (const file of assertions) {
  psql(`assertions/${file}`, readFileSync(join(ASSERTIONS_DIR, file), 'utf8'));
  process.stdout.write(`asserted ${file}\n`);
}

process.stdout.write(
  assertions.length === 0
    ? 'no assertion files\n'
    : `${assertions.length} assertion files passed\n`
);

teardown();
process.exit(EXIT_OK);
