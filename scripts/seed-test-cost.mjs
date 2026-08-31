#!/usr/bin/env node
// seed-test-cost.mjs
//
// Datele fixe de care are nevoie tests/e2e/project-cost.spec.ts, cardul P3-11.
//
// DE CE UN FISIER SEPARAT SI NU O ADAUGARE LA seed-test-crm.mjs. Acel fisier se
// numeste dupa ce face, clientul si proiectul de care are nevoie selectorul de
// destinatie, iar a-i adauga iesiri si linii de iesire ar face numele sa minta.
// Regula este scrisa in capul lui si se aplica aici.
//
// DE CE NU PRIN INTERFATA. Cardul cere trei iesiri in DOUA LUNI DIFERITE, iar
// formularul de iesire nu are camp de data: issued_at este now(). Un test care
// ar construi datele prin ecran nu ar putea produce niciodata a doua luna, deci
// nu ar putea verifica defalcarea lunara, care este jumatate din card.
//
// CONVENTIA DATELOR DE TEST, la fel ca in celelalte doua scripturi de seed:
// randurile sunt marcate cu prefixul TEST, id-urile sunt FIXE si nu generate, si
// nu exista niciun DELETE aici. Un DELETE scris pentru o baza de test este un
// DELETE care intr-o zi ruleaza pe una reala.
//
// NUMERELE SUNT ALESE CA SA POATA FI CALCULATE DE MANA. Specul afirma un total
// la leu, iar un total pe care nimeni nu il poate verifica pe hartie nu este o
// acceptanta, este o amprenta.
//
//   produs        valoare   cantitate   valoare totala
//   TEST-COST-01   100.00     6            600.00
//   TEST-COST-02   250.00     2            500.00
//   TEST-COST-03    40.00    10            400.00   (produs DEZACTIVAT)
//   TEST-COST-04    10.00    35            350.00
//                                        --------
//                                         1850.00
//
//   iunie 2026   1400.00     (bonurile A si B)
//   iulie 2026    400.00     (bonul C)
//   august 2026    50.00     (bonul D, ora locala 00:30 pe 1 august)
//                --------
//                 1850.00
//
//   doar expediate: 1000.00 + 400.00 = 1400.00 (bonurile A si C)
//
// BONUL D EXISTA PENTRU FUSUL ORAR. 2026-07-31T21:30:00Z este 1 august 00:30 la
// Chisinau. Gruparea in UTC l-ar pune in iulie, gruparea corecta il pune in
// august, si asta este singura diferenta dintre cele doua reguli pe care un test
// o poate vedea.
//
// BONUL E NU ARE PROIECT. El nu are voie sa apara in niciun total pe proiect si
// trebuie sa se vada in numaratorul de iesiri neasociate.
//
// Nicio valoare secreta nu este scrisa in jurnal.

const SUPABASE_URL = required("SUPABASE_URL");
const SERVICE_ROLE_KEY = required("SUPABASE_SERVICE_ROLE_KEY");

const CLIENT_ID = "7e57c051-0000-4000-8000-000000000001";
const PROJECT_ID = "7e57c051-0000-4000-8000-000000000002";
const CLIENT_NAME = "TEST Beneficiar Cost";
const PROJECT_NAME = "TEST Cost Material P3-11";

const PRODUCTS = [
  { id: "7e57c051-0000-4000-8000-000000000101", sku: "TEST-COST-01", name: "TEST Cost Ciment", unit: "bag", unit_value_mdl: 100, active: true },
  { id: "7e57c051-0000-4000-8000-000000000102", sku: "TEST-COST-02", name: "TEST Cost Armătură", unit: "kg", unit_value_mdl: 250, active: true },
  { id: "7e57c051-0000-4000-8000-000000000103", sku: "TEST-COST-03", name: "TEST Cost Vopsea", unit: "pcs", unit_value_mdl: 40, active: false },
  { id: "7e57c051-0000-4000-8000-000000000104", sku: "TEST-COST-04", name: "TEST Cost Cărămidă", unit: "pcs", unit_value_mdl: 10, active: true },
];

const ISSUES = [
  {
    id: "7e57c051-0000-4000-8000-000000000201",
    reference: "IES-TEST-C001",
    issued_at: "2026-06-10T09:00:00+03:00",
    status: "shipped",
    shipped_at: "2026-06-11T09:00:00+03:00",
    project: true,
    lines: [
      { product: 0, quantity: 5 },
      { product: 1, quantity: 2 },
    ],
  },
  {
    id: "7e57c051-0000-4000-8000-000000000202",
    reference: "IES-TEST-C002",
    issued_at: "2026-06-25T09:00:00+03:00",
    status: "awaiting_shipment",
    shipped_at: null,
    project: true,
    lines: [{ product: 2, quantity: 10 }],
  },
  {
    id: "7e57c051-0000-4000-8000-000000000203",
    reference: "IES-TEST-C003",
    issued_at: "2026-07-03T09:00:00+03:00",
    status: "shipped",
    shipped_at: "2026-07-04T09:00:00+03:00",
    project: true,
    lines: [
      { product: 3, quantity: 30 },
      { product: 0, quantity: 1 },
    ],
  },
  {
    id: "7e57c051-0000-4000-8000-000000000204",
    reference: "IES-TEST-C004",
    issued_at: "2026-07-31T21:30:00Z",
    status: "awaiting_shipment",
    shipped_at: null,
    project: true,
    lines: [{ product: 3, quantity: 5 }],
  },
  {
    id: "7e57c051-0000-4000-8000-000000000205",
    reference: "IES-TEST-C005",
    issued_at: "2026-06-15T09:00:00+03:00",
    status: "awaiting_shipment",
    shipped_at: null,
    project: false,
    lines: [{ product: 0, quantity: 100 }],
  },
];

function required(name) {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    console.error(`seed-cost: variabila de mediu ${name} lipseste`);
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
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=id`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`seed-cost: nu s-a putut scrie ${label}: ${res.status} ${text}`);
    process.exit(3);
  }
}

async function firstCategoryId() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/categories?select=id&order=sort_order.asc&limit=1`, {
    headers,
  });
  const rows = res.ok ? await res.json() : [];
  if (!Array.isArray(rows) || rows.length === 0 || !rows[0]?.id) {
    // HALT PE O PREMISA FALSA, nu se inventeaza o categorie: migratia 0007 le
    // seamana, iar absenta lor inseamna ca stiva nu a fost migrata.
    console.error("seed-cost: nicio categorie in public.categories, migratia 0007 nu a rulat");
    process.exit(4);
  }
  return rows[0].id;
}

async function main() {
  const categoryId = await firstCategoryId();

  await upsert(
    "clients",
    [{ id: CLIENT_ID, name: CLIENT_NAME, type: "company", fiscal_code: "1000000000001", active: true }],
    "clientul de cost",
  );

  await upsert(
    "projects",
    [{ id: PROJECT_ID, client_id: CLIENT_ID, name: PROJECT_NAME, status: "active", active: true }],
    "proiectul de cost",
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
      unit_value_mdl: p.unit_value_mdl,
      active: p.active,
    })),
    "produsele de cost",
  );

  await upsert(
    "outbound_issues",
    ISSUES.map((i) => ({
      id: i.id,
      reference: i.reference,
      // Cele doua coloane de text liber sunt inca NOT NULL. Cardul P3-04b le
      // sterge; pana atunci seed-ul trebuie sa le dea o valoare.
      client_name: CLIENT_NAME,
      project_name: i.project ? PROJECT_NAME : "",
      project_id: i.project ? PROJECT_ID : null,
      issued_at: i.issued_at,
      shipped_at: i.shipped_at,
      status: i.status,
    })),
    "bonurile de cost",
  );

  const lines = [];
  for (const issue of ISSUES) {
    issue.lines.forEach((l, index) => {
      lines.push({
        // Id derivat din bon si pozitie, ca a doua rulare sa suprascrie exact
        // aceleasi randuri in loc sa dubleze totalul.
        id: `${issue.id.slice(0, 24)}${String(index + 1).padStart(2, "0")}${issue.id.slice(26)}`,
        outbound_issue_id: issue.id,
        product_id: PRODUCTS[l.product].id,
        quantity: l.quantity,
      });
    });
  }
  await upsert("outbound_lines", lines, "liniile de cost");

  console.log(
    `seed-cost: gata, 1 client, 1 proiect, ${PRODUCTS.length} produse, ${ISSUES.length} bonuri, ${lines.length} linii`,
  );
}

main().catch((err) => {
  console.error(`seed-cost: a esuat - ${err.message}`);
  process.exit(1);
});
