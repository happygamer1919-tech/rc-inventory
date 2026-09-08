#!/usr/bin/env node
// seed-test-procurement.mjs
//
// Datele fixe de care are nevoie tests/e2e/procurement.spec.ts, cardul P3-18.
//
// DE CE UN FISIER SEPARAT: aceeasi regula ca in celelalte scripturi de seed.
// Fiecare script se numeste dupa ce face. Comparatia lui P3-13c are trei
// proiecte si niciun stoc; necesarul are nevoie de sase proiecte in cinci stari
// diferite si de loturi de stoc, iar a le adauga acolo ar schimba aritmetica pe
// care specul acela o verifica de mana.
//
// CE NU SE POATE CONSTRUI PRIN ECRAN:
//
//   1. UN PROIECT SUSPENDAT SAU INCHIS CU DEVIZ ACCEPTAT. Devizul trebuie sa
//      existe inainte ca proiectul sa iasa din starile vii, iar declansatorul
//      din 0025 refuza linii pe un deviz care nu mai este ciorna.
//   2. UN DEVIZ CARE A RAMAS CIORNA PE UN PROIECT VIU, care este cazul
//      "exclus si numarat".
//   3. LOTURI DE STOC CU CANTITATI ALESE, ca deficitul sa fie un numar
//      calculabil de mana si nu ce se intampla sa fie in depozit.
//
// CONVENTIA: randuri marcate TEST, id-uri FIXE, si NICIUN DELETE.
//
// ============================================================================
// ARITMETICA, CALCULATA DE MANA. Specul o repeta.
// ============================================================================
//
// STOCUL este suma loturilor minus tot ce s-a emis, pe produs, GLOBAL.
//
//   produs         lot    emis   stoc
//   TEST-NEC-01      4       0      4
//   TEST-NEC-02     20       0     20
//   TEST-NEC-03      2       1      1
//   TEST-NEC-04     10       9      1
//
// PROIECTELE. Cele patru stari vii intra, suspended si closed nu.
//
//   TEST Necesar prospect     lead       deviz ACCEPTAT   NEC-01 x10, NEC-04 x7
//   TEST Necesar oferta       offer      deviz ACCEPTAT   NEC-01 x5,  NEC-02 x8
//   TEST Necesar contract     contract   deviz ACCEPTAT   NEC-03 x4,  emis 1
//   TEST Necesar in lucru     active     deviz ACCEPTAT   NEC-04 x6 emis 9, NEC-02 x3
//   TEST Necesar suspendat    suspended  deviz ACCEPTAT   NEC-05 x50  EXCLUS, starea
//   TEST Necesar inchis       closed     deviz ACCEPTAT   NEC-05 x50  EXCLUS, starea
//   TEST Necesar doar ciorna  lead       deviz CIORNA     NEC-05 x50  EXCLUS, numarat
//   TEST Necesar fara deviz   offer      niciun deviz                 EXCLUS, numarat
//
// NECESARUL = cantitatea din devizul acceptat MINUS ce s-a emis proiectului,
// podit la zero PE PROIECT SI PE PRODUS, apoi adunat.
//
//   TEST-NEC-01   10 (prospect) + 5 (oferta)            = 15
//   TEST-NEC-02    8 (oferta) + 3 (in lucru)                =  11
//   TEST-NEC-03    4 - 1 (contract)                     =  3
//   TEST-NEC-04    7 (prospect) + max(0, 6 - 9) (in lucru) = 7 + 0 = 7
//
// TEST-NEC-04 ESTE CAZUL CARE CONTEAZA: santierul in lucru a emis 9 dintr-o
// estimare de 6. Contributia lui este ZERO, nu minus 3. Daca ar fi minus 3,
// necesarul randului ar fi 4 in loc de 7, si comanda ar fi cu trei prea mica.
//
// DEFICITUL = necesar minus stoc, podit la zero.
//
//   TEST-NEC-01   15 - 4  = 11
//   TEST-NEC-04    7 - 1  =  6
//   TEST-NEC-03    3 - 1  =  2
//   TEST-NEC-02   11 - 20 =  0   <- stoc suficient, deci NICIUN deficit
//
// Nicio valoare secreta nu este scrisa in jurnal.

const SUPABASE_URL = required("SUPABASE_URL");
const SERVICE_ROLE_KEY = required("SUPABASE_SERVICE_ROLE_KEY");

const CLIENT_ID = "7e57c051-0000-4000-8000-000000000700";
const INBOUND_ID = "7e57c051-0000-4000-8000-000000000710";

const PROJECTS = [
  { key: "lead", id: "7e57c051-0000-4000-8000-000000000701", name: "TEST Necesar prospect", status: "lead" },
  { key: "offer", id: "7e57c051-0000-4000-8000-000000000702", name: "TEST Necesar ofertă", status: "offer" },
  { key: "contract", id: "7e57c051-0000-4000-8000-000000000703", name: "TEST Necesar contract", status: "contract" },
  { key: "active", id: "7e57c051-0000-4000-8000-000000000704", name: "TEST Necesar în lucru", status: "active" },
  { key: "suspended", id: "7e57c051-0000-4000-8000-000000000705", name: "TEST Necesar suspendat", status: "suspended" },
  { key: "closed", id: "7e57c051-0000-4000-8000-000000000706", name: "TEST Necesar închis", status: "closed" },
  { key: "draftonly", id: "7e57c051-0000-4000-8000-000000000707", name: "TEST Necesar doar ciornă", status: "lead" },
  { key: "nodeviz", id: "7e57c051-0000-4000-8000-000000000708", name: "TEST Necesar fără deviz", status: "offer" },
];
const project = Object.fromEntries(PROJECTS.map((p) => [p.key, p]));

const PRODUCTS = [
  { key: "01", id: "7e57c051-0000-4000-8000-000000000711", sku: "TEST-NEC-01", name: "TEST Nec Ciment", unit: "bag", value: 100, batch: 4 },
  { key: "02", id: "7e57c051-0000-4000-8000-000000000712", sku: "TEST-NEC-02", name: "TEST Nec Nisip", unit: "kg", value: 50, batch: 20 },
  { key: "03", id: "7e57c051-0000-4000-8000-000000000713", sku: "TEST-NEC-03", name: "TEST Nec Cărămidă", unit: "pcs", value: 20, batch: 2 },
  { key: "04", id: "7e57c051-0000-4000-8000-000000000714", sku: "TEST-NEC-04", name: "TEST Nec Var", unit: "bag", value: 30, batch: 10 },
  { key: "05", id: "7e57c051-0000-4000-8000-000000000715", sku: "TEST-NEC-05", name: "TEST Nec Ipsos", unit: "bag", value: 40, batch: 0 },
];
const product = Object.fromEntries(PRODUCTS.map((p) => [p.key, p]));

// Un deviz per proiect. `status` este starea FINALA, dupa ce liniile au intrat.
const DEVIZE = [
  { id: "7e57c051-0000-4000-8000-000000000721", project: "lead", status: "accepted", lines: [{ product: "01", quantity: 10, price: 100 }, { product: "04", quantity: 7, price: 30 }] },
  { id: "7e57c051-0000-4000-8000-000000000722", project: "offer", status: "accepted", lines: [{ product: "01", quantity: 5, price: 100 }, { product: "02", quantity: 8, price: 50 }] },
  { id: "7e57c051-0000-4000-8000-000000000723", project: "contract", status: "accepted", lines: [{ product: "03", quantity: 4, price: 20 }] },
  // DOUA LINII, SI A DOUA ESTE MARTORUL CLAUZEI. Cardul cere explicit ca un
  // proiect in active cu deviz acceptat SA FIE INCLUS. Prima linie este cazul
  // supra-emis, care contribuie zero si deci nu s-ar vedea nicaieri; a doua este
  // un necesar real, care il face vizibil in defalcarea pe stare.
  { id: "7e57c051-0000-4000-8000-000000000724", project: "active", status: "accepted", lines: [{ product: "04", quantity: 6, price: 30 }, { product: "02", quantity: 3, price: 50 }] },
  { id: "7e57c051-0000-4000-8000-000000000725", project: "suspended", status: "accepted", lines: [{ product: "05", quantity: 50, price: 40 }] },
  { id: "7e57c051-0000-4000-8000-000000000726", project: "closed", status: "accepted", lines: [{ product: "05", quantity: 50, price: 40 }] },
  // RAMANE CIORNA. Este cazul "are devize, dar niciunul acceptat".
  { id: "7e57c051-0000-4000-8000-000000000727", project: "draftonly", status: "draft", lines: [{ product: "05", quantity: 50, price: 40 }] },
  // "nodeviz" nu are niciun deviz, deliberat.
];

const ISSUES = [
  {
    id: "7e57c051-0000-4000-8000-000000000731",
    reference: "TEST-NEC-BON-1",
    project: "contract",
    issued_at: "2026-06-02T09:00:00+03:00",
    shipped_at: "2026-06-02T15:00:00+03:00",
    status: "shipped",
    lines: [{ product: "03", quantity: 1 }],
  },
  {
    id: "7e57c051-0000-4000-8000-000000000732",
    reference: "TEST-NEC-BON-2",
    project: "active",
    issued_at: "2026-06-04T09:00:00+03:00",
    shipped_at: "2026-06-04T15:00:00+03:00",
    status: "shipped",
    // NOUA DINTR-O ESTIMARE DE SASE. Contributia acestui proiect trebuie sa fie
    // zero, nu minus trei.
    lines: [{ product: "04", quantity: 9 }],
  },
];

function required(name) {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    console.error(`seed-procurement: variabila de mediu ${name} lipseste`);
    process.exit(2);
  }
  return v.trim();
}

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

async function upsert(table, rows, label) {
  if (rows.length === 0) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=id`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`seed-procurement: nu s-a putut scrie ${label}: ${res.status} ${text}`);
    process.exit(3);
  }
}

async function firstCategoryId() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/categories?select=id&order=sort_order.asc&limit=1`, { headers });
  if (!res.ok) {
    console.error(`seed-procurement: nu s-au putut citi categoriile: ${res.status}`);
    process.exit(3);
  }
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    console.error("seed-procurement: nicio categorie in baza. Migratiile nu au rulat.");
    process.exit(3);
  }
  return rows[0].id;
}

async function main() {
  const categoryId = await firstCategoryId();

  await upsert("clients", [{ id: CLIENT_ID, name: "TEST Beneficiar Necesar", active: true }], "clientul");

  await upsert(
    "projects",
    PROJECTS.map((p) => ({
      id: p.id,
      client_id: CLIENT_ID,
      name: p.name,
      status: p.status,
      active: p.status !== "closed",
    })),
    "proiectele",
  );

  await upsert(
    "products",
    PRODUCTS.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      category_id: categoryId,
      unit: p.unit,
      threshold: 0,
      unit_value_mdl: p.value,
      active: true,
    })),
    "produsele",
  );

  // STOCUL ESTE O SUMA DE LOTURI, SI UN LOT ARE NEVOIE DE O COMANDA. batches
  // cere inbound_order_id SI order_line_id, amandoua NOT NULL, si order_line_id
  // este unic pe lot. Deci o comanda sosita, o linie pe produs, un lot pe linie.
  // Nu este ceremonie: este graful pe care ecranul de inventar il citeste, si un
  // stoc scris pe langa el ar fi un al doilea adevar despre acelasi numar.
  const withStock = PRODUCTS.filter((p) => p.batch > 0);
  await upsert(
    "inbound_orders",
    [{
      id: INBOUND_ID,
      reference: "TEST-NEC-INTRARE",
      supplier_name: "TEST Furnizor Necesar",
      currency: "MDL",
      total_mdl: 0,
      status: "arrived",
      arrived_at: "2026-06-01T09:00:00+03:00",
    }],
    "comanda de intrare",
  );
  await upsert(
    "order_lines",
    withStock.map((p) => ({
      id: `${p.id.slice(0, 24)}c0${p.id.slice(26)}`,
      inbound_order_id: INBOUND_ID,
      product_id: p.id,
      quantity: p.batch,
      unit_price: p.value,
    })),
    "liniile comenzii de intrare",
  );
  await upsert(
    "batches",
    withStock.map((p) => ({
      id: `${p.id.slice(0, 24)}b0${p.id.slice(26)}`,
      product_id: p.id,
      inbound_order_id: INBOUND_ID,
      order_line_id: `${p.id.slice(0, 24)}c0${p.id.slice(26)}`,
      quantity: p.batch,
      arrived_at: "2026-06-01T09:00:00+03:00",
    })),
    "loturile de stoc",
  );

  // CIORNE INTAI, ca declansatorul din 0025 sa lase liniile sa intre.
  const base = DEVIZE.map((d) => ({
    id: d.id,
    project_id: project[d.project].id,
    version: 1,
    margin_percent: 0,
    currency: "MDL",
  }));
  await upsert("devize", base.map((d) => ({ ...d, status: "draft" })), "devizele ca ciorne");

  const lines = [];
  for (const d of DEVIZE) {
    d.lines.forEach((l, index) => {
      lines.push({
        id: `${d.id.slice(0, 24)}${String(index + 1).padStart(2, "0")}${d.id.slice(26)}`,
        deviz_id: d.id,
        product_id: product[l.product].id,
        quantity: l.quantity,
        unit_price_mdl: l.price,
        sort_order: index + 1,
      });
    });
  }
  await upsert("deviz_lines", lines, "liniile de deviz");

  // ...si abia apoi starea finala. Cea care ramane ciorna se rescrie identic.
  await upsert(
    "devize",
    base.map((d) => ({ ...d, status: DEVIZE.find((x) => x.id === d.id).status })),
    "devizele in starea finala",
  );

  await upsert(
    "outbound_issues",
    ISSUES.map((i) => ({
      id: i.id,
      reference: i.reference,
      project_id: project[i.project].id,
      issued_at: i.issued_at,
      shipped_at: i.shipped_at,
      status: i.status,
    })),
    "bonurile",
  );

  const issueLines = [];
  for (const issue of ISSUES) {
    issue.lines.forEach((l, index) => {
      issueLines.push({
        id: `${issue.id.slice(0, 24)}${String(index + 1).padStart(2, "0")}${issue.id.slice(26)}`,
        outbound_issue_id: issue.id,
        product_id: product[l.product].id,
        quantity: l.quantity,
      });
    });
  }
  await upsert("outbound_lines", issueLines, "liniile bonurilor");

  console.log(
    `seed-procurement: ${PROJECTS.length} proiecte, ${DEVIZE.length} devize, ${lines.length} linii de deviz, ${ISSUES.length} bonuri, ${issueLines.length} linii de bon`,
  );
}

main().catch((err) => {
  console.error(`seed-procurement: ${err && err.message ? err.message : err}`);
  process.exit(1);
});
