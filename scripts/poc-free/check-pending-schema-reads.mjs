#!/usr/bin/env node
// check-pending-schema-reads.mjs
//
// REFUZA CODUL DE APLICATIE CARE CITESTE NECONDITIONAT SCHEMA NEAPLICATA.
//
// DE CE EXISTA. Pe 2026-08-31 platforma a cazut cu 500 pe fiecare ecran. Cauza
// nu a fost o migratie gresita, o rezolvare de conflict sau un test slab: cele
// treisprezece migratii ale fazei 3 erau SCRISE SI FUZIONATE dar NEAPLICATE, iar
// codul fuzionat odata cu ele cerea coloane care nu existau inca. Tabloul de
// bord cheama listProducts, listProducts cerea supplier_id, coloana este adaugata
// de 0019, si 0019 este in registrul de asteptare.
//
// NIMIC NU A PRINS-O. Fiecare card a fost verde: tsc, build, migratiile pe un
// postgres gol, si suita Playwright pe o stiva locala unde `supabase db reset`
// APLICA TOATE migratiile. CI ruleaza intotdeauna pe schema completa, deci CI nu
// poate vedea diferenta dintre schema fuzionata si schema aplicata. Aceasta
// verificare o vede, pentru ca citeste registrul.
//
// REGULA, SI ESTE DELIBERAT GROSOLANA: un fisier din lib/ sau app/ care numeste
// un obiect adaugat de o migratie AFLATA IN ASTEPTARE trebuie sa importe si
// hasPhase3Schema. Nu se incearca sa se dovedeasca faptul ca poarta este pe calea
// corecta: o astfel de analiza ar fi fragila si ar da incredere falsa. Se cere
// doar ca fisierul sa fi fost NEVOIT sa se gandeasca la problema.
//
// CE NUMESTE "IN ASTEPTARE": liniile din registrul de la
// docs/migrations/APPLY-LOG.md, sectiunea adaugata de R-062. Cand P3-27 aplica
// migratiile si liniile dispar din registru, verificarea inceteaza singura sa
// mai ceara ceva despre ele, fara sa fie editata.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
// EXT-15. FIECARE POARTA DE CAPABILITATE, NU UNA SINGURA NUMITA LITERAL.
//
// Constanta era sirul 'hasPhase3Schema', si atat timp cat exista o singura
// poarta aceea era acelasi lucru. EXT-15 a adaugat a doua,
// hasExtractionDocumentSource, pentru o migratie separata: hasPhase3Schema
// raspunde la alta intrebare, iar o poarta care raspunde la intrebarea gresita
// este o poarta care se deschide in ziua nepotrivita.
//
// LISTA SE DERIVA DIN lib/data/schema-capability.ts, deci a treia poarta este
// acoperita fara ca acest fisier sa fie editat, iar numarul citit este VERIFICAT:
// zero porti inseamna ca tiparul a incetat sa citeasca acel fisier, si atunci
// FIECARE fisier aparat ar fi raportat ca neaparat. Un refuz in masa citit ca
// descoperire este exact defectul pe care aceasta rulare l-a produs o data deja,
// cand o coloana numita `if` a fost cautata in tot codul sursa.
const CAPABILITY_MODULE = 'lib/data/schema-capability.ts';
const GUARDS = (() => {
  const src = readFileSync(join(ROOT, CAPABILITY_MODULE), 'utf8');
  const names = [...src.matchAll(/export\s+async\s+function\s+(has\w+)/g)].map((m) => m[1]);
  if (names.length === 0) {
    console.error(`check-pending-schema-reads: zero porti de capabilitate gasite in ${CAPABILITY_MODULE}.`);
    console.error('Fara ele fiecare fisier aparat ar fi raportat ca neaparat. Refuz sa raportez.');
    process.exit(2);
  }
  return names;
})();
const GUARD = GUARDS.join(' sau ');

// TESTABILITY OVERRIDES, so scripts/poc-free/prove-schema-direction.mjs can point
// this check at a reconstruction of INC-05 and watch it fire. A guard that has
// never been seen to fail is not a guard, and this one had only ever fired in
// production. An absolute override is used as given; a relative one is resolved
// against the repo root.
const absPath = (d) => (d.startsWith('/') ? d : join(ROOT, d));
const APPLY_LOG_PATH = process.env.RC_PENDING_REGISTER
  ? absPath(process.env.RC_PENDING_REGISTER)
  : join(ROOT, 'docs/migrations/APPLY-LOG.md');
const MIGRATIONS_PATH = process.env.RC_PENDING_MIGRATIONS
  ? absPath(process.env.RC_PENDING_MIGRATIONS)
  : join(ROOT, 'supabase/migrations');
const SOURCE_ROOTS = process.env.RC_PENDING_SOURCE
  ? [absPath(process.env.RC_PENDING_SOURCE)]
  : [join(ROOT, 'lib'), join(ROOT, 'app'), join(ROOT, 'components')];

// FISIERELE SCUTITE, FIECARE CU MOTIVUL LUI SCRIS.
//
// Un fisier ajunge aici doar cand TOTI apelantii lui sunt deja aparati, ceea ce
// inseamna in practica: este citit numai de una dintre cele patru rute ale fazei
// 3, iar acele rute randeaza SchemaPending inainte sa cheme orice.
//
// SCUTIREA ESTE O DECIZIE SCRISA, NU O TACERE. Regula de baza a acestei
// verificari este deliberat grosolana si de aceea da si rezultate fals pozitive;
// alternativa ar fi sa se demonstreze ca poarta este pe calea corecta, adica o
// analiza fragila care da incredere falsa. O lista scurta pe care o citeste un om
// este mai buna decat o euristica in care nimeni nu are incredere.
//
// Verificarea refuza o intrare pentru un fisier care nu mai exista, ca lista sa
// nu putrezeasca.
const EXEMPT = {
  'lib/data/schema-capability.ts': 'este poarta insasi',
  'lib/data/clients.ts':
    'listClients arunca, dar este chemat numai de /clienti, care randeaza SchemaPending inainte. getClient inghite eroarea si intoarce null, deci este sigur si de pe /comenzi.',
  'lib/data/contact-actions.ts':
    'scrierile de contacte sunt ajunse numai din fila Contacte de pe fisa clientului, iar acea ruta este aparata.',
  'lib/data/project-actions.ts':
    'scrierile de proiecte sunt ajunse numai din ecranele de proiecte, iar acele rute sunt aparate.',
  'lib/data/projects-list.ts':
    'listProjects arunca, dar este chemat numai de /proiecte, care este aparata. getProject inghite eroarea si intoarce null, deci este sigur si de pe /comenzi.',
  'lib/data/projects.ts':
    'listSelectableProjects este chemat numai cand hasPhase3Schema() a raspuns da, in app/(app)/iesiri/page.tsx, si oricum inghite eroarea.',
  'lib/reporting/material-cost.ts':
    'raportul de cost este citit numai de /proiecte/[id], care este aparata.',
  'lib/data/client-actions.ts':
    'scrierile de clienti sunt ajunse numai din formularul de pe /clienti si /clienti/[id], iar ambele rute sunt aparate.',
  'lib/data/client-detail.ts':
    'citirile filelor de pe fisa clientului sunt chemate numai de /clienti/[id], care este aparata, si toate inghit eroarea si intorc liste goale.',
  'lib/data/deviz.ts':
    'getProjectDevizView este chemat dintr-un singur loc, app/(app)/proiecte/[id]/page.tsx, care randeaza SchemaPending si se intoarce inainte sa il cheme. Celelalte trei importuri din fisier sunt `import type` si dispar la compilare.',
  'lib/data/deviz-actions.ts':
    'scrierile de deviz sunt chemate numai din components/projects/DevizPanel.tsx, care este randat de ProjectTabs numai in arborele lui /proiecte/[id], adica numai dupa aceeasi poarta.',
  // P3-11e. Singura scutire de pe lista aceasta care NU este aparata de o
  // poarta, si care nu poate fi: hasPhase3Schema raspunde la alta intrebare, iar
  // o poarta pentru 0028 ar fi ea insasi o functie dintr-o migratie neaplicata,
  // exact cursa pe care antetul lui schema-capability.ts o numeste.
  //
  // Ruta este structural incapabila sa cada pe lipsa functiei: apelul rpc este
  // intr-un try, o eroare de la PostgREST devine null, si null se citeste ca
  // "nu stiu" si nu ca "niciuna", inclusiv de aplierul care o interogheaza.
  // Numarul de versiune este in plus fata de ce foloseste aplierul: el decide pe
  // commit, care nu atinge baza de date deloc.
  //
  // O RUTA DE SANATATE CARE CADE ESTE MAI RAU DECAT INUTILA, si aceea este
  // ratiunea de a fi a formei: este singurul endpoint pe care cineva il
  // interogheaza tocmai cand restul este stricat.
  'app/api/health/route.ts':
    'apelul catre applied_ledger_version() este intr-un try si orice eroare devine null, deci ruta raspunde 200 cu ledger_version null si nu se prabuseste cat timp 0028 este in asteptare. Aplierul decide pe campul commit, care nu atinge baza de date.',
};

function pendingMigrations() {
  const log = readFileSync(APPLY_LOG_PATH, 'utf8');
  const files = [];
  for (const line of log.split('\n')) {
    const m = /^-\s+`(\d{4}_[a-z0-9_]+\.sql)`\s*,\s*card de aplicare\s+[A-Za-z0-9-]+\s*$/.exec(
      line.trim(),
    );
    if (m) files.push(m[1]);
  }
  return files;
}

/** Tabelele, coloanele si functiile pe care le ADAUGA migratiile in asteptare. */
function objectsAddedBy(files) {
  const tables = new Set();
  const columns = new Set();
  const functions = new Set();

  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS_PATH, f), 'utf8');
    // Comentariile sunt scoase intai: fisierele acestea explica ce fac, si o
    // explicatie nu este o definitie.
    const code = sql
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n');

    for (const m of code.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi))
      tables.add(m[1]);
    // `if not exists` IS OPTIONAL HERE AND OMITTING IT WAS A REAL DEFECT.
    //
    // The pattern was `add\s+column\s+(\w+)` and migration 0032 writes
    // `add column if not exists document_source text`, so the capture was the
    // word `if`. The check then looked for a column named `if` in every source
    // file, found it in almost all of them, and reported the whole application
    // as reading unapplied schema. The `create table` pattern two lines above
    // already handled the same clause; this one did not.
    for (const m of code.matchAll(
      /alter\s+table\s+public\.(\w+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)/gi,
    ))
      columns.add(m[2]);
    for (const m of code.matchAll(/create\s+or\s+replace\s+function\s+public\.(\w+)/gi))
      functions.add(m[1]);
    for (const m of code.matchAll(/create\s+function\s+public\.(\w+)/gi)) functions.add(m[1]);
  }
  // AN OBJECT NAME THAT IS A SQL KEYWORD IS A PARSE FAILURE, NOT AN OBJECT.
  //
  // This is the durable half of the fix above, and it is here because the regex
  // was not the whole defect. A pattern that captures the wrong token produces a
  // NAME, and this file then searches for that name in every source file and
  // reports what it finds. The output was confident, specific, and about nothing:
  // "lib/data/dashboard.ts numeste coloana if".
  //
  // docs/LEARNINGS.md names the class: a check whose passing path is reachable
  // without the condition being true. This is its mirror, a check whose FAILING
  // path is reachable without the condition being true, and it is worse, because
  // a false green is ignored once and a false red is ignored forever.
  //
  // So a captured name that is a keyword stops the run instead of being searched
  // for. The list is short and explicit: these are the words a broken pattern
  // actually lands on, and adding one is a decision readable in a diff.
  const KEYWORDS = new Set([
    'if', 'not', 'exists', 'column', 'table', 'add', 'drop', 'alter', 'create',
    'or', 'replace', 'function', 'public', 'and', 'set', 'to', 'default',
  ]);
  for (const [kind, set] of [['tabela', tables], ['coloana', columns], ['functie', functions]]) {
    for (const name of set) {
      if (!KEYWORDS.has(String(name).toLowerCase())) continue;
      console.error(
        `check-pending-schema-reads: a extras ${kind} numita "${name}", care este un cuvant cheie SQL.`,
      );
      console.error(
        'Asta nu este un obiect, este o potrivire gresita: tiparul a capturat alt token decat numele.',
      );
      console.error(
        'Refuz sa caut acest nume in codul sursa, fiindca l-as gasi peste tot si as raporta cu incredere despre nimic.',
      );
      process.exit(2);
    }
  }

  return { tables, columns, functions };
}

function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (name === 'node_modules' || name.startsWith('.')) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name)) out.push(full);
    }
  };
  for (const r of SOURCE_ROOTS) if (existsSync(r)) walk(r);
  return out;
}

const pending = pendingMigrations();
if (pending.length === 0) {
  console.log('check-pending-schema-reads: nicio migratie in asteptare, nimic de verificat');
  process.exit(0);
}

const { tables, columns, functions } = objectsAddedBy(pending);
const violations = [];

for (const file of sourceFiles()) {
  const rel = file.slice(ROOT.length).replace(/^\/+/, '');
  if (rel in EXEMPT) continue;

  const src = readFileSync(file, 'utf8');
  const guarded = GUARDS.some((g) => src.includes(g));
  const hits = [];

  for (const t of tables) {
    if (new RegExp(`\\.from\\(["'\`]${t}["'\`]\\)`).test(src)) hits.push(`tabela ${t}`);
  }
  for (const f of functions) {
    if (new RegExp(`\\.rpc\\(["'\`]${f}["'\`]`).test(src)) hits.push(`functia ${f}`);
  }
  for (const c of columns) {
    // ORIUNDE IN FISIER, NU DOAR INTR-UN select(). Prima versiune cauta numele
    // coloanei intre parantezele lui select, ceea ce a parut suficient pentru ca
    // exact asa arata codul care a doborat productia. Nu este: un sir de coloane
    // pus intr-o constanta si trecut apoi lui select nu mai contine numele acolo,
    // si verificarea l-ar rata tocmai in fisierul care tocmai a fost refactorizat.
    // Un fisier care numeste o coloana in asteptare ORIUNDE trebuie sa fi trecut
    // pe langa poarta.
    if (new RegExp(`\\b${c}\\b`).test(src)) hits.push(`coloana ${c}`);
  }

  if (hits.length > 0 && !guarded) {
    violations.push({ rel, hits: [...new Set(hits)] });
  }
}

if (violations.length > 0) {
  // REFUSAL: pending-schema-reads-unapplied-read
  console.error('check-pending-schema-reads: COD DE APLICATIE CARE CITESTE SCHEMA NEAPLICATA\n');
  console.error(`Migratii in asteptare, din docs/migrations/APPLY-LOG.md: ${pending.join(', ')}\n`);
  for (const v of violations) {
    console.error(`  ${v.rel}`);
    for (const h of v.hits) console.error(`      numeste ${h}`);
  }
  console.error(
    '\nFiecare dintre aceste fisiere ruleaza pe productie, unde obiectele de mai sus NU EXISTA.',
  );
  console.error(
    'Un select care numeste o coloana inexistenta intoarce 42703 si ecranul raspunde 500.',
  );
  console.error(
    `\nImporta si foloseste ${GUARD} din lib/data/schema-capability.ts, si citeste doar ce exista,`,
  );
  console.error(
    'sau randeaza SchemaPending. Verificarea inceteaza singura cand P3-27 aplica migratiile.',
  );
  process.exit(1);
}

// O scutire pentru un fisier care nu mai exista este o lista care a ramas in urma
// si ar ascunde exact cazul pentru care exista lista.
// PROVE-01. AN EXTRA EXEMPTION, FOR THE PROOF THAT THE STALE CHECK FIRES.
//
// The stale-exemption refusal had never been watched fail, and the only way to
// watch it is to hand the check an exemption naming a file that does not exist.
// Adding one to the committed EXEMPT map to test it would leave a permanent lie
// in the list; this seam is read from the environment and is empty in every real
// run, so the committed list is exactly what a reader sees.
const EXEMPT_KEYS = Object.keys(EXEMPT).concat(
  (process.env.RC_PENDING_EXEMPT_EXTRA || '').split(',').map((x) => x.trim()).filter(Boolean),
);

const stale = EXEMPT_KEYS.filter((rel) => {
  try {
    statSync(join(ROOT, rel));
    return false;
  } catch {
    return true;
  }
});
if (stale.length > 0) {
  // REFUSAL: pending-schema-reads-stale-exemption
  console.error('check-pending-schema-reads: scutiri pentru fisiere care nu mai exista:');
  for (const rel of stale) console.error(`  ${rel}`);
  process.exit(1);
}

console.log(
  `check-pending-schema-reads: OK, ${pending.length} migratii in asteptare, ` +
    `${Object.keys(EXEMPT).length} fisiere scutite cu motiv, niciun read neaparat`,
);
