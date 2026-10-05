import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  assigneeChoices,
  assigneeLabel,
  teamNameLookup,
  toTask,
  type TaskRow,
  type TeamMember,
} from "@/lib/data/tasks-map";
import { managerAccount, ownerAccount, type TestAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// task-assignee-names.spec - linia de acceptanta a cardului P3-156: un manager de
// cont vede cine raspunde de fiecare sarcina si poate aloca o sarcina oricarui coleg
// activ.
//
// DOUA JUMATATI. Primele doua cazuri sunt pure si nu ating baza: dovedesc ca citirea
// sarcinilor ia numele din lista echipei si ca "Nealocata" se scrie numai cand nu
// raspunde nimeni. Ultimele doua au nevoie de o stiva Supabase reala (migratia 0072,
// jetoane adevarate) si ruleaza numai in CI.
//
// DATELE DE TEST NU SE STERG, conventia P2-07: conturile raman, sarcinile se anuleaza.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const TAG = `TEST-P3156-${RUN}`;

/* ------------------------------------------------------- cazuri pure -- */

const ROW: TaskRow = {
  id: "t1",
  title: "O sarcina",
  description: null,
  status: "todo",
  priority: "medium",
  due_date: null,
  assignee_id: "u-coleg",
  entity_type: null,
  entity_id: null,
  created_by: null,
  created_at: "2035-01-01T00:00:00Z",
  updated_at: "2035-01-01T00:00:00Z",
  // Imbinarea cu profilul vine null pentru un manager: politica profiles_select.
  assignee: null,
};

const TEAM: TeamMember[] = [
  { id: "u-coleg", displayName: "Coleg Activ", active: true },
  { id: "u-vechi", displayName: "Fost Coleg", active: false },
  { id: "u-fara-nume", displayName: null, active: true },
  { id: "u-ana", displayName: "Ana Activa", active: true },
];

test("responsabil: citirea sarcinii ia numele din lista echipei, nu din imbinarea cu profilul", () => {
  const names = teamNameLookup(TEAM);

  const task = toTask(ROW, names);
  expect(task.assigneeId).toBe("u-coleg");
  expect(task.assigneeName, "numele vine din lista echipei").toBe("Coleg Activ");
  expect(assigneeLabel(task)).toBe("Coleg Activ");

  // Un responsabil dezactivat ramane responsabilul sarcinii si isi pastreaza numele.
  const former = toTask({ ...ROW, assignee_id: "u-vechi" }, names);
  expect(former.assigneeName).toBe("Fost Coleg");

  // Rezerva: lista echipei lipseste (migratia nu este inca aplicata), imbinarea cu
  // profilul este singura sursa, ca inainte.
  const fallback = toTask(
    { ...ROW, assignee: { id: "u-coleg", full_name: "Nume din profil" } },
    teamNameLookup([]),
  );
  expect(fallback.assigneeName).toBe("Nume din profil");

  // Selectorul ofera numai colegii activi, alfabetic, si nu pe cei dezactivati.
  expect(assigneeChoices(TEAM).map((c) => c.fullName)).toEqual([
    "Ana Activa",
    "Coleg Activ",
    "Fără nume",
  ]);
});

test("responsabil: Nealocata se arata numai cand nu raspunde nimeni de sarcina", () => {
  const names = teamNameLookup(TEAM);

  const unassigned = toTask({ ...ROW, assignee_id: null }, names);
  expect(unassigned.assigneeId).toBeNull();
  expect(unassigned.assigneeName).toBeNull();
  expect(assigneeLabel(unassigned)).toBe("Nealocată");

  // Un responsabil al carui nume nu se cunoaste NU este "Nealocata".
  const nameless = toTask({ ...ROW, assignee_id: "u-necunoscut" }, names);
  expect(nameless.assigneeName).toBeNull();
  expect(assigneeLabel(nameless)).toBe("Fără nume");
  expect(assigneeLabel(nameless)).not.toBe("Nealocată");
});

/* ------------------------------------------ cazuri pe stiva reala (CI) -- */

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "task-assignee-names.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY " +
        "si SUPABASE_SERVICE_ROLE_KEY. In CI sunt exportate de pasul 'Export local Supabase credentials'.",
    );
  }
  return { origin: new URL(url).origin, anon, service };
}

const serviceHeaders = () => ({ apikey: env().service, Authorization: `Bearer ${env().service}` });
const userHeaders = (token: string) => ({ apikey: env().anon, Authorization: `Bearer ${token}` });

async function accessToken(account: TestAccount): Promise<string> {
  const response = await fetch(`${env().origin}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env().anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string };
  if (!response.ok || !body.access_token) throw new Error(`autentificarea API a raspuns ${response.status}`);
  return body.access_token;
}

/** Un cont nou, cu profil de manager si un nume cunoscut, care poate fi dezactivat fara
 *  sa atinga conturile comune de test. */
async function newAccount(fullName: string): Promise<{ id: string; account: TestAccount }> {
  const email = `p3-156-${RUN}-${randomUUID().slice(0, 8)}@rc-inventory.local`;
  const password = `p3-156-${randomUUID()}`;
  const created = await fetch(`${env().origin}/auth/v1/admin/users`, {
    method: "POST",
    headers: { ...serviceHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = (await created.json().catch(() => ({}))) as { id?: string };
  expect(created.ok && Boolean(body.id), "contul de test nu a putut fi creat").toBe(true);
  const id = String(body.id);

  const profile = await fetch(`${env().origin}/rest/v1/profiles?on_conflict=id`, {
    method: "POST",
    headers: {
      ...serviceHeaders(),
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify([{ id, email, role: "account_manager", full_name: fullName, active: true }]),
  });
  expect(profile.ok, `profilul contului de test nu a putut fi scris: ${profile.status}`).toBe(true);
  return { id, account: { email, password, label: fullName } };
}

async function teamAs(token: string): Promise<{ status: number; rows: Record<string, unknown>[] }> {
  const response = await fetch(`${env().origin}/rest/v1/rpc/list_team_members`, {
    method: "POST",
    headers: { ...userHeaders(token), "Content-Type": "application/json" },
    body: "{}",
  });
  const parsed = (await response.json().catch(() => null)) as unknown;
  return { status: response.status, rows: Array.isArray(parsed) ? parsed : [] };
}

test("responsabil: un manager de cont vede numele unui coleg pe sarcina si il poate alege in Responsabil", async ({
  page,
}) => {
  test.setTimeout(300_000);

  const colleague = await newAccount(`Coleg ${TAG}`);
  const managerToken = await accessToken(managerAccount());

  // Lista echipei, cu jetonul managerului: colegul apare cu numele, activ, iar randul
  // are numai cele trei coloane (nici email, nici rol).
  const team = await teamAs(managerToken);
  expect(team.status).toBe(200);
  const mine = team.rows.find((r) => r.id === colleague.id);
  expect(mine, "managerul vede un coleg in lista echipei").toBeDefined();
  expect(mine!.display_name).toBe(`Coleg ${TAG}`);
  expect(mine!.active).toBe(true);
  expect(Object.keys(mine!).sort(), "numai id, nume si activ").toEqual(["active", "display_name", "id"]);

  // O sarcina alocata colegului, scrisa de manager, cu termen unic ca sa fie singura
  // pe lista filtrata.
  const title = `${TAG} sarcina alocata`;
  const created = await fetch(`${env().origin}/rest/v1/tasks?select=id`, {
    method: "POST",
    headers: { ...userHeaders(managerToken), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ title, due_date: "2036-03-14", assignee_id: colleague.id }),
  });
  const rows = (await created.json().catch(() => [])) as Array<{ id?: string }>;
  expect(created.ok && Boolean(rows[0]?.id), `sarcina de test nu a putut fi scrisa: ${created.status}`).toBe(true);
  const taskId = String(rows[0]!.id);

  await signIn(page, managerAccount());
  await page.goto("/sarcini?de_la=2036-03-14&pana_la=2036-03-14");
  await expect(page.getByTestId("tasks-filters")).toBeVisible({ timeout: 30_000 });

  const row = page.locator(`[data-testid="task-row"][data-id="${taskId}"]`);
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  await expect(row.getByTestId("task-assignee"), "numele colegului, nu Nealocată").toHaveText(
    `Coleg ${TAG}`,
  );

  // Formularul de modificare: colegul este ales, nu inactiv, iar lista il ofera.
  await row.getByTestId("task-edit").click();
  const picker = page.getByTestId("field-task-assignee");
  await expect(picker).toBeVisible();
  await expect(picker).toHaveValue(colleague.id);
  await expect(picker.locator("option", { hasText: `Coleg ${TAG}` })).toHaveCount(1);
  await expect(picker.locator("option", { hasText: "(inactiv)" })).toHaveCount(0);
});

test("responsabil: un cont dezactivat nu primeste lista echipei", async () => {
  test.setTimeout(120_000);

  const account = await newAccount(`Dezactivat ${TAG}`);
  const token = await accessToken(account.account);

  // MARTORUL: cat timp contul este activ, lista are randuri.
  const before = await teamAs(token);
  expect(before.status).toBe(200);
  expect(before.rows.length, "un cont activ primeste lista echipei").toBeGreaterThan(0);

  const off = await fetch(`${env().origin}/rest/v1/profiles?id=eq.${account.id}`, {
    method: "PATCH",
    headers: { ...serviceHeaders(), "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ active: false }),
  });
  expect(off.ok, `profilul nu a putut fi dezactivat: ${off.status}`).toBe(true);

  // ACELASI JETON, dupa dezactivare: nicio linie.
  const after = await teamAs(token);
  expect(after.rows, "un cont dezactivat nu primeste lista echipei").toHaveLength(0);

  // Administratorul isi pastreaza lista.
  const owner = await teamAs(await accessToken(ownerAccount()));
  expect(owner.rows.length).toBeGreaterThan(0);
});
