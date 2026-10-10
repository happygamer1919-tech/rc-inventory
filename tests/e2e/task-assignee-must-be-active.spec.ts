import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { managerAccount } from "./support/accounts";

// task-assignee-must-be-active.spec - linia de acceptanta a cardului P3-259, gasit de
// verificarea de defecte din 2026-10-10.
//
// DEFECTUL. Politicile tasks_insert si tasks_update (migratia 0068) cer numai ca
// APELANTUL sa fie activ, iar cheia straina numai ca profilul responsabil sa EXISTE.
// Un coleg dezactivat exista in continuare, deci o cerere directa prin PostgREST
// putea aloca o sarcina cuiva care nu mai lucreaza aici. Migratia 0080 adauga
// declansatorul tasks_assignee_must_be_active.
//
// TOATE CAZURILE VORBESC DIRECT CU PostgREST, cu jetonul unui manager de cont: acela
// este drumul pe care formularul nu il poate apara, si declansatorul este singurul
// lucru care sta in calea lui. Refuzul serverului din lib/data/tasks-actions.ts spune
// aceeasi propozitie si este o refuzare mai devreme a aceluiasi lucru.
//
// DATELE DE TEST NU SE STERG NICIODATA, conventia P2-07: tabela nu are nici politica,
// nici drept de stergere. Tot ce se scrie este prefixat TEST si rulat pe stiva locala
// din CI.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const TAG = `TEST-P3259-${RUN}`;
const REFUSAL = "Colegul ales nu mai este activ. Alegeți alt responsabil.";

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "task-assignee-must-be-active.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL, " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY si SUPABASE_SERVICE_ROLE_KEY. In CI sunt exportate de " +
        "pasul 'Export local Supabase credentials'.",
    );
  }
  return { origin: new URL(url).origin, anon, service };
}

function serviceHeaders() {
  return { apikey: env().service, Authorization: `Bearer ${env().service}` };
}

function userHeaders(token: string) {
  return { apikey: env().anon, Authorization: `Bearer ${token}` };
}

async function accessToken(email: string, password: string): Promise<string> {
  const response = await fetch(`${env().origin}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env().anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string };
  if (!response.ok || !body.access_token) {
    throw new Error(`autentificarea API a raspuns ${response.status}`);
  }
  return body.access_token;
}

type Rest = { status: number; ok: boolean; rows: Record<string, unknown>[]; text: string };

async function rest(
  path: string,
  headers: Record<string, string>,
  init: { method?: string; body?: unknown } = {},
): Promise<Rest> {
  const response = await fetch(`${env().origin}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text().catch(() => "");
  let rows: Record<string, unknown>[] = [];
  try {
    const parsed = JSON.parse(text);
    rows = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    rows = [];
  }
  return { status: response.status, ok: response.ok, rows, text };
}

/** Un coleg nou, cu profil activ. Conturile comune de test nu se dezactiveaza
 *  niciodata, fiindca alte specificatii se autentifica cu ele. */
async function newColleague(label: string): Promise<string> {
  const email = `p3-259-${label}-${RUN}-${randomUUID().slice(0, 8)}@rc-inventory.local`;
  const created = await fetch(`${env().origin}/auth/v1/admin/users`, {
    method: "POST",
    headers: { ...serviceHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: `p3-259-${randomUUID()}`, email_confirm: true }),
  });
  const body = (await created.json().catch(() => ({}))) as { id?: string };
  expect(created.ok && Boolean(body.id), "contul de test nu a putut fi creat").toBe(true);
  const id = String(body.id);

  const profile = await rest("profiles?on_conflict=id", serviceHeaders(), {
    method: "POST",
    body: [{ id, email, role: "account_manager", full_name: `Coleg ${label} ${TAG}`, active: true }],
  });
  expect(profile.ok, `profilul contului de test nu a putut fi scris: ${profile.text}`).toBe(true);
  return id;
}

async function deactivate(id: string): Promise<void> {
  const off = await rest(`profiles?id=eq.${id}`, serviceHeaders(), {
    method: "PATCH",
    body: { active: false },
  });
  expect(off.ok, `profilul nu a putut fi dezactivat: ${off.text}`).toBe(true);
}

let managerToken = "";

const insertTask = (row: Record<string, unknown>) =>
  rest("tasks?select=id,title,assignee_id", userHeaders(managerToken), { method: "POST", body: row });

const patchTask = (id: string, body: Record<string, unknown>) =>
  rest(`tasks?id=eq.${id}&select=id,title,assignee_id`, userHeaders(managerToken), {
    method: "PATCH",
    body,
  });

const readTask = async (id: string) =>
  (await rest(`tasks?select=id,title,assignee_id&id=eq.${id}`, userHeaders(managerToken))).rows[0];

test.beforeAll(async () => {
  const account = managerAccount();
  managerToken = await accessToken(account.email, account.password);
});

test("P3-259: o sarcina scrisa direct cu un responsabil dezactivat este refuzata", async () => {
  const former = await newColleague("plecat");
  await deactivate(former);

  const title = `${TAG} alocata unui coleg plecat`;
  const refused = await insertTask({ title, assignee_id: former });
  expect(refused.ok, `insertul a trecut: ${refused.status} ${refused.text}`).toBe(false);
  expect(refused.rows[0]?.message, "propozitia romaneasca a declansatorului").toBe(REFUSAL);

  // SI NU A RAMAS NICIUN RAND.
  const found = await rest(
    `tasks?select=id&title=eq.${encodeURIComponent(title)}`,
    userHeaders(managerToken),
  );
  expect(found.rows, "niciun rand scris").toEqual([]);
});

test("P3-259: mutarea directa a unei sarcini pe un coleg dezactivat este refuzata", async () => {
  const active = await newColleague("activ");
  const former = await newColleague("plecat-mutare");
  await deactivate(former);

  const created = await insertTask({ title: `${TAG} de mutat`, assignee_id: active });
  expect(created.ok, `sarcina de test nu a putut fi scrisa: ${created.text}`).toBe(true);
  const taskId = String(created.rows[0]!.id);

  const refused = await patchTask(taskId, { assignee_id: former });
  expect(refused.ok, `mutarea a trecut: ${refused.status} ${refused.text}`).toBe(false);
  expect(refused.rows[0]?.message, "propozitia romaneasca a declansatorului").toBe(REFUSAL);

  // Responsabilul a ramas cel activ.
  expect((await readTask(taskId))?.assignee_id).toBe(active);
});

test("P3-259: alocarea unui coleg activ merge, la scriere si la mutare", async () => {
  const first = await newColleague("activ-unu");
  const second = await newColleague("activ-doi");

  const created = await insertTask({ title: `${TAG} alocata activ`, assignee_id: first });
  expect(created.ok, `scrierea cu un coleg activ a cazut: ${created.status} ${created.text}`).toBe(true);
  const taskId = String(created.rows[0]!.id);
  expect(created.rows[0]!.assignee_id).toBe(first);

  const moved = await patchTask(taskId, { assignee_id: second });
  expect(moved.ok, `mutarea pe un coleg activ a cazut: ${moved.status} ${moved.text}`).toBe(true);
  expect(moved.rows[0]?.assignee_id).toBe(second);

  // Scoaterea responsabilului ramane permisa.
  const cleared = await patchTask(taskId, { assignee_id: null });
  expect(cleared.ok, `scoaterea responsabilului a cazut: ${cleared.text}`).toBe(true);
  expect(cleared.rows[0]?.assignee_id).toBeNull();
});

test("P3-259: o sarcina al carei responsabil a fost dezactivat mai tarziu se poate modifica", async () => {
  const later = await newColleague("dezactivat-ulterior");

  const created = await insertTask({ title: `${TAG} veche`, assignee_id: later });
  expect(created.ok, `sarcina de test nu a putut fi scrisa: ${created.text}`).toBe(true);
  const taskId = String(created.rows[0]!.id);

  await deactivate(later);

  // Numai titlul.
  const renamed = await patchTask(taskId, { title: `${TAG} veche redenumita` });
  expect(renamed.ok, `modificarea titlului a cazut: ${renamed.status} ${renamed.text}`).toBe(true);
  expect(renamed.rows[0]?.title).toBe(`${TAG} veche redenumita`);
  expect(renamed.rows[0]?.assignee_id, "responsabilul ramane").toBe(later);

  // Si cu responsabilul trimis neschimbat, cum il trimite un formular vechi.
  const resent = await patchTask(taskId, { title: `${TAG} veche iar`, assignee_id: later });
  expect(resent.ok, `responsabilul neschimbat a fost refuzat: ${resent.status} ${resent.text}`).toBe(true);
  expect(resent.rows[0]?.assignee_id).toBe(later);
});
