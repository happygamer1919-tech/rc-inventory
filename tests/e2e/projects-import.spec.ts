import { readFile } from "node:fs/promises";
import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { parseCsv, templateCsv, PROJECT_IMPORT_FIELDS } from "@/lib/data/project-import-types";

// projects-import.spec - linia de acceptanta a cardului P3-124, Item 3 al lui Ivan.
//
// COPIAT DIN tests/e2e/clients-import.spec.ts CA FORMA, nu ca fisier: cardul nu
// editeaza spec-urile de leaduri si de clienti, deci ajutoarele de mai jos (csv,
// contul REST, numele unice pe rulare) sunt scrise din nou aici. Fixturile sunt
// TREI CORPURI DE CSV construite in test, nu fisiere noi.
//
// FIXTURILE SUNT INVENTATE AICI, CU MANA: exista date reale de client in productie
// de pe 2026-09-14, deci niciun nume al unui om sau al unei firme adevarate nu
// ajunge in acest fisier. Fiecare caz isi creeaza propriii clienti, cu un nume
// unic pe rulare, ca doua cazuri sa nu se vada intre ele.
//
// ACCEPTANTA (f) A CARDULUI, CORECTATA PE q114: public.projects nu are nicio
// coloana de unitate de masura (0016_projects.sql), deci cazul (f) dovedeste
// ABSENTA unitatii, nu acceptarea celor noua unitati din ALL_UNITS. Dovada celor
// noua unitati ramane la P3-125 (b).

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

function tagFor(label: string): string {
  return `TEST ${RUN} proiecte ${label}`;
}

// ---------------------------------------------------------------------------
// Legatura directa la baza, ca administratorul
// ---------------------------------------------------------------------------

type OwnerRest = { api: APIRequestContext; headers: Record<string, string> };

async function ownerRest(): Promise<OwnerRest> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  expect(url, "P3-124 are nevoie de NEXT_PUBLIC_SUPABASE_URL").not.toBe("");
  expect(anonKey, "P3-124 are nevoie de NEXT_PUBLIC_SUPABASE_ANON_KEY").not.toBe("");

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

async function restInsert(rest: OwnerRest, table: string, row: Record<string, unknown>): Promise<string> {
  const created = await rest.api.post(`/rest/v1/${table}`, {
    headers: { ...rest.headers, Prefer: "return=representation" },
    data: [row],
  });
  expect(created.status(), await created.text()).toBe(201);
  const stored = (await created.json()) as { id: string }[];
  return stored[0]!.id;
}

async function seedClient(rest: OwnerRest, name: string): Promise<string> {
  return restInsert(rest, "clients", { name });
}

/** Cate clienti sunt in baza, numarat de server, nu din lungimea unei pagini. */
async function clientCount(rest: OwnerRest): Promise<number> {
  const response = await rest.api.get("/rest/v1/clients?select=id&limit=1", {
    headers: { ...rest.headers, Prefer: "count=exact" },
  });
  expect(response.status(), await response.text()).toBeLessThan(300);
  const range = response.headers()["content-range"] ?? "";
  const total = Number(range.split("/")[1]);
  expect(Number.isFinite(total), `content-range ilizibil: ${range}`).toBe(true);
  return total;
}

type StoredProject = {
  id: string;
  client_id: string;
  name: string;
  address: string | null;
  status: string;
  start_date: string | null;
  planned_end_date: string | null;
  budget_mdl: number | string | null;
  notes: string | null;
};

const STORED_COLUMNS = "id,client_id,name,address,status,start_date,planned_end_date,budget_mdl,notes";

async function storedByTag(rest: OwnerRest, tag: string): Promise<StoredProject[]> {
  return restGet(
    rest,
    `/rest/v1/projects?select=${STORED_COLUMNS}&name=like.${encodeURIComponent(`${tag}*`)}&order=name.asc`,
  );
}

async function storedById(rest: OwnerRest, id: string): Promise<StoredProject> {
  const rows = await restGet<StoredProject[]>(rest, `/rest/v1/projects?select=${STORED_COLUMNS}&id=eq.${id}`);
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

// ---------------------------------------------------------------------------
// Fisierul si ecranul
// ---------------------------------------------------------------------------

/** Scris cu mana AICI: un test care importa scriitorul pe care il verifica
 *  dovedeste doar ca acela este egal cu el insusi. */
function csv(rows: string[][]): string {
  return rows
    .map((row) =>
      row.map((cell) => (/[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(","),
    )
    .join("\r\n");
}

async function openImport(page: Page): Promise<void> {
  await page.goto("/proiecte");
  await expect(page.getByTestId("projects-import")).toBeVisible();
  await page.getByTestId("projects-import").click();
  await expect(page.getByTestId("project-import")).toBeVisible();
  await expect(page.getByTestId("import-step-1")).toBeVisible();
}

async function chooseFile(page: Page, name: string, body: string): Promise<void> {
  await page.getByTestId("import-file").setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(body, "utf8"),
  });
}

async function toVerify(page: Page): Promise<void> {
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

const HEADERS = ["Client", "Denumire", "Adresă", "Stare", "Data început", "Termen estimat", "Buget (MDL)", "Note"];

// ---------------------------------------------------------------------------
// Cazurile
// ---------------------------------------------------------------------------

test.beforeEach(async ({ page }) => {
  await signIn(page, ownerAccount());
});

test("import proiecte: un fisier valid creeaza fiecare rand", async ({ page }) => {
  const rest = await ownerRest();
  const tag = tagFor("valid");
  const client = `${tag} client`;
  const clientId = await seedClient(rest, client);

  const body = csv([
    HEADERS,
    [client, `${tag} unu`, "Chișinău", "În lucru", "2026-11-01", "2027-03-31", "250 000,50", "prima"],
    [client, `${tag} doi`, "", "", "", "", "", ""],
    // P3-137: punctul la mii, asa cum se scrie romaneste.
    [client, `${tag} trei`, "", "", "", "", "250.000", ""],
  ]);

  await openImport(page);
  await chooseFile(page, "proiecte-valid.csv", body);
  await toVerify(page);

  expect(await countAt(page, "import-count-new")).toBe(3);
  expect(await countAt(page, "import-count-error")).toBe(0);

  await runImport(page);
  expect(await countAt(page, "import-created")).toBe(3);
  expect(await countAt(page, "import-skipped")).toBe(0);

  const stored = await storedByTag(rest, tag);
  expect(stored.map((r) => r.name)).toEqual([`${tag} doi`, `${tag} trei`, `${tag} unu`]);
  const unu = stored.find((r) => r.name === `${tag} unu`)!;
  expect(unu.client_id).toBe(clientId);
  expect(unu.status).toBe("active");
  expect(unu.start_date).toBe("2026-11-01");
  expect(unu.planned_end_date).toBe("2027-03-31");
  expect(Number(unu.budget_mdl)).toBe(250000.5);
  expect(unu.address).toBe("Chișinău");
  const doi = stored.find((r) => r.name === `${tag} doi`)!;
  // STAREA GOALA DEVINE Prospect, implicitul din ProjectForm.tsx.
  expect(doi.status).toBe("lead");
  expect(doi.budget_mdl).toBeNull();
  const trei = stored.find((r) => r.name === `${tag} trei`)!;
  expect(Number(trei.budget_mdl)).toBe(250000);
});

test("import proiecte: un fisier invalid nu scrie nimic si arata un motiv pe fiecare rand", async ({
  page,
}) => {
  const rest = await ownerRest();
  const tag = tagFor("invalid");
  const client = `${tag} client`;
  await seedClient(rest, client);

  const body = csv([
    HEADERS,
    [client, "", "", "", "", "", "", ""],
    ["", `${tag} fara client`, "", "", "", "", "", ""],
    [client, `${tag} data rea`, "", "", "32.13.2027", "", "", ""],
    [client, `${tag} termen rau`, "", "", "2027-05-01", "2027-04-01", "", ""],
    [client, `${tag} stare rea`, "", "Nicăieri", "", "", "", ""],
    [client, `${tag} buget rau`, "", "", "", "", "mult", ""],
  ]);

  await openImport(page);
  await chooseFile(page, "proiecte-invalid.csv", body);
  await toVerify(page);

  expect(await countAt(page, "import-count-new")).toBe(0);
  expect(await countAt(page, "import-count-error")).toBe(6);
  const errorRows = page.getByTestId("import-error-row");
  await expect(errorRows).toHaveCount(6);
  await expect(errorRows.nth(0)).toContainText("Denumire lipsește.");
  await expect(errorRows.nth(1)).toContainText("Client lipsește.");
  await expect(errorRows.nth(2)).toContainText("nu este o dată validă");
  await expect(errorRows.nth(3)).toContainText("Termenul estimat nu poate fi înaintea datei de început.");
  await expect(errorRows.nth(4)).toContainText("nu este una dintre stările cunoscute");
  await expect(errorRows.nth(5)).toContainText("nu este un număr pozitiv");

  await runImport(page);
  expect(await countAt(page, "import-created")).toBe(0);
  expect(await countAt(page, "import-skipped")).toBe(6);

  expect(await storedByTag(rest, tag), "nimic nu s-a scris dintr-un fisier in intregime invalid").toHaveLength(0);
});

test("import proiecte: un fisier mixt scrie numai randurile valide si numara corect", async ({ page }) => {
  const rest = await ownerRest();
  const tag = tagFor("mixt");
  const client = `${tag} client`;
  await seedClient(rest, client);

  const body = csv([
    HEADERS,
    [client, `${tag} bun unu`, "", "", "", "", "", ""],
    [client, "", "", "", "", "", "", "fără denumire"],
    [client, `${tag} bun doi`, "", "", "", "", "", ""],
  ]);

  await openImport(page);
  await chooseFile(page, "proiecte-mixt.csv", body);
  await toVerify(page);

  expect(await countAt(page, "import-count-new")).toBe(2);
  expect(await countAt(page, "import-count-error")).toBe(1);

  await runImport(page);
  const created = await countAt(page, "import-created");
  const skipped = await countAt(page, "import-skipped");
  expect({ created, skipped }).toEqual({ created: 2, skipped: 1 });

  const stored = await storedByTag(rest, tag);
  expect(stored.map((r) => r.name)).toEqual([`${tag} bun doi`, `${tag} bun unu`]);
});

test("import proiecte: previzualizarea apare inainte de orice scriere", async ({ page }) => {
  const rest = await ownerRest();
  const tag = tagFor("preview");
  const client = `${tag} client`;
  await seedClient(rest, client);

  const body = csv([HEADERS, [client, `${tag} unu`, "", "", "", "", "", ""]]);

  await openImport(page);
  await chooseFile(page, "proiecte-preview.csv", body);
  await toVerify(page);

  // AJUNS LA PASUL 3, NIMIC NU S-A SCRIS INCA: regula clauzei (3) a cardului.
  expect(await countAt(page, "import-count-new")).toBe(1);
  expect(await storedByTag(rest, tag), "nimic scris inainte de confirmare").toHaveLength(0);

  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-4")).toBeVisible();
  expect(await storedByTag(rest, tag), "nici la pasul 4, inainte de apasarea Importă").toHaveLength(0);

  await page.getByTestId("import-run").click();
  await expect(page.getByTestId("import-summary")).toBeVisible({ timeout: 60_000 });
  expect(await storedByTag(rest, tag), "abia dupa Importă apare randul").toHaveLength(1);
});

test("import proiecte: acelasi nume la doi clienti diferiti sunt doua proiecte", async ({ page }) => {
  const rest = await ownerRest();
  const tag = tagFor("doi clienti");
  const first = `${tag} client unu`;
  const second = `${tag} client doi`;
  const firstId = await seedClient(rest, first);
  const secondId = await seedClient(rest, second);
  const shared = `${tag} Bloc A`;

  const body = csv([
    HEADERS,
    [first, shared, "", "", "", "", "", ""],
    [second, shared, "", "", "", "", "", ""],
  ]);

  await openImport(page);
  await chooseFile(page, "proiecte-doi-clienti.csv", body);
  await toVerify(page);

  expect(await countAt(page, "import-count-new")).toBe(2);
  expect(await countAt(page, "import-count-duplicate")).toBe(0);

  await runImport(page);
  expect(await countAt(page, "import-created")).toBe(2);

  const stored = await storedByTag(rest, shared);
  expect(stored.map((r) => r.client_id).sort()).toEqual([firstId, secondId].sort());
});

test("import proiecte: acelasi nume la acelasi client este un dublat", async ({ page }) => {
  const rest = await ownerRest();
  const tag = tagFor("dublat");
  const client = `${tag} client`;
  const clientId = await seedClient(rest, client);
  const name = `${tag} Bloc A`;

  const storedId = await restInsert(rest, "projects", {
    client_id: clientId,
    name,
    address: "Orhei",
  });
  const before = await storedById(rest, storedId);

  const body = csv([
    HEADERS,
    // Acelasi nume, litere diferite: dublat al celui stocat.
    [client, name.toUpperCase(), "Adresă din fișier, care nu trebuie să o schimbe pe cea scrisă", "", "", "", "100", "notă nouă"],
    [client, `${tag} nou`, "", "", "", "", "", ""],
    // Acelasi nume ca randul de mai sus, in acelasi fisier.
    [client, `${tag} nou`, "", "", "", "", "", ""],
  ]);

  await openImport(page);
  await chooseFile(page, "proiecte-dublat.csv", body);
  await toVerify(page);
  expect(await countAt(page, "import-count-new")).toBe(1);
  expect(await countAt(page, "import-count-duplicate")).toBe(2);
  await expect(page.getByTestId("import-duplicate")).toHaveCount(2);

  // IMPLICITUL ESTE "Sari peste": proiectul stocat ramane neatins.
  await expect(page.getByTestId("import-duplicate-choice").first()).toHaveValue("skip");
  await runImport(page);
  expect(await countAt(page, "import-created")).toBe(1);
  expect(await countAt(page, "import-filled")).toBe(0);
  expect(await countAt(page, "import-skipped")).toBe(2);
  expect(await storedById(rest, storedId)).toEqual(before);

  // A DOUA TRECERE: "Completează câmpurile goale" scrie NUMAI unde era gol.
  await openImport(page);
  await chooseFile(page, "proiecte-dublat.csv", body);
  await toVerify(page);
  await page.getByTestId("import-duplicate-choice").first().selectOption("fill");
  await runImport(page);
  expect(await countAt(page, "import-filled")).toBe(1);

  const after = await storedById(rest, storedId);
  // ADRESA ERA SCRISA DE UN OM: NU SE ATINGE. Bugetul si nota erau goale: se completeaza.
  expect(after.address).toBe("Orhei");
  expect(Number(after.budget_mdl)).toBe(100);
  expect(after.notes).toBe("notă nouă");
  expect(after.name).toBe(before.name);
  expect(await storedByTag(rest, tag), "proiectul nou nu s-a dublat la a doua trecere").toHaveLength(2);
});

test("import proiecte: un client necunoscut este o eroare de rand si nu creeaza niciun client", async ({
  page,
}) => {
  const rest = await ownerRest();
  const tag = tagFor("necunoscut");
  const known = `${tag} client`;
  await seedClient(rest, known);
  const unknown = `${tag} client inexistent`;
  const clientsBefore = await clientCount(rest);

  const body = csv([
    HEADERS,
    [unknown, `${tag} proiect orfan`, "", "", "", "", "", ""],
    [known, `${tag} proiect bun`, "", "", "", "", "", ""],
  ]);

  await openImport(page);
  await chooseFile(page, "proiecte-necunoscut.csv", body);
  await toVerify(page);

  expect(await countAt(page, "import-count-new")).toBe(1);
  expect(await countAt(page, "import-count-error")).toBe(1);
  const errorRow = page.getByTestId("import-error-row");
  await expect(errorRow).toHaveCount(1);
  // MOTIVUL NUMESTE CLIENTUL SI SPUNE SA SE IMPORTE INTAI CLIENTII.
  await expect(errorRow).toContainText(`Clientul "${unknown}" nu există.`);
  await expect(errorRow).toContainText("Importă mai întâi clienții");

  await runImport(page);
  expect(await countAt(page, "import-created")).toBe(1);
  expect(await countAt(page, "import-skipped")).toBe(1);

  expect(await clientCount(rest), "niciun client creat de import").toBe(clientsBefore);
  const byName = await restGet<{ id: string }[]>(
    rest,
    `/rest/v1/clients?select=id&name=eq.${encodeURIComponent(unknown)}`,
  );
  expect(byName, "clientul necunoscut nu exista nici dupa import").toHaveLength(0);
  const stored = await storedByTag(rest, tag);
  expect(stored.map((r) => r.name)).toEqual([`${tag} proiect bun`]);
});

test("import proiecte: EUR si RON sunt respinse in previzualizare cu motiv romanesc care numeste MDL", async ({
  page,
}) => {
  const rest = await ownerRest();
  const tag = tagFor("valuta");
  const client = `${tag} client`;
  await seedClient(rest, client);

  const headers = [...HEADERS, "Monedă"];
  const body = csv([
    headers,
    [client, `${tag} eur`, "", "", "", "", "1000", "", "EUR"],
    [client, `${tag} ron`, "", "", "", "", "1000", "", "RON"],
    [client, `${tag} mdl`, "", "", "", "", "1000", "", "mdl"],
    [client, `${tag} gol`, "", "", "", "", "1000", "", ""],
  ]);

  await openImport(page);
  await chooseFile(page, "proiecte-valuta.csv", body);
  await toVerify(page);

  // RESPINSE IN PREVIZUALIZARE, INAINTE DE ORICE SCRIERE (D8).
  expect(await countAt(page, "import-count-error")).toBe(2);
  expect(await countAt(page, "import-count-new")).toBe(2);
  const errorRows = page.getByTestId("import-error-row");
  await expect(errorRows).toHaveCount(2);
  await expect(errorRows.nth(0)).toContainText('Moneda "EUR" nu este acceptată');
  await expect(errorRows.nth(0)).toContainText("MDL");
  await expect(errorRows.nth(1)).toContainText('Moneda "RON" nu este acceptată');
  await expect(errorRows.nth(1)).toContainText("MDL");
  expect(await storedByTag(rest, tag), "nimic scris in previzualizare").toHaveLength(0);

  await runImport(page);
  expect(await countAt(page, "import-created")).toBe(2);
  const stored = await storedByTag(rest, tag);
  expect(stored.map((r) => r.name)).toEqual([`${tag} gol`, `${tag} mdl`]);
});

test("import proiecte: fisa proiectului nu are unitate, iar o coloana Unitate din CSV nu scrie nimic", async ({
  page,
}) => {
  // ACCEPTANTA (f), CORECTATA PE q114: public.projects nu are nicio coloana de
  // unitate de masura, deci dovada este una de ABSENTA:
  //
  //   1. lista campurilor de import nu are niciun camp de unitate;
  //   2. o coloana "Unitate" dintr-un fisier, cu orice cuvant pe ea, ramane pe
  //      "Nu importa" si nu opreste niciun rand.
  expect(
    (PROJECT_IMPORT_FIELDS as readonly string[]).some((f) => /unit/i.test(f)),
    "nu exista camp de unitate in lista de import a proiectelor",
  ).toBe(false);

  const rest = await ownerRest();
  const tag = tagFor("unitate");
  const client = `${tag} client`;
  await seedClient(rest, client);

  const headers = [...HEADERS, "Unitate"];
  const body = csv([
    headers,
    [client, `${tag} buc`, "", "", "", "", "", "", "pcs"],
    [client, `${tag} palet`, "", "", "", "", "", "", "palet"],
  ]);

  await openImport(page);
  await chooseFile(page, "proiecte-unitate.csv", body);

  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-2")).toBeVisible();
  await expect(page.getByLabel("Câmpul pentru coloana Unitate", { exact: true })).toHaveValue("");

  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-3")).toBeVisible();
  expect(await countAt(page, "import-count-new")).toBe(2);
  expect(await countAt(page, "import-count-error")).toBe(0);

  await runImport(page);
  const stored = await storedByTag(rest, tag);
  expect(stored, "unitatea valida si cea inventata se importa la fel, fiindca niciuna nu este citita").toHaveLength(2);
});

test("import proiecte: fisierul de erori are coloana Motiv si un rand pentru fiecare rand respins", async ({
  page,
}) => {
  const rest = await ownerRest();
  const tag = tagFor("motiv");
  const client = `${tag} client`;
  await seedClient(rest, client);

  const body = csv([
    HEADERS,
    [client, "", "", "", "", "", "", "fără nume"],
    [client, `${tag} bun`, "", "", "", "", "", ""],
  ]);

  await openImport(page);
  await chooseFile(page, "proiecte-motiv.csv", body);
  await toVerify(page);
  await runImport(page);
  expect(await countAt(page, "import-skipped")).toBe(1);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("import-download-skipped").click(),
  ]);
  expect(download.suggestedFilename()).toBe("randuri-nepreluate-proiecte.csv");
  const rows = parseCsv(await readFile(await download.path(), "utf8"));

  expect(rows[0]).toEqual(["Rând", "Motiv", ...HEADERS]);
  const skippedRow = rows.find((r) => r[1] === "Denumire lipsește.");
  expect(skippedRow, "randul nepreluat este in fisier, cu motivul lui").toBeTruthy();
  expect(await storedByTag(rest, tag)).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// Modelul descarcat, acelasi standard ca la clienti si la leaduri
// ---------------------------------------------------------------------------

test("import proiecte: modelul descarcat are antetele formularului, un rand exemplu si doua coloane obligatorii", async ({
  page,
}) => {
  const expected = parseCsv(templateCsv());
  expect(expected, "antetul plus un rand exemplu").toHaveLength(2);
  const [header, example] = expected as [string[], string[]];

  expect(header.slice(0, 2)).toEqual(["Client *", "Denumire *"]);
  expect(header.filter((h) => h.endsWith(" *")), "doua coloane marcate").toHaveLength(2);
  expect(header.slice(2)).toEqual(["Adresă", "Stare", "Data început", "Termen estimat", "Buget (MDL)", "Note"]);
  expect(example, "randul exemplu are aceleasi coloane ca antetul").toHaveLength(header.length);

  const rest = await ownerRest();
  const tag = tagFor("model");
  const client = `${tag} client`;
  await seedClient(rest, client);

  await page.goto("/proiecte");
  // LEGATURA DE PE ECRANUL PROIECTE, langa buton.
  const [pageDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("projects-import-template").click(),
  ]);
  expect(pageDownload.suggestedFilename()).toBe("sablon-proiecte.csv");
  expect(parseCsv(await readFile(await pageDownload.path(), "utf8"))).toEqual(expected);

  await openImport(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("import-template").click(),
  ]);
  expect(download.suggestedFilename()).toBe("sablon-proiecte.csv");
  expect(parseCsv(await readFile(await download.path(), "utf8"))).toEqual(expected);

  // RANDUL EXEMPLU SE IMPORTA CURAT, cu numele unui client care exista pus in
  // prima celula: modelul nu inventeaza un client.
  const filled = [client, `${tag} exemplu`, ...example.slice(2)];
  await chooseFile(page, "sablon-proiecte.csv", csv([header, filled]));
  await toVerify(page);
  expect(await countAt(page, "import-count-error"), "randul exemplu nu cade la nicio verificare").toBe(0);
  expect(await countAt(page, "import-count-new")).toBe(1);
});
