import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { ownerAccount, type TestAccount } from "./support/accounts";

// active-profile-table-reads.spec - linia de acceptanta a cardului P3-81, goal
// G32: citirea unui client, a unui proiect sau a unui document, si adaugarea unui
// fisier nou in rc-docs, cer un profil ACTIV, nu doar o sesiune.
//
// Cazul cardului, pe un singur cont nou, cu propriul token:
//   1. MARTORUL: cat timp profilul este activ, tokenul citeste direct din API-ul
//      bazei de date clientul, proiectul si documentul create de administrator,
//      si incarca un fisier nou in rc-docs;
//   2. dupa ce profilul devine active = false, ACELASI token citeste cele trei
//      tabele cu HTTP 200 si o lista goala (securitatea pe rand filtreaza, nu da
//      eroare), iar o incarcare noua in rc-docs este refuzata (HTTP 400 sau mai
//      mult) si niciun obiect nu este scris;
//   3. administratorul citeste in continuare aceleasi randuri.
//
// DE CE DIRECT LA API, nu prin ecrane. proxy.ts intoarce deja un cont dezactivat
// de la fiecare ecran al aplicatiei, iar din 0050 nici nu mai poate citi un fisier
// stocat. Gaura ramasa, raportata de P3-70, era dedesubt: clients_select,
// projects_select si documents_select erau using (true), iar rc_docs_insert cerea
// doar o sesiune. Acest caz este dovada, pe o stiva Supabase reala, a politicilor
// din 0055.
//
// CONTUL ESTE NOU LA FIECARE RULARE, creat cu cheia service_role a stivei LOCALE.
// Conturile comune de test nu se dezactiveaza niciodata: alte specificatii se
// autentifica cu ele. Parola este aleasa la rulare si nu se scrie nicaieri. Nimic
// nu se sterge: contul ramane dezactivat, conform conventiei P2-07.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "active-profile-table-reads.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY si " +
        "SUPABASE_SERVICE_ROLE_KEY. In CI sunt exportate de pasul 'Export local Supabase credentials'. " +
        "Local: supabase status -o env.",
    );
  }
  return { origin: new URL(url).origin, anon, service };
}

function serviceHeaders() {
  const { service } = env();
  return { apikey: service, Authorization: `Bearer ${service}` };
}

function userHeaders(token: string) {
  return { apikey: env().anon, Authorization: `Bearer ${token}` };
}

/* ---------------------------------------------------------------- conturi -- */

type SecondAccount = TestAccount & { id: string };

/** Un cont nou, cu profil activ de operator, in stiva locala. */
async function createSecondAccount(): Promise<SecondAccount> {
  const { origin } = env();
  const email = `p3-81-${RUN}-${randomUUID().slice(0, 8)}@rc-inventory.local`;
  const password = `p3-81-${randomUUID()}`;

  const created = await fetch(`${origin}/auth/v1/admin/users`, {
    method: "POST",
    headers: { ...serviceHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = (await created.json().catch(() => ({}))) as { id?: string };
  if (!created.ok || !body.id) throw new Error(`contul de test nu a putut fi creat: ${created.status}`);

  const profile = await fetch(`${origin}/rest/v1/profiles?on_conflict=id`, {
    method: "POST",
    headers: {
      ...serviceHeaders(),
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify([
      { id: body.id, email, role: "account_manager", full_name: "Test P3-81", active: true },
    ]),
  });
  if (!profile.ok) throw new Error(`profilul contului de test nu a putut fi scris: ${profile.status}`);

  return { id: body.id, email, password, label: "operator P3-81" };
}

async function setProfileActive(id: string, active: boolean): Promise<void> {
  const response = await fetch(`${env().origin}/rest/v1/profiles?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...serviceHeaders(), "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ active }),
  });
  if (!response.ok) throw new Error(`profilul ${id} nu a putut fi schimbat: ${response.status}`);
}

/** Tokenul de acces al unui cont, exact cel pe care il are un browser autentificat. */
async function accessToken(account: TestAccount): Promise<string> {
  const { origin, anon } = env();
  const response = await fetch(`${origin}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string };
  if (!response.ok || !body.access_token) throw new Error(`autentificarea API a raspuns ${response.status}`);
  return body.access_token;
}

/* ------------------------------------------------ API-ul bazei de date -- */

/** Un rand nou, scris de administrator cu propriul token, ca din aplicatie. */
async function insertAsOwner(ownerToken: string, table: string, row: Record<string, unknown>): Promise<string> {
  const response = await fetch(`${env().origin}/rest/v1/${table}?select=id`, {
    method: "POST",
    headers: { ...userHeaders(ownerToken), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  const rows = (await response.json().catch(() => [])) as Array<{ id?: string }>;
  const id = rows[0]?.id;
  if (!response.ok || !id) throw new Error(`${table}: administratorul nu a putut scrie randul: ${response.status}`);
  return id;
}

/** Citirea directa a unui rand, pe langa aplicatie, cu un token dat. */
async function readRow(token: string, table: string, id: string): Promise<{ status: number; rows: unknown[] }> {
  const response = await fetch(`${env().origin}/rest/v1/${table}?select=id&id=eq.${id}`, {
    headers: userHeaders(token),
  });
  const rows = (await response.json().catch(() => null)) as unknown;
  return { status: response.status, rows: Array.isArray(rows) ? rows : [] };
}

/* ---------------------------------------------------- API-ul de stocare -- */

function pdf(totalBytes = 128): Buffer {
  const head = Buffer.from("%PDF-1.4\n% active-profile-table-reads.spec\n");
  return Buffer.concat([head, Buffer.alloc(Math.max(0, totalBytes - head.length), 0x20)]);
}

/** Incarcarea unui fisier nou in rc-docs, pe langa aplicatie, cu un token dat. */
async function uploadAtStorage(token: string, path: string): Promise<number> {
  const response = await fetch(`${env().origin}/storage/v1/object/rc-docs/${path}`, {
    method: "POST",
    headers: { ...userHeaders(token), "Content-Type": "application/pdf", "x-upsert": "false" },
    body: new Uint8Array(pdf()),
  });
  await response.arrayBuffer().catch(() => undefined);
  return response.status;
}

/** Numele obiectelor aflate sub un prefix din rc-docs, citite cu cheia service_role. */
async function storedNames(prefix: string): Promise<string[]> {
  const response = await fetch(`${env().origin}/storage/v1/object/list/rc-docs`, {
    method: "POST",
    headers: { ...serviceHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit: 100 }),
  });
  if (!response.ok) throw new Error(`lista din rc-docs a raspuns ${response.status}`);
  const entries = (await response.json()) as Array<{ name: string }>;
  return entries.map((e) => e.name);
}

/* ----------------------------------------------------------------- cazul -- */

const TABLES = ["clients", "projects", "documents"] as const;

test.describe("Citirea clientilor, proiectelor si documentelor cere un profil activ", () => {
  test.setTimeout(120_000);

  test("un cont dezactivat nu mai citește rânduri și nu mai încarcă fișiere, cu același token", async () => {
    // Randurile de test, scrise de administrator.
    const ownerToken = await accessToken(ownerAccount());
    const clientId = await insertAsOwner(ownerToken, "clients", { name: `TEST Citire Activa ${RUN}` });
    const projectId = await insertAsOwner(ownerToken, "projects", {
      client_id: clientId,
      name: `TEST Santier Citire Activa ${RUN}`,
    });
    const documentId = await insertAsOwner(ownerToken, "documents", {
      client_id: clientId,
      storage_path: `client/${clientId}/${randomUUID()}.pdf`,
      original_name: `Contract Citire Activa ${RUN}.pdf`,
      mime_type: "application/pdf",
      size_bytes: 128,
      kind: "contract",
    });
    const ids: Record<(typeof TABLES)[number], string> = {
      clients: clientId,
      projects: projectId,
      documents: documentId,
    };

    const second = await createSecondAccount();
    const token = await accessToken(second);
    const prefix = `client/${clientId}`;

    // 1. MARTORUL: profil activ, tokenul citeste cele trei randuri si incarca.
    for (const table of TABLES) {
      const read = await readRow(token, table, ids[table]);
      expect(read.status, `profil activ: ${table} raspunde 200`).toBe(200);
      expect(read.rows, `profil activ: ${table} intoarce randul administratorului`).toHaveLength(1);
    }
    const activeName = `${randomUUID()}.pdf`;
    const activeUpload = await uploadAtStorage(token, `${prefix}/${activeName}`);
    expect(activeUpload, "profil activ: stocarea primeste fisierul").toBe(200);
    expect(await storedNames(prefix), "profil activ: fisierul este scris").toContain(activeName);

    // Administratorul dezactiveaza contul. Tokenul ramane valid pana expira.
    await setProfileActive(second.id, false);

    // 2. ACELASI TOKEN: 200 si lista goala pe fiecare tabel, refuz la incarcare.
    for (const table of TABLES) {
      const read = await readRow(token, table, ids[table]);
      expect(read.status, `profil dezactivat: ${table} raspunde tot 200, securitatea pe rand filtreaza`).toBe(200);
      expect(read.rows, `profil dezactivat: ${table} nu mai intoarce niciun rand`).toEqual([]);
    }
    const inactiveName = `${randomUUID()}.pdf`;
    const inactiveUpload = await uploadAtStorage(token, `${prefix}/${inactiveName}`);
    expect(inactiveUpload, "profil dezactivat: stocarea refuza fisierul").toBeGreaterThanOrEqual(400);
    expect(await storedNames(prefix), "profil dezactivat: niciun fisier scris").not.toContain(inactiveName);

    // 3. Administratorul citeste in continuare aceleasi randuri.
    for (const table of TABLES) {
      const read = await readRow(ownerToken, table, ids[table]);
      expect(read.status).toBe(200);
      expect(read.rows, `administratorul citeste in continuare ${table}`).toHaveLength(1);
    }
  });
});
