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

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const GUARD = 'hasPhase3Schema';

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
};

function pendingMigrations() {
  const log = readFileSync(join(ROOT, 'docs/migrations/APPLY-LOG.md'), 'utf8');
  const files = [];
  for (const line of log.split('\n')) {
    const m = /^-\s+`(\d{4}_[a-z0-9_]+\.sql)`\s*,\s*card de aplicare\s+[A-Z0-9-]+\s*$/.exec(
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
    const sql = readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8');
    // Comentariile sunt scoase intai: fisierele acestea explica ce fac, si o
    // explicatie nu este o definitie.
    const code = sql
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n');

    for (const m of code.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi))
      tables.add(m[1]);
    for (const m of code.matchAll(/alter\s+table\s+public\.(\w+)\s+add\s+column\s+(\w+)/gi))
      columns.add(m[2]);
    for (const m of code.matchAll(/create\s+or\s+replace\s+function\s+public\.(\w+)/gi))
      functions.add(m[1]);
    for (const m of code.matchAll(/create\s+function\s+public\.(\w+)/gi)) functions.add(m[1]);
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
  walk(join(ROOT, 'lib'));
  walk(join(ROOT, 'app'));
  walk(join(ROOT, 'components'));
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
  const guarded = src.includes(GUARD);
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
const stale = Object.keys(EXEMPT).filter((rel) => {
  try {
    statSync(join(ROOT, rel));
    return false;
  } catch {
    return true;
  }
});
if (stale.length > 0) {
  console.error('check-pending-schema-reads: scutiri pentru fisiere care nu mai exista:');
  for (const rel of stale) console.error(`  ${rel}`);
  process.exit(1);
}

console.log(
  `check-pending-schema-reads: OK, ${pending.length} migratii in asteptare, ` +
    `${Object.keys(EXEMPT).length} fisiere scutite cu motiv, niciun read neaparat`,
);
