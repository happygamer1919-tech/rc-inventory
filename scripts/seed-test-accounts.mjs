#!/usr/bin/env node
// seed-test-accounts.mjs
//
// Creeaza cele doua conturi de test si randurile lor din public.profiles, prin
// API-ul de administrare Supabase. Ruleaza in CI, dupa ce stiva locala a pornit
// si migratiile au fost aplicate.
//
// CONVENTIA DATELOR DE TEST, ceruta de defaults-ul cardului P2-07:
//
//   Randurile create de suita sunt MARCATE LA CREARE si NU SE STERG NICIODATA.
//   Marcajul este prefixul TEST- din SKU-ul produsului si din numele lui, plus
//   domeniul .local al conturilor. Un om care se uita in baza vede dintr-o
//   privire ce este date de test si ce nu.
//
//   Curatenia MARCHEAZA, nu sterge. Nu exista niciun DELETE nicaieri in suita,
//   si asta este deliberat: un DELETE scris pentru o baza de test este un DELETE
//   care intr-o zi ruleaza pe una reala. Ecranul de inventar are filtrul de
//   vizibilitate care tine randurile de test deoparte fara sa le distruga.
//
//   ID-urile sunt DETERMINISTE prin email: acelasi email da acelasi cont la
//   fiecare rulare, deci scriptul este idempotent si poate rula de doua ori
//   fara sa strice nimic.
//
// Nicio valoare secreta nu este scrisa in jurnal. Pe stiva locala cheile sunt
// fixe si publice, dar scriptul se poarta cu ele la fel ca in productie, pentru
// ca acelasi cod nu trebuie sa aiba doua obiceiuri.

const SUPABASE_URL = required("SUPABASE_URL");
const SERVICE_ROLE_KEY = required("SUPABASE_SERVICE_ROLE_KEY");

// CRIT-17. Al treilea cont exista ca utilizator de autentificare si NU are rand
// in profiles, deliberat. Este singurul mod de a exercita bucla pe care cardul o
// repara: sesiunea este valida, profilul lipseste, si pana la CRIT-17 cererea
// sarea intre / si /autentificare pana cand browserul renunta. Un test care nu
// poate crea starea nu poate dovedi ca ea nu se mai intampla.
//
// noProfile: true inseamna "creeaza contul, nu-i scrie profilul". Nu este o
// omisiune si nu se repara.
const ACCOUNTS = [
  {
    email: required("TEST_OWNER_EMAIL"),
    password: required("TEST_OWNER_PASSWORD"),
    role: "owner",
    fullName: "Owner (test)",
  },
  {
    email: required("TEST_MANAGER_EMAIL"),
    password: required("TEST_MANAGER_PASSWORD"),
    role: "account_manager",
    fullName: "Account manager (test)",
  },
  {
    email: required("TEST_NO_PROFILE_EMAIL"),
    password: required("TEST_NO_PROFILE_PASSWORD"),
    noProfile: true,
    fullName: "Cont fara profil (test)",
  },
];

function required(name) {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    console.error(`seed: variabila de mediu ${name} lipseste`);
    process.exit(2);
  }
  return v.trim();
}

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

/** Cauta un utilizator dupa email. Intoarce id-ul sau null. */
async function findUser(email) {
  const url = `${SUPABASE_URL}/auth/v1/admin/users?per_page=200`;
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  const body = await res.json();
  const users = Array.isArray(body) ? body : (body.users ?? []);
  return users.find((u) => u.email === email)?.id ?? null;
}

async function createUser(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    // email_confirm sare peste confirmarea prin email: in CI nu exista cutie
    // postala, iar contul trebuie sa poata intra imediat.
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok && body.id) return body.id;

  // Deja existent: idempotenta cere sa il gasim, nu sa esuam.
  const existing = await findUser(email);
  if (existing) return existing;

  console.error(
    `seed: nu s-a putut crea contul ${email}: ${body.msg ?? body.message ?? res.status}`,
  );
  process.exit(3);
}

/** Insereaza sau actualizeaza randul din profiles, cu rolul scris explicit. */
async function upsertProfile(id, email, role, fullName) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=id`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ id, email, role, full_name: fullName, active: true }]),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`seed: nu s-a putut scrie profilul pentru ${email}: ${res.status} ${text}`);
    process.exit(4);
  }
}

/** Sterge randul din profiles, daca a ramas de la o rulare anterioara. */
async function deleteProfile(id, email) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { ...headers, Prefer: "return=minimal" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`seed: nu s-a putut sterge profilul pentru ${email}: ${res.status} ${text}`);
    process.exit(5);
  }
}

async function main() {
  for (const a of ACCOUNTS) {
    const id = await createUser(a.email, a.password);
    if (a.noProfile) {
      // Idempotenta merge in ambele sensuri: daca o rulare anterioara a lasat un
      // rand aici, contul nu ar mai fi fara profil si testul ar trece degeaba.
      await deleteProfile(id, a.email);
      console.log(`seed: ${a.email} -> ${id} (fara profil, deliberat)`);
      continue;
    }
    await upsertProfile(id, a.email, a.role, a.fullName);
    // Se afiseaza email, id si rol. Niciodata parola.
    console.log(`seed: ${a.email} -> ${id} (${a.role})`);
  }
  console.log(`seed: gata, ${ACCOUNTS.length} conturi`);
}

main().catch((err) => {
  console.error(`seed: a esuat - ${err.message}`);
  process.exit(1);
});
