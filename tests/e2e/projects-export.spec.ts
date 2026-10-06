import { readFile } from "node:fs/promises";
import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { parseCsv, templateCsv, PROJECT_TEMPLATE_FIELDS } from "@/lib/data/project-import-types";

// projects-export.spec - linia de acceptanta a cardului P3-128, goal G71.
//
// FIXTURILE SUNT INVENTATE AICI, CU MANA. In productie exista date reale de client, deci
// niciun nume al unui om sau al unei firme adevarate nu ajunge in acest fisier. Fiecare
// client si fiecare proiect poarta prefixul TEST si un sufix unic pe rulare, iar cautarea
// listei pe acel sufix este FILTRUL fiecarui caz: baza nu este goala, deci "exportul
// tuturor" ar scoate si randurile altor rulari.
//
// DATELE DE TEST NU SE STERG NICIODATA, ca peste tot in aceasta suita.
//
// REIMPORTUL SE FACE PRIN NUME NOU, nu prin stergere: importul de proiecte recunoaste un
// dublat dupa nume plus client, deci aceleasi randuri nu s-ar crea a doua oara. Fisierul
// exportat se reimporta mai intai NEATINS (trebuie sa dea numai dublate), apoi cu seria
// proiectului mutata pe B, COLOANA CLIENT NEATINSA: ea este cea care trebuie sa se
// potriveasca. Toate celelalte campuri se compara una cate una cu originalul.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

const tagOf = (label: string): string => `TEST ${RUN} pexp ${label}`;

// ---------------------------------------------------------------------------
// Legatura directa la baza, ca administratorul
// ---------------------------------------------------------------------------

type OwnerRest = { api: APIRequestContext; headers: Record<string, string> };

async function ownerRest(): Promise<OwnerRest> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  expect(url, "P3-128 are nevoie de NEXT_PUBLIC_SUPABASE_URL").not.toBe("");
  expect(anonKey, "P3-128 are nevoie de NEXT_PUBLIC_SUPABASE_ANON_KEY").not.toBe("");

  const api = await request.newContext({ baseURL: url });
  const owner = ownerAccount();
  const token = await api.post("/auth/v1/token?grant_type=password", {
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    data: { email: owner.email, password: owner.password },
  });
  expect(token.ok()).toBe(true);
  const body = (await token.json()) as { access_token: string };

  return {
    api,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${body.access_token}`,
      "Content-Type": "application/json",
    },
  };
}

async function restGet<T>(rest: OwnerRest, path: string): Promise<T> {
  const response = await rest.api.get(path, { headers: rest.headers });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as T;
}

/** Un rand pe cerere: PostgREST cere ca toate obiectele unui lot sa aiba aceleasi chei. */
async function restInsert(rest: OwnerRest, table: string, row: Record<string, unknown>): Promise<string> {
  const created = await rest.api.post(`/rest/v1/${table}`, {
    headers: { ...rest.headers, Prefer: "return=representation" },
    data: [row],
  });
  expect(created.status(), await created.text()).toBe(201);
  return ((await created.json()) as { id: string }[])[0]!.id;
}

async function seedClient(rest: OwnerRest, name: string): Promise<string> {
  return restInsert(rest, "clients", { name });
}

type StoredProject = {
  client_id: string;
  name: string;
  address: string | null;
  status: string;
  start_date: string | null;
  planned_end_date: string | null;
  budget_mdl: number | string | null;
  notes: string | null;
};

const STORED_COLUMNS = "client_id,name,address,status,start_date,planned_end_date,budget_mdl,notes";

async function storedByTag(rest: OwnerRest, tag: string): Promise<StoredProject[]> {
  return restGet(
    rest,
    `/rest/v1/projects?select=${STORED_COLUMNS}&name=like.${encodeURIComponent(`${tag}*`)}&order=name.asc`,
  );
}

// ---------------------------------------------------------------------------
// Fisierul si ecranul
// ---------------------------------------------------------------------------

/** Scris cu mana AICI si nu importat din aplicatie: un test care importa scriitorul pe care
 *  il verifica dovedeste doar ca acela este egal cu el insusi. */
function csv(rows: string[][]): string {
  return rows
    .map((row) =>
      row.map((cell) => (/[",;\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(";"),
    )
    .join("\r\n");
}

/** Deschide Proiecte cu filtrele date, apasa Exporta CSV si intoarce fisierul descarcat. */
async function exportView(
  page: Page,
  params: Record<string, string>,
): Promise<{ bytes: Buffer; text: string; name: string }> {
  const search = new URLSearchParams(params);
  await page.goto(`/proiecte?${search.toString()}`);
  await expect(page.getByTestId("projects-export")).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("projects-export").click(),
  ]);
  const bytes = await readFile(await download.path());
  return { bytes, text: bytes.toString("utf8"), name: download.suggestedFilename() };
}

/** Datele fisierului, fara BOM si fara antet. */
function dataRows(text: string): string[][] {
  return parseCsv(text).slice(1);
}

const col = (field: (typeof PROJECT_TEMPLATE_FIELDS)[number]): number =>
  PROJECT_TEMPLATE_FIELDS.indexOf(field);

async function importFile(page: Page, name: string, body: string): Promise<void> {
  await page.goto("/proiecte");
  await expect(page.getByTestId("projects-import")).toBeVisible();
  await page.getByTestId("projects-import").click();
  await expect(page.getByTestId("import-step-1")).toBeVisible();
  await page.getByTestId("import-file").setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(body, "utf8"),
  });
  await expect(page.getByTestId("import-read")).toBeVisible();
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-2")).toBeVisible();
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-3")).toBeVisible();
}

async function runImport(page: Page): Promise<void> {
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-4")).toBeVisible();
  await page.getByTestId("import-run").click();
  await expect(page.getByTestId("import-summary")).toBeVisible({ timeout: 60_000 });
}

async function countAt(page: Page, testId: string): Promise<number> {
  return Number((await page.getByTestId(testId).innerText()).trim());
}

const LABELS = [
  "Client *",
  "Denumire *",
  "Adresă",
  "Stare",
  "Data început",
  "Termen estimat",
  "Buget (MDL)",
  "Note",
];

test.beforeEach(async ({ page }) => {
  await signIn(page, ownerAccount());
});

// ---------------------------------------------------------------------------
// Cazurile
// ---------------------------------------------------------------------------

test("export proiecte: export apoi import produce inregistrari identice", async ({ page }) => {
  const rest = await ownerRest();
  const tagA = tagOf("rta");
  const tagB = tagOf("rtb");

  // Doi clienti, unul cu virgula, ghilimele si diacritice in nume.
  const clientOne = `${tagA} client Țiglă, "Prima" SRL`;
  const clientTwo = `${tagA} client doi`;
  const idOne = await seedClient(rest, clientOne);
  const idTwo = await seedClient(rest, clientTwo);

  // Patru proiecte care ating fiecare camp: virgula, ghilimele si rand nou in text,
  // diacritice, buget cu zecimale, buget lipsa, patru stari vii, date, fara date.
  await restInsert(rest, "projects", {
    client_id: idOne,
    name: `${tagA} Bloc A, Șura "Mare"`,
    address: "Chișinău, str. Ștefan cel Mare 1",
    status: "active",
    start_date: "2026-11-01",
    planned_end_date: "2027-03-31",
    budget_mdl: 12500.5,
    notes: 'prima linie\na doua linie, cu virgulă și "ghilimele"',
  });
  await restInsert(rest, "projects", {
    client_id: idOne,
    name: `${tagA} Acoperiș`,
    status: "contract",
    planned_end_date: "2027-06-15",
    budget_mdl: 250000,
  });
  await restInsert(rest, "projects", {
    client_id: idTwo,
    name: `${tagA} Jgheaburi`,
    address: "Bălți",
    status: "offer",
    start_date: "2027-01-10",
    notes: "ofertă trimisă",
  });
  await restInsert(rest, "projects", {
    client_id: idTwo,
    name: `${tagA} Prospect`,
    status: "lead",
  });

  const original = await storedByTag(rest, tagA);
  expect(original).toHaveLength(4);

  // 1. EXPORTUL: numai randurile seriei A, prin cautarea listei.
  const exported = await exportView(page, { q: tagA });
  expect(exported.name).toBe("proiecte.csv");
  const rows = dataRows(exported.text);
  expect(rows).toHaveLength(4);

  // 2. FISIERUL NEATINS, REIMPORTAT: fiecare rand este un dublat al celui din baza, nu se
  //    creeaza nimic si niciun client nu este necunoscut.
  await importFile(page, "proiecte-export.csv", exported.text);
  expect(await countAt(page, "import-count-new")).toBe(0);
  expect(await countAt(page, "import-count-duplicate")).toBe(4);
  expect(await countAt(page, "import-count-error")).toBe(0);

  // 3. SERIA B: numele proiectului mutat pe seria B, coloana Client neatinsa.
  const moved = rows.map((row) => {
    const copy = [...row];
    copy[col("name")] = copy[col("name")]!.replace(tagA, tagB);
    return copy;
  });
  const secondFile = csv([parseCsv(exported.text)[0]!, ...moved]);

  await importFile(page, "proiecte-export-b.csv", secondFile);
  expect(await countAt(page, "import-count-new")).toBe(4);
  expect(await countAt(page, "import-count-error")).toBe(0);
  await runImport(page);
  expect(await countAt(page, "import-created")).toBe(4);

  // 4. EGALITATE CAMP CU CAMP, din randurile stocate si nu de pe ecran.
  const reimported = await storedByTag(rest, tagB);
  expect(reimported).toHaveLength(4);

  const normal = (p: StoredProject) => ({
    ...p,
    budget_mdl: p.budget_mdl === null ? null : Number(p.budget_mdl),
  });
  const expected = original.map((p) => normal({ ...p, name: p.name.replace(tagA, tagB) }));
  expect(reimported.map(normal)).toEqual(expected);
});

test("export proiecte: coloana de client se re-importa fara nicio eroare de client necunoscut", async ({
  page,
}) => {
  const rest = await ownerRest();
  const tagA = tagOf("cla");
  const tagB = tagOf("clb");

  // Nume cu diacritice, cu litere mari si cu virgula: fiecare ar cadea pe un id sau pe o
  // forma schimbata.
  const clients = [`${tagA} Șantier Ținta SRL`, `${tagA} Casa, Mare`, `${tagA} MIXT Case`];
  const ids: string[] = [];
  for (const name of clients) ids.push(await seedClient(rest, name));
  for (const [i, id] of ids.entries()) {
    await restInsert(rest, "projects", { client_id: id, name: `${tagA} proiect ${i + 1}` });
  }

  const exported = await exportView(page, { q: tagA });
  const rows = dataRows(exported.text);
  expect(rows).toHaveLength(3);

  // Celula Client este DENUMIREA clientului, exact ca in baza, niciodata un id.
  expect(rows.map((r) => r[col("client")]).sort()).toEqual([...clients].sort());

  const moved = rows.map((row) => {
    const copy = [...row];
    copy[col("name")] = copy[col("name")]!.replace(tagA, tagB);
    return copy;
  });
  await importFile(page, "proiecte-client.csv", csv([parseCsv(exported.text)[0]!, ...moved]));

  expect(await countAt(page, "import-count-new")).toBe(3);
  expect(await countAt(page, "import-count-error"), "zero erori de client necunoscut").toBe(0);
  await expect(page.getByTestId("import-error-row")).toHaveCount(0);
  await expect(page.getByTestId("import-step-3")).not.toContainText("nu există");

  await runImport(page);
  expect(await countAt(page, "import-created")).toBe(3);
  const stored = await storedByTag(rest, tagB);
  expect(stored.map((p) => p.client_id).sort()).toEqual([...ids].sort());
});

test("export proiecte: exportul respecta filtrele curente", async ({ page }) => {
  const rest = await ownerRest();
  const tag = tagOf("fil");

  const idOne = await seedClient(rest, `${tag} client unu`);
  const idTwo = await seedClient(rest, `${tag} client doi`);

  await restInsert(rest, "projects", { client_id: idOne, name: `${tag} unu`, status: "active" });
  await restInsert(rest, "projects", { client_id: idOne, name: `${tag} doi`, status: "closed" });
  await restInsert(rest, "projects", { client_id: idTwo, name: `${tag} trei`, status: "active" });
  await restInsert(rest, "projects", { client_id: idTwo, name: `${tag} patru`, status: "lead" });
  // Un rand care nu poarta eticheta cautata: nu trebuie sa apara in niciun export de mai jos.
  const idOther = await seedClient(rest, `TEST ${RUN} pexp altul client`);
  await restInsert(rest, "projects", { client_id: idOther, name: `TEST ${RUN} pexp altul`, status: "active" });

  const names = (text: string): string[] =>
    dataRows(text)
      .map((r) => r[col("name")]!)
      .sort();

  // Implicitul listei: cele patru stari vii, fara Închis.
  const live = await exportView(page, { q: tag });
  expect(names(live.text)).toEqual([`${tag} patru`, `${tag} trei`, `${tag} unu`]);

  // O stare aleasa.
  const closed = await exportView(page, { q: tag, stare: "closed" });
  expect(names(closed.text)).toEqual([`${tag} doi`]);

  // Toate stările.
  const all = await exportView(page, { q: tag, stare: "toate" });
  expect(names(all.text)).toEqual([`${tag} doi`, `${tag} patru`, `${tag} trei`, `${tag} unu`]);

  // Un client ales.
  const byClient = await exportView(page, { q: tag, client: idTwo });
  expect(names(byClient.text)).toEqual([`${tag} patru`, `${tag} trei`]);

  // Client si stare impreuna.
  const both = await exportView(page, { q: tag, client: idOne, stare: "toate" });
  expect(names(both.text)).toEqual([`${tag} doi`, `${tag} unu`]);

  // O cautare mai ingusta.
  const narrow = await exportView(page, { q: `${tag} trei` });
  expect(names(narrow.text)).toEqual([`${tag} trei`]);
});

test("export proiecte: fisierul incepe cu marca de ordine a octetilor si diacriticele supravietuiesc", async ({
  page,
}) => {
  const rest = await ownerRest();
  const tag = tagOf("bom");
  const notes = "Țiglă înlocuită la șură, ăâîșț ĂÂÎȘȚ";

  const id = await seedClient(rest, `${tag} client Șură`);
  await restInsert(rest, "projects", {
    client_id: id,
    name: `${tag} Șură`,
    address: "Chișinău, Ștefan cel Mare",
    status: "active",
    notes,
  });

  const exported = await exportView(page, { q: tag });
  expect([...exported.bytes.subarray(0, 3)], "EF BB BF").toEqual([0xef, 0xbb, 0xbf]);
  expect(exported.text.startsWith("﻿Client"), "un singur BOM, apoi antetul").toBe(true);
  expect(exported.text.indexOf("﻿", 1), "niciun al doilea BOM").toBe(-1);

  const rows = dataRows(exported.text);
  expect(rows).toHaveLength(1);
  const row = rows[0]!;
  expect(row[col("client")]).toBe(`${tag} client Șură`);
  expect(row[col("name")]).toBe(`${tag} Șură`);
  expect(row[col("address")]).toBe("Chișinău, Ștefan cel Mare");
  expect(row[col("notes")]).toBe(notes);
  expect(exported.text).not.toContain("�");
});

test("export proiecte: antetele exportului sunt identice cu antetele modelului de import", async ({
  page,
}) => {
  const rest = await ownerRest();
  const tag = tagOf("ant");

  const id = await seedClient(rest, `${tag} client`);
  await restInsert(rest, "projects", { client_id: id, name: `${tag} unu`, status: "active" });

  const exported = await exportView(page, { q: tag });
  const header = parseCsv(exported.text)[0];
  const model = parseCsv(templateCsv())[0];

  // Coloanele de pana acum, neschimbate, apoi identificatorul clientului la coada.
  expect(header, "antetul exportului: modelul plus coloana de la coada").toEqual([
    ...(model ?? []),
    "Identificator client",
  ]);
  expect(header, "si ca lista scrisa cu mana").toEqual([...LABELS, "Identificator client"]);
});

test("export proiecte: client dezactivat si doi clienti cu aceeasi denumire se reimporta fara erori", async ({
  page,
}) => {
  const rest = await ownerRest();
  const tag = tagOf("idc");

  const inactiveId = await restInsert(rest, "clients", { name: `${tag} client oprit`, active: false });
  const twinName = `${tag} client geaman`;
  const twinOne = await seedClient(rest, twinName);
  const twinTwo = await seedClient(rest, twinName);
  const soloId = await seedClient(rest, `${tag} client singur`);

  await restInsert(rest, "projects", { client_id: inactiveId, name: `${tag} la oprit`, status: "active" });
  await restInsert(rest, "projects", { client_id: twinOne, name: `${tag} la geaman`, status: "active" });
  await restInsert(rest, "projects", { client_id: twinTwo, name: `${tag} la geaman`, status: "active" });
  await restInsert(rest, "projects", { client_id: soloId, name: `${tag} la singur`, status: "active" });

  const exported = await exportView(page, { q: tag });
  const parsed = parseCsv(exported.text);
  const rows = parsed.slice(1);
  expect(rows).toHaveLength(4);

  // Coloana de la coada poarta id-ul clientului, nu denumirea.
  const idCol = PROJECT_TEMPLATE_FIELDS.length;
  expect(rows.map((r) => r[idCol]).sort()).toEqual([inactiveId, twinOne, twinTwo, soloId].sort());

  // 1. FISIERUL NEATINS: zero erori, fiecare rand este un dublat.
  await importFile(page, "proiecte-id.csv", exported.text);
  expect(await countAt(page, "import-count-error"), "zero randuri cu eroare").toBe(0);
  expect(await countAt(page, "import-count-new")).toBe(0);
  expect(await countAt(page, "import-count-duplicate")).toBe(4);

  // 2. UN PROIECT NOU LA CLIENTUL DEZACTIVAT SE REFUZA, ca pana acum; la ceilalti se creeaza.
  const moved = rows.map((row) => {
    const copy = [...row];
    copy[col("name")] = copy[col("name")]!.replace("la ", "nou la ");
    return copy;
  });
  await importFile(page, "proiecte-id-nou.csv", csv([parsed[0]!, ...moved]));
  expect(await countAt(page, "import-count-new")).toBe(3);
  expect(await countAt(page, "import-count-error")).toBe(1);
  await expect(page.getByTestId("import-error-row")).toContainText("dezactivat");
});

test("export proiecte: un fisier vechi, fara coloana de identificator, se importa ca pana acum", async ({
  page,
}) => {
  const rest = await ownerRest();
  const tag = tagOf("old");

  const soloId = await seedClient(rest, `${tag} client singur`);
  const twinName = `${tag} client geaman`;
  const twinOne = await seedClient(rest, twinName);
  await seedClient(rest, twinName);
  await restInsert(rest, "projects", { client_id: soloId, name: `${tag} la singur`, status: "active" });
  await restInsert(rest, "projects", { client_id: twinOne, name: `${tag} la geaman`, status: "active" });

  const exported = await exportView(page, { q: tag });
  const parsed = parseCsv(exported.text);
  const idCol = PROJECT_TEMPLATE_FIELDS.length;
  const oldFormat = parsed.map((row) => row.slice(0, idCol));
  expect(oldFormat[0]).toEqual(LABELS);

  await importFile(page, "proiecte-vechi.csv", csv(oldFormat));
  // Clientul cu nume unic se recunoaste dupa nume si proiectul este dublat; denumirea
  // dublata ramane ambigua, ca inainte.
  expect(await countAt(page, "import-count-duplicate")).toBe(1);
  expect(await countAt(page, "import-count-error")).toBe(1);
  expect(await countAt(page, "import-count-new")).toBe(0);
  await expect(page.getByTestId("import-error-row")).toContainText("mai mulți clienți");
});

test("export proiecte: se exporta toate randurile filtrului, nu doar pagina vizibila", async ({
  page,
}) => {
  const rest = await ownerRest();
  const tag = tagOf("pag");

  const id = await seedClient(rest, `${tag} client`);
  const count = 30;
  for (let i = 1; i <= count; i += 1) {
    await restInsert(rest, "projects", {
      client_id: id,
      name: `${tag} ${String(i).padStart(2, "0")}`,
      status: "active",
    });
  }

  // Pe ecran lista are cel mult o pagina de 25.
  await page.goto(`/proiecte?${new URLSearchParams({ q: tag }).toString()}`);
  await expect(page.getByTestId("projects-export")).toBeVisible();
  expect(await page.getByTestId("project-row").count()).toBeLessThanOrEqual(25);

  const exported = await exportView(page, { q: tag });
  const rows = dataRows(exported.text);
  expect(rows, "toate cele 30, nu cele 25 de pe pagina").toHaveLength(count);
  expect(new Set(rows.map((r) => r[col("name")])).size, "fara randuri repetate").toBe(count);
});
