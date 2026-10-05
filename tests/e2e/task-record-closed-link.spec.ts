import { expect, test, type Page } from "@playwright/test";
import { linkChoicesWithCurrent, taskLinkKey } from "@/lib/data/tasks-shape";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// task-record-closed-link.spec - linia de acceptanta a cardului P3-160: la
// modificarea unei sarcini legate de un proiect inchis sau de un client inactiv,
// caseta "Înregistrare" arata numele inregistrarii si nu o casuta goala.
//
// PRIMELE DOUA CAZURI NU AU NEVOIE DE BAZA DE DATE: ele probeaza functia pura din
// lib/data/tasks-shape.ts pe care o foloseste formularul. Ultimul caz deschide
// ecranul si ruleaza numai in CI, pe stiva locala. Datele de test nu se sterg.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const TAG = `TEST-P3142-${RUN}`;

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    throw new Error("task-record-closed-link.spec are nevoie de URL-ul si cheia de serviciu Supabase.");
  }
  return { origin: new URL(url).origin, service };
}

async function insert(table: string, body: Record<string, unknown>): Promise<string> {
  const { origin, service } = env();
  const response = await fetch(`${origin}/rest/v1/${table}?select=id`, {
    method: "POST",
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  expect(response.ok, `${table} nu a putut fi scris: ${text}`).toBe(true);
  return String((JSON.parse(text) as { id: string }[])[0]!.id);
}

async function openTaskForEdit(page: Page, taskId: string, dueDay: string): Promise<void> {
  // Aceeasi cale ca legatura de pe Azi: ?sarcina=<id>, cu fereastra de termen ca lista
  // sa contina sarcina.
  await page.goto(`/sarcini?sarcina=${taskId}&de_la=${dueDay}&pana_la=${dueDay}`);
  await expect(page.getByTestId("task-form")).toBeVisible({ timeout: 30_000 });
}

test("P3-160: functia pura adauga inregistrarea curenta lipsa si nu schimba lista unei sarcini noi", () => {
  const open = [{ id: "a", label: "Deschis" }];
  const closed = { id: "b", label: "Vechi (închis)" };

  expect(linkChoicesWithCurrent(open, closed).map((o) => o.label)).toEqual([
    "Deschis",
    "Vechi (închis)",
  ]);
  // Sarcina noua: nicio inregistrare curenta, lista ramane exact cea data.
  expect(linkChoicesWithCurrent(open, undefined)).toBe(open);
  // Inregistrarea este deja in lista: nu se dubleaza.
  expect(linkChoicesWithCurrent(open, { id: "a", label: "Deschis" })).toBe(open);
  expect(taskLinkKey("project", "x")).toBe("project:x");
});

test("P3-160: sarcina legata de un proiect inchis arata numele proiectului, la fel clientul inactiv, iar legatura se pastreaza la salvare", async ({
  page,
}) => {
  test.setTimeout(180_000);

  const activeClientId = await insert("clients", { name: `${TAG} client activ`, active: true });
  const inactiveClientId = await insert("clients", { name: `${TAG} client inactiv`, active: false });
  const projectId = await insert("projects", {
    client_id: activeClientId,
    name: `${TAG} proiect inchis`,
    status: "closed",
  });

  const onProject = await insert("tasks", {
    title: `${TAG} sarcina pe proiect inchis`,
    due_date: "2037-09-01",
    entity_type: "project",
    entity_id: projectId,
  });
  const onClient = await insert("tasks", {
    title: `${TAG} sarcina pe client inactiv`,
    due_date: "2037-09-02",
    entity_type: "client",
    entity_id: inactiveClientId,
  });

  await signIn(page, ownerAccount());

  // PROIECT INCHIS: numele se vede, apoi o salvare fara atingerea casetei pastreaza
  // legatura.
  await openTaskForEdit(page, onProject, "2037-09-01");
  const projectBox = page.getByTestId("field-task-entity").locator("input");
  await expect(projectBox).toHaveValue(new RegExp(`${TAG} proiect inchis`));
  await page.getByTestId("task-save").click();
  await expect(page.getByTestId("task-form")).toHaveCount(0, { timeout: 30_000 });

  const { origin, service } = env();
  const stored = await fetch(`${origin}/rest/v1/tasks?select=entity_type,entity_id&id=eq.${onProject}`, {
    headers: { apikey: service, Authorization: `Bearer ${service}` },
  });
  expect(await stored.json()).toEqual([{ entity_type: "project", entity_id: projectId }]);

  await openTaskForEdit(page, onProject, "2037-09-01");
  await expect(page.getByTestId("field-task-entity").locator("input")).toHaveValue(
    new RegExp(`${TAG} proiect inchis`),
  );
  await page.getByTestId("task-form-close").click();

  // CLIENT INACTIV.
  await openTaskForEdit(page, onClient, "2037-09-02");
  await expect(page.getByTestId("field-task-entity").locator("input")).toHaveValue(
    new RegExp(`${TAG} client inactiv`),
  );
  await page.getByTestId("task-form-close").click();

  // SARCINA NOUA OFERA NUMAI PROIECTE DESCHISE SI CLIENTI ACTIVI.
  await page.goto("/sarcini");
  await expect(page.getByTestId("tasks-filters")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("task-new").click();
  await page.getByTestId("field-task-entity-type").selectOption("project");
  await page.getByTestId("field-task-entity").locator("input").fill(`${TAG} proiect inchis`);
  await expect(page.locator("[data-rc-combo-list]")).not.toContainText(`${TAG} proiect inchis`);
  await page.getByTestId("field-task-entity-type").selectOption("client");
  await page.getByTestId("field-task-entity").locator("input").fill(`${TAG} client inactiv`);
  await expect(page.locator("[data-rc-combo-list]")).not.toContainText(`${TAG} client inactiv`);
});
