#!/usr/bin/env node
// seed-test-deviz-comparison.mjs
//
// Datele fixe de care are nevoie tests/e2e/deviz-comparison.spec.ts, cardul
// P3-13c.
//
// DE CE UN FISIER SEPARAT, si nu randuri adaugate in seed-test-deviz.mjs:
// aceeasi regula pe care o scrie fisierul acela. Fiecare script de seed se
// numeste dupa ce face. seed-test-deviz.mjs construieste cazul lui P3-13b, un
// deviz ofertat in martie citit in iunie, si nu are nicio iesire. Comparatia are
// nevoie de iesiri, si a le adauga acolo ar schimba aritmetica pe care specul
// acela o verifica de mana.
//
// CE NU SE POATE CONSTRUI PRIN ECRAN, si de asta exista fisierul:
//
//   1. UN DEVIZ ACCEPTAT CU LINII PE EL. Declansatorul deviz_lines_require_draft
//      din migratia 0025 refuza orice inserare de linie pe un deviz iesit din
//      ciorna. Prin ecran ar trebui linii, apoi trimitere, apoi acceptare, iar
//      comparatia trebuie sa citeasca o versiune stabila.
//
//   2. IESIRI CU DATA IN TRECUT. Formularul de iesire nu are camp de data.
//
//   3. UN DEVIZ FARA NICIO LINIE PE UN PROIECT CU IESIRI. Este cazul in care
//      FIECARE rand este Neprevazut si totalul devizului este zero, deci
//      procentul de abatere este o liniuta si nu o impartire la zero.
//
// CONVENTIA, la fel ca in celelalte scripturi de seed: randuri marcate TEST,
// id-uri FIXE si nu generate, si NICIUN DELETE. Un DELETE scris pentru o baza de
// test este un DELETE care intr-o zi ruleaza pe una reala.
//
// ============================================================================
// ARITMETICA, SCRISA CA SA POATA FI VERIFICATA DE MANA. Specul o repeta, ca
// amandoua sa poata fi citite fara sa fie deschis celalalt fisier.
// ============================================================================
//
// CATALOGUL. Pretul OFERTAT este inghetat pe linia de deviz; VALOAREA este cea
// de azi din catalog si este cea cu care se evalueaza ce s-a emis.
//
//   TEST-CMP-01  Ciment    bag   ofertat 100.00   valoare azi 120.00
//   TEST-CMP-02  Nisip     kg    ofertat  50.00   valoare azi  50.00
//   TEST-CMP-03  Caramida  pcs   ofertat  20.00   valoare azi  25.00
//   TEST-CMP-04  Var       bag   NEOFERTAT        valoare azi  30.00
//   TEST-CMP-05  Pietris   kg    NEOFERTAT        valoare azi  10.00
//   TEST-CMP-06  Ipsos     bag   NEOFERTAT        valoare azi  40.00
//
// PROIECTUL 1, "TEST Comparatie deviz". Deviz v1 ACCEPTAT, adaos 10%.
//
//   linie          cantitate  pret ofertat   Estimat MDL
//   TEST-CMP-01           10        100.00       1000.00
//   TEST-CMP-02            5         50.00        250.00
//   TEST-CMP-03            3         20.00         60.00
//                                    subtotal     1310.00
//                                    adaos 10%     131.00
//                                    total        1441.00
//
//   iesiri         cantitate  valoare azi     Emis MDL
//   TEST-CMP-01            4        120.00       480.00
//   TEST-CMP-03            8         25.00       200.00   <- 8 peste 3, DEPASIRE
//   TEST-CMP-04            6         30.00       180.00   <- NEPREVAZUT
//                                    total        860.00
//
//   comparatia, rand cu rand:
//     TEST-CMP-01  est 10 / 1000.00   emis 4 / 480.00   dif  -6 /  -520.00
//     TEST-CMP-02  est  5 /  250.00   emis 0 /   0.00   dif  -5 /  -250.00
//     TEST-CMP-03  est  3 /   60.00   emis 8 / 200.00   dif  +5 /  +140.00  DEPASIRE
//     TEST-CMP-04  est  0 /    0.00   emis 6 / 180.00   dif  +6 /  +180.00  NEPREVAZUT
//
//   subsolul:
//     Total materiale estimate  1310.00   (materialul la pret ofertat, ADAOSUL IN AFARA)
//     Total emis    860.00
//     Abatere      -450.00
//     Abatere %     -34.35   ( -450 / 1310 * 100 = -34.351145..., la ban -34.35 )
//
// PROIECTUL 2, "TEST Comparatie fara iesiri". Deviz v1 ACCEPTAT, o linie, zero
// iesiri. Fiecare rand are emis zero si abaterea este exact minus totalul.
//
//   TEST-CMP-01  cantitate 2  ofertat 100.00  =  200.00
//     Total materiale estimate  200.00   Total emis 0.00   Abatere -200.00   Abatere % -100.00
//
// PROIECTUL 3, "TEST Comparatie doar neprevazut". Deviz v1 acceptat FARA LINII,
// si doua iesiri de produse neofertate.
//
//   TEST-CMP-05  cantitate 7  valoare azi 10.00  =   70.00
//   TEST-CMP-06  cantitate 3  valoare azi 40.00  =  120.00
//     Total materiale estimate    0.00   Total emis 190.00   Abatere +190.00   Abatere %  -
//
// Nicio valoare secreta nu este scrisa in jurnal.

const SUPABASE_URL = required("SUPABASE_URL");
const SERVICE_ROLE_KEY = required("SUPABASE_SERVICE_ROLE_KEY");

const CLIENT_ID = "7e57c051-0000-4000-8000-0000000005c0";

const PROJECT_MAIN_ID = "7e57c051-0000-4000-8000-0000000005c1";
const PROJECT_NO_ISSUES_ID = "7e57c051-0000-4000-8000-0000000005c2";
const PROJECT_ONLY_UNPLANNED_ID = "7e57c051-0000-4000-8000-0000000005c3";

const DEVIZ_MAIN_ID = "7e57c051-0000-4000-8000-0000000005d1";
const DEVIZ_NO_ISSUES_ID = "7e57c051-0000-4000-8000-0000000005d2";
const DEVIZ_EMPTY_ID = "7e57c051-0000-4000-8000-0000000005d3";

const PRODUCTS = [
  { key: "01", id: "7e57c051-0000-4000-8000-0000000005e1", sku: "TEST-CMP-01", name: "TEST Comp Ciment", unit: "bag", value: 120 },
  { key: "02", id: "7e57c051-0000-4000-8000-0000000005e2", sku: "TEST-CMP-02", name: "TEST Comp Nisip", unit: "kg", value: 50 },
  { key: "03", id: "7e57c051-0000-4000-8000-0000000005e3", sku: "TEST-CMP-03", name: "TEST Comp Cărămidă", unit: "pcs", value: 25 },
  { key: "04", id: "7e57c051-0000-4000-8000-0000000005e4", sku: "TEST-CMP-04", name: "TEST Comp Var", unit: "bag", value: 30 },
  { key: "05", id: "7e57c051-0000-4000-8000-0000000005e5", sku: "TEST-CMP-05", name: "TEST Comp Pietriș", unit: "kg", value: 10 },
  { key: "06", id: "7e57c051-0000-4000-8000-0000000005e6", sku: "TEST-CMP-06", name: "TEST Comp Ipsos", unit: "bag", value: 40 },
];
const byKey = Object.fromEntries(PRODUCTS.map((p) => [p.key, p]));

// Liniile de deviz, cu pretul INGHETAT. Nu este valoarea din catalog.
const DEVIZ_LINES = [
  { id: "7e57c051-0000-4000-8000-0000000005f1", deviz: DEVIZ_MAIN_ID, product: "01", quantity: 10, unit_price_mdl: 100, sort_order: 1 },
  { id: "7e57c051-0000-4000-8000-0000000005f2", deviz: DEVIZ_MAIN_ID, product: "02", quantity: 5, unit_price_mdl: 50, sort_order: 2 },
  { id: "7e57c051-0000-4000-8000-0000000005f3", deviz: DEVIZ_MAIN_ID, product: "03", quantity: 3, unit_price_mdl: 20, sort_order: 3 },
  { id: "7e57c051-0000-4000-8000-0000000005f4", deviz: DEVIZ_NO_ISSUES_ID, product: "01", quantity: 2, unit_price_mdl: 100, sort_order: 1 },
  // DEVIZ_EMPTY_ID nu are nicio linie, deliberat.
];

const ISSUES = [
  {
    id: "7e57c051-0000-4000-8000-000000000601",
    reference: "TEST-CMP-BON-1",
    project: PROJECT_MAIN_ID,
    issued_at: "2026-05-12T09:00:00+03:00",
    shipped_at: "2026-05-12T15:00:00+03:00",
    status: "shipped",
    lines: [
      { product: "01", quantity: 4 },
      { product: "03", quantity: 8 },
    ],
  },
  {
    id: "7e57c051-0000-4000-8000-000000000602",
    reference: "TEST-CMP-BON-2",
    project: PROJECT_MAIN_ID,
    issued_at: "2026-05-20T09:00:00+03:00",
    shipped_at: null,
    status: "awaiting_shipment",
    lines: [{ product: "04", quantity: 6 }],
  },
  {
    id: "7e57c051-0000-4000-8000-000000000603",
    reference: "TEST-CMP-BON-3",
    project: PROJECT_ONLY_UNPLANNED_ID,
    issued_at: "2026-05-22T09:00:00+03:00",
    shipped_at: "2026-05-22T16:00:00+03:00",
    status: "shipped",
    lines: [
      { product: "05", quantity: 7 },
      { product: "06", quantity: 3 },
    ],
  },
];

function required(name) {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    console.error(`seed-comparison: variabila de mediu ${name} lipseste`);
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
    console.error(`seed-comparison: nu s-a putut scrie ${label}: ${res.status} ${text}`);
    process.exit(3);
  }
}

async function firstCategoryId() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/categories?select=id&order=sort_order.asc&limit=1`, { headers });
  if (!res.ok) {
    console.error(`seed-comparison: nu s-au putut citi categoriile: ${res.status}`);
    process.exit(3);
  }
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    console.error("seed-comparison: nicio categorie in baza. Migratiile nu au rulat.");
    process.exit(3);
  }
  return rows[0].id;
}

async function main() {
  const categoryId = await firstCategoryId();

  await upsert("clients", [{ id: CLIENT_ID, name: "TEST Beneficiar Comparație", active: true }], "clientul");

  await upsert(
    "projects",
    [
      { id: PROJECT_MAIN_ID, client_id: CLIENT_ID, name: "TEST Comparație deviz", status: "active", active: true },
      { id: PROJECT_NO_ISSUES_ID, client_id: CLIENT_ID, name: "TEST Comparație fără ieșiri", status: "active", active: true },
      { id: PROJECT_ONLY_UNPLANNED_ID, client_id: CLIENT_ID, name: "TEST Comparație doar neprevăzut", status: "active", active: true },
    ],
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
    "produsele de comparație",
  );

  // DEVIZELE INTAI CA CIORNE, ca declansatorul din 0025 sa lase liniile sa intre,
  // si abia apoi acceptate. Ordinea este a bazei, nu o preferinta.
  const devize = [
    { id: DEVIZ_MAIN_ID, project_id: PROJECT_MAIN_ID, version: 1, margin_percent: 10 },
    { id: DEVIZ_NO_ISSUES_ID, project_id: PROJECT_NO_ISSUES_ID, version: 1, margin_percent: 10 },
    { id: DEVIZ_EMPTY_ID, project_id: PROJECT_ONLY_UNPLANNED_ID, version: 1, margin_percent: 10 },
  ];
  await upsert("devize", devize.map((d) => ({ ...d, status: "draft", currency: "MDL" })), "devizele ca ciorne");

  await upsert(
    "deviz_lines",
    DEVIZ_LINES.map((l) => ({
      id: l.id,
      deviz_id: l.deviz,
      product_id: byKey[l.product].id,
      quantity: l.quantity,
      unit_price_mdl: l.unit_price_mdl,
      sort_order: l.sort_order,
    })),
    "liniile de deviz",
  );

  await upsert("devize", devize.map((d) => ({ ...d, status: "accepted", currency: "MDL" })), "devizele acceptate");

  await upsert(
    "outbound_issues",
    ISSUES.map((i) => ({
      id: i.id,
      reference: i.reference,
      project_id: i.project,
      issued_at: i.issued_at,
      shipped_at: i.shipped_at,
      status: i.status,
    })),
    "bonurile de comparație",
  );

  const lines = [];
  for (const issue of ISSUES) {
    issue.lines.forEach((l, index) => {
      lines.push({
        // Id derivat din bon si pozitie, ca a doua rulare sa suprascrie exact
        // aceleasi randuri in loc sa dubleze totalul.
        id: `${issue.id.slice(0, 24)}${String(index + 1).padStart(2, "0")}${issue.id.slice(26)}`,
        outbound_issue_id: issue.id,
        product_id: byKey[l.product].id,
        quantity: l.quantity,
      });
    });
  }
  await upsert("outbound_lines", lines, "liniile bonurilor");

  console.log(
    `seed-comparison: 3 proiecte, 3 devize, ${DEVIZ_LINES.length} linii de deviz, ${ISSUES.length} bonuri, ${lines.length} linii de bon`,
  );
}

main().catch((err) => {
  console.error(`seed-comparison: ${err && err.message ? err.message : err}`);
  process.exit(1);
});
