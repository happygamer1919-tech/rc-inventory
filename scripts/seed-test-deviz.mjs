#!/usr/bin/env node
// seed-test-deviz.mjs
//
// Datele fixe de care are nevoie tests/e2e/deviz.spec.ts, cardul P3-13b.
//
// DE CE UN FISIER SEPARAT. Aceeasi regula ca la seed-test-cost.mjs: fiecare
// script de seed se numeste dupa ce face, iar a adauga devize intr-un fisier
// numit "cost" ar face numele sa minta. Regula este scrisa in capul acelui
// fisier si se aplica si aici.
//
// CE NU SE POATE CONSTRUI PRIN ECRAN, si de asta exista fisierul:
//
//   1. UN DEVIZ CARE NU MAI ESTE CIORNA, cu linii pe el. Declansatorul
//      deviz_lines_require_draft din migratia 0025 refuza orice inserare de
//      linie pe un deviz iesit din ciorna, deci prin ecran ordinea corecta ar
//      fi linii apoi emitere, ceea ce specul face oricum intr-un caz. Randul
//      seed-uit este cel pe care specul incearca sa il modifice ca sa vada
//      REFUZUL VENIND DIN BAZA, si el trebuie sa existe inainte ca ecranul sa
//      fie deschis.
//
//   2. UN DEVIZ EMIS A CARUI VALABILITATE A TRECUT. valid_until este o data in
//      trecut si nu exista camp prin care ecranul sa o poata scrie in trecut
//      pe un deviz deja emis: dupa emitere antetul este inghetat.
//
//   3. CAZUL NUMIT DE ADDENDUM: UN DEVIZ OFERTAT IN MARTIE, CITIT IN IUNIE.
//      Pretul inghetat pe linie este cel din martie, catalogul de azi arata
//      altceva, iar diferenta dintre ele este exact ce verifica specul. Prin
//      ecran acest caz ar dura trei luni.
//
// CONVENTIA, la fel ca in celelalte scripturi de seed: randuri marcate TEST,
// id-uri FIXE si nu generate, si NICIUN DELETE. Un DELETE scris pentru o baza de
// test este un DELETE care intr-o zi ruleaza pe una reala.
//
// ARITMETICA, SCRISA CA SA POATA FI VERIFICATA DE MANA. Specul o repeta, ca
// amandoua sa poata fi citite fara sa fie deschis celalalt fisier.
//
//   DEVIZUL DIN MARTIE, versiunea 1, EMIS, adaos 10%
//     TEST-DEVIZ-01   pret ofertat 100.00   cantitate 4   =   400.00
//     TEST-DEVIZ-02   pret ofertat  50.00   cantitate 6   =   300.00
//                                              subtotal      700.00
//                                              adaos 10%      70.00
//                                              total         770.00
//
//   CATALOGUL DE AZI, si aici este toata poanta cardului:
//     TEST-DEVIZ-01   pret curent 130.00   diferenta  +30.00
//     TEST-DEVIZ-02   pret curent  45.00   diferenta   -5.00
//     TEST-DEVIZ-03   pret curent  20.00   (neofertat, exista pentru adaugare)
//
//   Devizul afiseaza in continuare 100.00 si 50.00, si totalul ramane 770.00.
//
// Nicio valoare secreta nu este scrisa in jurnal.

const SUPABASE_URL = required("SUPABASE_URL");
const SERVICE_ROLE_KEY = required("SUPABASE_SERVICE_ROLE_KEY");

const CLIENT_ID = "7e57c051-0000-4000-8000-000000000301";
const PROJECT_ID = "7e57c051-0000-4000-8000-000000000302";
const PROJECT_EMPTY_ID = "7e57c051-0000-4000-8000-000000000303";
const DEVIZ_MARCH_ID = "7e57c051-0000-4000-8000-000000000401";
const DEVIZ_EXPIRED_ID = "7e57c051-0000-4000-8000-000000000402";

const CLIENT_NAME = "TEST Beneficiar Deviz";
const PROJECT_NAME = "TEST Deviz P3-13b";
const PROJECT_EMPTY_NAME = "TEST Deviz fara estimare";

const PRODUCTS = [
  { id: "7e57c051-0000-4000-8000-000000000311", sku: "TEST-DEVIZ-01", name: "TEST Deviz Ciment", unit: "bag", quoted: 100, current: 130 },
  { id: "7e57c051-0000-4000-8000-000000000312", sku: "TEST-DEVIZ-02", name: "TEST Deviz Nisip", unit: "kg", quoted: 50, current: 45 },
  { id: "7e57c051-0000-4000-8000-000000000313", sku: "TEST-DEVIZ-03", name: "TEST Deviz Cărămidă", unit: "pcs", quoted: null, current: 20 },
];

function required(name) {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    console.error(`seed-deviz: variabila de mediu ${name} lipseste`);
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
    console.error(`seed-deviz: nu s-a putut scrie ${label}: ${res.status} ${text}`);
    process.exit(3);
  }
}

async function firstCategoryId() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/categories?select=id&order=sort_order.asc&limit=1`,
    { headers },
  );
  const rows = res.ok ? await res.json() : [];
  if (!Array.isArray(rows) || rows.length === 0 || !rows[0]?.id) {
    // HALT PE O PREMISA FALSA, nu se inventeaza o categorie.
    console.error("seed-deviz: nicio categorie in public.categories, migratia 0007 nu a rulat");
    process.exit(4);
  }
  return rows[0].id;
}

async function main() {
  const categoryId = await firstCategoryId();

  await upsert(
    "clients",
    [{ id: CLIENT_ID, name: CLIENT_NAME, type: "company", fiscal_code: "1000000000003", active: true }],
    "clientul de deviz",
  );

  await upsert(
    "projects",
    [
      { id: PROJECT_ID, client_id: CLIENT_ID, name: PROJECT_NAME, status: "active", active: true },
      { id: PROJECT_EMPTY_ID, client_id: CLIENT_ID, name: PROJECT_EMPTY_NAME, status: "lead", active: true },
    ],
    "proiectele de deviz",
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
      // VALOAREA DE AZI. Pretul ofertat NU se scrie de aici pe produs: el se
      // scrie pe linia de deviz, mai jos, si tocmai divergenta dintre cele doua
      // este ce verifica specul.
      unit_value_mdl: p.current,
      active: true,
    })),
    "produsele de deviz",
  );

  // ORDINEA CONTEAZA SI ESTE OBLIGATORIE. Liniile se scriu cat timp devizul este
  // inca ciorna, pentru ca deviz_lines_require_draft refuza inserarea pe orice
  // altceva. Emiterea vine pe urma, ca un UPDATE separat: exact drumul pe care
  // il face si un om prin ecran.
  await upsert(
    "devize",
    [
      {
        id: DEVIZ_MARCH_ID,
        project_id: PROJECT_ID,
        name: "TEST Ofertă martie",
        version: 1,
        status: "draft",
        margin_percent: 10,
        valid_until: "2026-04-30",
        created_at: "2026-03-15T09:00:00+02:00",
      },
      {
        id: DEVIZ_EXPIRED_ID,
        project_id: PROJECT_EMPTY_ID,
        name: "TEST Ofertă expirată",
        version: 1,
        status: "draft",
        margin_percent: 0,
        valid_until: "2026-05-31",
        created_at: "2026-05-01T09:00:00+03:00",
      },
    ],
    "devizele",
  );

  await upsert(
    "deviz_lines",
    [
      {
        id: "7e57c051-0000-4000-8000-000000000411",
        deviz_id: DEVIZ_MARCH_ID,
        product_id: PRODUCTS[0].id,
        quantity: 4,
        unit_price_mdl: PRODUCTS[0].quoted,
        sort_order: 1,
      },
      {
        id: "7e57c051-0000-4000-8000-000000000412",
        deviz_id: DEVIZ_MARCH_ID,
        product_id: PRODUCTS[1].id,
        quantity: 6,
        unit_price_mdl: PRODUCTS[1].quoted,
        sort_order: 2,
      },
    ],
    "liniile devizului din martie",
  );

  // ACUM SE EMIT, dupa ce liniile exista. De aici incolo baza refuza orice
  // modificare pe ele, si asta este ce verifica specul.
  await upsert(
    "devize",
    [
      { id: DEVIZ_MARCH_ID, project_id: PROJECT_ID, version: 1, status: "sent" },
      { id: DEVIZ_EXPIRED_ID, project_id: PROJECT_EMPTY_ID, version: 1, status: "sent" },
    ],
    "emiterea devizelor",
  );

  console.log("seed-deviz: gata");
}

main().catch((err) => {
  console.error(`seed-deviz: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
