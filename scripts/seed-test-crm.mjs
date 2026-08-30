#!/usr/bin/env node
// seed-test-crm.mjs
//
// Creeaza clientul si proiectul de test de care are nevoie suita, prin API-ul
// REST al Supabase. Ruleaza in CI dupa seed-test-accounts.mjs, pe aceeasi stiva
// locala.
//
// DE CE EXISTA, SI DE CE ABIA ACUM. Pana la cardul P3-04, destinatia unei iesiri
// era text liber: testul scria "TEST Client" si "TEST Proiect" in doua casute si
// nu trebuia sa existe nimic in baza. P3-04 face din destinatie o inregistrare
// reala si face selectorul OBLIGATORIU, deci formularul nu se mai poate completa
// intr-o baza goala. Un ecran care cere o alegere dintr-o lista are nevoie de
// lista.
//
// NU ESTE UN FISIER SEPARAT DIN COMODITATE. seed-test-accounts.mjs se numeste
// dupa ce face, si a-i adauga clienti si proiecte ar face numele sa minta.
//
// CONVENTIA DATELOR DE TEST ESTE CEA DIN seed-test-accounts.mjs, aplicata la
// litera:
//
//   Randurile sunt MARCATE LA CREARE cu prefixul TEST si NU SE STERG NICIODATA.
//   Nu exista niciun DELETE aici, si asta este deliberat: un DELETE scris pentru
//   o baza de test este un DELETE care intr-o zi ruleaza pe una reala.
//
//   ID-URILE SUNT FIXE, nu generate. Doua rulari nu au voie sa lase doua randuri
//   care arata la fel, pentru ca selectorul din formular cere EXACT o potrivire
//   si a doua ar face testul sa aleaga la intamplare intre ele. Un id fix face
//   scriptul idempotent prin constructie, nu prin noroc.
//
// Nicio valoare secreta nu este scrisa in jurnal.

const SUPABASE_URL = required("SUPABASE_URL");
const SERVICE_ROLE_KEY = required("SUPABASE_SERVICE_ROLE_KEY");

// Uuid-uri fixe, alese ca sa fie recunoscibile intr-un grid.
const CLIENT_ID = "7e57c11e-0000-4000-8000-000000000001";
const PROJECT_ID = "7e57c11e-0000-4000-8000-000000000002";

// Numele sunt cele pe care le cauta suita. Diacriticele sunt intentionate: ele
// exercita si cautarea fara diacritice din combobox, care este exact regula pe
// care o foloseste si backfill-ul din migratia 0017.
const CLIENT_NAME = "TEST Beneficiar E2E";
const PROJECT_NAME = "TEST Șantier E2E";

function required(name) {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    console.error(`seed-crm: variabila de mediu ${name} lipseste`);
    process.exit(2);
  }
  return v.trim();
}

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

async function upsert(table, row, label) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=id`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([row]),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`seed-crm: nu s-a putut scrie ${label}: ${res.status} ${text}`);
    process.exit(3);
  }
}

async function main() {
  await upsert(
    "clients",
    {
      id: CLIENT_ID,
      name: CLIENT_NAME,
      type: "company",
      // IDNO fix, ca sa nu se ciocneasca de indexul unic partial la a doua
      // rulare si sa nu semene cu unul real.
      fiscal_code: "1000000000000",
      active: true,
    },
    "clientul de test",
  );
  console.log(`seed-crm: client ${CLIENT_NAME} -> ${CLIENT_ID}`);

  await upsert(
    "projects",
    {
      id: PROJECT_ID,
      client_id: CLIENT_ID,
      name: PROJECT_NAME,
      // 'active' si nu 'closed': listSelectableProjects filtreaza proiectele
      // inchise, deci un proiect de test inchis ar fi invizibil in formular si
      // suita ar cadea pe o lista goala, ceea ce arata ca un defect de ecran.
      status: "active",
      active: true,
    },
    "proiectul de test",
  );
  console.log(`seed-crm: proiect ${PROJECT_NAME} -> ${PROJECT_ID}`);

  console.log("seed-crm: gata, 1 client si 1 proiect");
}

main().catch((err) => {
  console.error(`seed-crm: a esuat - ${err.message}`);
  process.exit(1);
});
