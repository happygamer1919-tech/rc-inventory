import { readFile } from "node:fs/promises";
import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { parseCsv, templateCsv, CLIENT_IMPORT_FIELDS } from "@/lib/data/client-import-types";

// clients-import.spec - linia de acceptanta a cardului P3-123, Item 3 al lui Ivan.
//
// COPIAT DIN tests/e2e/lead-import.spec.ts CA FORMA, nu ca fisier: cardul P3-123
// interzice orice editare a spec-ului de leaduri, deci fiecare ajutor de mai jos
// (csv, contul REST, telefoanele si emailurile unice pe rulare) este scris din
// nou aici. Decizia B a cardului: fixturile sunt TREI CORPURI DE CSV construite
// in test, nu fisiere noi sub tests/fixtures/.
//
// FIXTURILE SUNT INVENTATE AICI, CU MANA, din acelasi motiv ca la leaduri: exista
// date reale de client in productie de pe 2026-09-14, deci niciun nume, telefon
// sau email al unui om adevarat nu ajunge in acest fisier.
//
// CHEIA DE DUBLARE ESTE EMAILUL SINGUR (clauza 5 a cardului), deci numai
// emailurile trebuie sa fie unice pe rulare si pe caz; telefoanele nu sunt o
// cheie aici si nu au nevoie de aceeasi disciplina.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

const CASE = {
  valid: 1,
  invalid: 2,
  mixed: 3,
  preview: 4,
  duplicate: 5,
  currency: 6,
  units: 7,
  motiv: 8,
} as const;

function testEmail(caseLabel: string, label: string): string {
  return `test.${RUN}.${caseLabel}.${label}@example.test`;
}

function testName(label: string): string {
  return `TEST ${RUN} clienti ${label}`;
}

// ---------------------------------------------------------------------------
// Legatura directa la baza, ca administratorul
// ---------------------------------------------------------------------------

type OwnerRest = { api: APIRequestContext; headers: Record<string, string>; userId: string };

async function ownerRest(): Promise<OwnerRest> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  expect(url, "P3-123 are nevoie de NEXT_PUBLIC_SUPABASE_URL").not.toBe("");
  expect(anonKey, "P3-123 are nevoie de NEXT_PUBLIC_SUPABASE_ANON_KEY").not.toBe("");

  const api = await request.newContext({ baseURL: url });
  const owner = ownerAccount();
  const token = await api.post("/auth/v1/token?grant_type=password", {
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    data: { email: owner.email, password: owner.password },
  });
  expect(token.ok()).toBe(true);
  const body = (await token.json()) as { access_token: string; user: { id: string } };

  return {
    api,
    userId: body.user.id,
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

type StoredClient = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  stage: string;
  address: string | null;
  notes: string | null;
};

const STORED_COLUMNS = "id,name,phone,email,stage,address,notes";

async function storedByTag(rest: OwnerRest, tag: string): Promise<StoredClient[]> {
  return restGet(
    rest,
    `/rest/v1/clients?select=${STORED_COLUMNS}&name=like.${encodeURIComponent(`${tag}*`)}&order=name.asc`,
  );
}

async function storedById(rest: OwnerRest, id: string): Promise<StoredClient> {
  const rows = await restGet<StoredClient[]>(
    rest,
    `/rest/v1/clients?select=${STORED_COLUMNS}&id=eq.${id}`,
  );
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

async function seedClient(rest: OwnerRest, row: Record<string, unknown>): Promise<string> {
  const created = await rest.api.post("/rest/v1/clients", {
    headers: { ...rest.headers, Prefer: "return=representation" },
    data: [row],
  });
  expect(created.status(), await created.text()).toBe(201);
  const stored = (await created.json()) as { id: string }[];
  return stored[0]!.id;
}

// ---------------------------------------------------------------------------
// Fisierul si ecranul
// ---------------------------------------------------------------------------

/** Scris cu mana AICI, decizia B a cardului: un test care importa scriitorul pe
 *  care il verifica dovedeste doar ca acela este egal cu el insusi. */
function csv(rows: string[][]): string {
  return rows
    .map((row) =>
      row.map((cell) => (/[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(","),
    )
    .join("\r\n");
}

async function openImport(page: Page): Promise<void> {
  await page.goto("/clienti");
  await expect(page.getByTestId("clienti-import")).toBeVisible();
  await page.getByTestId("clienti-import").click();
  await expect(page.getByTestId("client-import")).toBeVisible();
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

const HEADERS = ["Denumire", "Telefon", "Email", "Etapă", "Interes", "Responsabil", "Data de reluare", "Adresă"];

// ---------------------------------------------------------------------------
// Cazurile
// ---------------------------------------------------------------------------

test.beforeEach(async ({ page }) => {
  await signIn(page, ownerAccount());
});

test("import clienti: un fisier valid creeaza fiecare rand", async ({ page }) => {
  const rest = await ownerRest();
  const tag = testName("valid");

  const body = csv([
    HEADERS,
    [`${tag} unu`, "069100001", testEmail("valid", "unu"), "Client", "acoperiș", "", "", "Chișinău"],
    [`${tag} doi`, "069100002", testEmail("valid", "doi"), "Lead rece", "țiglă", "", "", ""],
  ]);

  await openImport(page);
  await chooseFile(page, "clienti-valid.csv", body);
  await toVerify(page);

  expect(await countAt(page, "import-count-new")).toBe(2);
  expect(await countAt(page, "import-count-error")).toBe(0);

  await runImport(page);
  expect(await countAt(page, "import-created")).toBe(2);
  expect(await countAt(page, "import-skipped")).toBe(0);

  const stored = await storedByTag(rest, tag);
  expect(stored.map((r) => r.name)).toEqual([`${tag} doi`, `${tag} unu`]);
  const unu = stored.find((r) => r.name === `${tag} unu`)!;
  expect(unu.stage).toBe("client");
  expect(unu.email).toBe(testEmail("valid", "unu"));
  expect(unu.address).toBe("Chișinău");
  const doi = stored.find((r) => r.name === `${tag} doi`)!;
  expect(doi.stage).toBe("cold");
});

test("import clienti: un fisier invalid nu scrie nimic si arata un motiv pe fiecare rand", async ({
  page,
}) => {
  const rest = await ownerRest();
  const tag = testName("invalid");

  const body = csv([
    HEADERS,
    ["", "069100010", testEmail("invalid", "unu"), "", "fără denumire", "", "", ""],
    [`${tag} data rea`, "069100011", testEmail("invalid", "doi"), "", "", "", "32.13.2027", ""],
    [`${tag} etapa rea`, "069100012", testEmail("invalid", "trei"), "Nicăieri", "", "", "", ""],
  ]);

  await openImport(page);
  await chooseFile(page, "clienti-invalid.csv", body);
  await toVerify(page);

  expect(await countAt(page, "import-count-new")).toBe(0);
  expect(await countAt(page, "import-count-error")).toBe(3);
  const errorRows = page.getByTestId("import-error-row");
  await expect(errorRows).toHaveCount(3);
  await expect(errorRows.nth(0)).toContainText("Denumire lipsește.");
  await expect(errorRows.nth(1)).toContainText("nu este o dată validă");
  await expect(errorRows.nth(2)).toContainText("nu este una dintre etapele cunoscute");

  await runImport(page);
  expect(await countAt(page, "import-created")).toBe(0);
  expect(await countAt(page, "import-skipped")).toBe(3);

  const stored = await storedByTag(rest, tag);
  expect(stored, "nimic nu s-a scris dintr-un fisier in întregime invalid").toHaveLength(0);
});

test("import clienti: un fisier mixt scrie numai randurile valide si numara corect", async ({
  page,
}) => {
  const rest = await ownerRest();
  const tag = testName("mixt");

  const body = csv([
    HEADERS,
    [`${tag} bun unu`, "069100020", testEmail("mixt", "unu"), "", "", "", "", ""],
    ["", "069100021", testEmail("mixt", "doi"), "", "fără denumire", "", "", ""],
    [`${tag} bun doi`, "069100022", testEmail("mixt", "trei"), "", "", "", "", ""],
  ]);

  await openImport(page);
  await chooseFile(page, "clienti-mixt.csv", body);
  await toVerify(page);

  expect(await countAt(page, "import-count-new")).toBe(2);
  expect(await countAt(page, "import-count-error")).toBe(1);

  await runImport(page);
  const created = await countAt(page, "import-created");
  const skipped = await countAt(page, "import-skipped");
  expect({ created, skipped }).toEqual({ created: 2, skipped: 1 });

  const stored = await storedByTag(rest, `${tag} bun`);
  expect(stored.map((r) => r.name)).toEqual([`${tag} bun doi`, `${tag} bun unu`]);
  const rejected = await storedByTag(rest, tag);
  expect(rejected, "numai cele doua randuri bune, randul fara denumire nu a intrat pe nicio cale").toHaveLength(2);
});

test("import clienti: previzualizarea apare inainte de orice scriere", async ({ page }) => {
  const rest = await ownerRest();
  const tag = testName("preview");
  const c = CASE.preview;

  const body = csv([
    HEADERS,
    [`${tag} unu`, `0691000${c}0`, testEmail("preview", "unu"), "", "", "", "", ""],
  ]);

  await openImport(page);
  await chooseFile(page, "clienti-preview.csv", body);
  await toVerify(page);

  // AJUNS LA PASUL 3, NIMIC NU S-A SCRIS INCA: regula clauzei (3) a cardului.
  expect(await countAt(page, "import-count-new")).toBe(1);
  const stored = await storedByTag(rest, tag);
  expect(stored, "nimic scris inainte de confirmare").toHaveLength(0);

  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-4")).toBeVisible();
  const storedBeforeRun = await storedByTag(rest, tag);
  expect(storedBeforeRun, "nici la pasul 4, inainte de apasarea Importă").toHaveLength(0);

  await page.getByTestId("import-run").click();
  await expect(page.getByTestId("import-summary")).toBeVisible({ timeout: 60_000 });
  const storedAfterRun = await storedByTag(rest, tag);
  expect(storedAfterRun, "abia dupa Importă apare randul").toHaveLength(1);
});

test("import clienti: un dublat pe email nu suprascrie nicio valoare scrisa de om", async ({
  page,
}) => {
  const rest = await ownerRest();
  const tag = testName("dublat");
  const c = CASE.duplicate;

  const storedId = await seedClient(rest, {
    name: `${tag} stocat`,
    email: testEmail("dublat", "stocat").toUpperCase(),
    address: "Orhei",
  });
  const before = await storedById(rest, storedId);

  const body = csv([
    HEADERS,
    [
      `${tag} din fișier`,
      `0691000${c}1`,
      testEmail("dublat", "stocat"),
      "",
      "interes nou",
      "",
      "",
      "Adresă scrisă de fișier, care nu trebuie să ajungă în bază",
    ],
  ]);

  await openImport(page);
  await chooseFile(page, "clienti-dublat.csv", body);
  await toVerify(page);
  await expect(page.getByTestId("import-duplicate")).toHaveCount(1);

  // IMPLICITUL ESTE "Sari peste".
  await expect(page.getByTestId("import-duplicate-choice")).toHaveValue("skip");
  await runImport(page);
  expect(await countAt(page, "import-created")).toBe(0);
  expect(await countAt(page, "import-filled")).toBe(0);
  expect(await countAt(page, "import-skipped")).toBe(1);
  expect(await storedById(rest, storedId)).toEqual(before);

  // A DOUA TRECERE: "Completează câmpurile goale" scrie NUMAI unde era gol.
  await openImport(page);
  await chooseFile(page, "clienti-dublat.csv", body);
  await toVerify(page);
  await page.getByTestId("import-duplicate-choice").selectOption("fill");
  await runImport(page);
  expect(await countAt(page, "import-filled")).toBe(1);

  const after = await storedById(rest, storedId);
  // ADRESA ERA SCRISA DE UN OM: NU SE ATINGE, chiar daca fisierul aduce alta.
  expect(after.address).toBe("Orhei");
  expect(after.name).toBe(before.name);
});

test("import clienti: un rand care se potriveste cu un client dezactivat este spus ca atare si nu atinge clientul", async ({
  page,
}) => {
  const rest = await ownerRest();
  const tag = testName("dezactivat");

  // CLIENTUL DE TEST ESTE DEZACTIVAT, NU STERS. Fara telefon, ca o completare ar fi
  // fost posibila daca importul l-ar fi tratat ca pe unul activ.
  const storedId = await seedClient(rest, {
    name: `${tag} stocat`,
    email: testEmail("dezactivat", "stocat"),
    address: "Orhei",
    active: false,
  });
  const before = await storedById(rest, storedId);

  const body = csv([
    HEADERS,
    [`${tag} din fișier`, "069100091", testEmail("dezactivat", "stocat"), "", "", "", "", "Altă adresă"],
  ]);

  await openImport(page);
  await chooseFile(page, "clienti-dezactivat.csv", body);
  await toVerify(page);

  const duplicate = page.getByTestId("import-duplicate");
  await expect(duplicate).toHaveCount(1);
  await expect(duplicate).toContainText("Există deja ca client dezactivat");
  await expect(duplicate).toContainText("Reactivați-l din fișa clientului înainte de import.");
  await expect(page.getByTestId("import-duplicate-choice").locator('option[value="fill"]')).toBeDisabled();

  await runImport(page);
  expect(await countAt(page, "import-created")).toBe(0);
  expect(await countAt(page, "import-filled")).toBe(0);
  expect(await countAt(page, "import-skipped")).toBe(1);

  expect(await storedById(rest, storedId)).toEqual(before);
  const withTag = await storedByTag(rest, tag);
  expect(withTag, "nu apare niciun al doilea client").toHaveLength(1);
});

test("import clienti: fisa clientului nu are moneda, iar o coloana Moneda din CSV nu scrie nimic", async ({
  page,
}) => {
  // DECIZIA A A CARDULUI P3-123, CORECTATA PE q114: public.clients nu are nicio
  // coloana de monedă, deci acceptanta (d) se verifică drept o DOVADĂ DE ABSENȚĂ,
  // nu o validare de câmp care încă nu există. Cele două lucruri pe care cardul
  // le cere:
  //
  //   1. lista campurilor de import nu are niciun camp de monedă;
  //   2. o coloană "Monedă" dintr-un fișier, cu EUR sau RON scrise pe ea, rămâne
  //      pe "Nu importa" și nu oprește niciun rând.
  //
  // Respingerea EUR si RON cu motiv romanesc care numește MDL este dovedită pe
  // P3-125 (f), unde ecranul chiar are un câmp de monedă.
  expect(
    (CLIENT_IMPORT_FIELDS as readonly string[]).some((f) => /moned|currency/i.test(f)),
    "nu exista camp de moneda in lista de import a clientilor",
  ).toBe(false);

  const rest = await ownerRest();
  const tag = testName("valuta");
  const c = CASE.currency;

  const headers = [...HEADERS, "Monedă"];
  const body = csv([
    headers,
    [`${tag} eur`, `0691000${c}0`, testEmail("valuta", "eur"), "", "", "", "", "", "EUR"],
    [`${tag} ron`, `0691000${c}1`, testEmail("valuta", "ron"), "", "", "", "", "", "RON"],
  ]);

  await openImport(page);
  await chooseFile(page, "clienti-valuta.csv", body);

  // COLOANA "Monedă" NU ARE UNDE SA CADA: potrivirea automata o lasa pe
  // "Nu importa", fiindca niciun camp al clientului nu ii corespunde.
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-2")).toBeVisible();
  const monedaColumn = page.getByTestId("import-column").filter({ hasText: "Monedă" });
  await expect(monedaColumn.getByTestId("import-column-select")).toHaveValue("");

  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-3")).toBeVisible();
  // SI AMANDOUA RANDURILE SE IMPORTA, fiindca moneda nu este un camp validat:
  // EUR si RON scrise acolo nu ajung nicaieri, nu opresc nimic.
  expect(await countAt(page, "import-count-new")).toBe(2);
  expect(await countAt(page, "import-count-error")).toBe(0);

  await runImport(page);
  const stored = await storedByTag(rest, tag);
  expect(stored).toHaveLength(2);
});

test("import clienti: fisa clientului nu are unitate, iar o coloana Unitate din CSV nu scrie nimic", async ({
  page,
}) => {
  // DECIZIA A A CARDULUI P3-123, A DOUA JUMATATE, CORECTATA PE q114: public.clients
  // nu are nicio coloana de unitate de masura, deci acceptanta (e) este, la fel,
  // o dovadă de absență. Cele două lucruri:
  //
  //   1. lista campurilor de import nu are niciun camp de unitate;
  //   2. o coloana "Unitate" dintr-un fisier, cu orice cuvant pe ea, inclusiv
  //      unul inventat, ramane pe "Nu importa" si nu oprește niciun rând.
  //
  // Faptul ca ALL_UNITS tine exact noua unitati (deviatia D3) este dovedit pe
  // P3-125 (b), care le numeste individual, nu numarat de pe un card de clienti.
  expect(
    (CLIENT_IMPORT_FIELDS as readonly string[]).some((f) => /unit/i.test(f)),
    "nu exista camp de unitate in lista de import a clientilor",
  ).toBe(false);

  const rest = await ownerRest();
  const tag = testName("unitate");
  const c = CASE.units;

  const headers = [...HEADERS, "Unitate"];
  const body = csv([
    headers,
    [`${tag} buc`, `0691000${c}0`, testEmail("unitate", "buc"), "", "", "", "", "", "pcs"],
    [`${tag} palet`, `0691000${c}1`, testEmail("unitate", "palet"), "", "", "", "", "", "palet"],
  ]);

  await openImport(page);
  await chooseFile(page, "clienti-unitate.csv", body);

  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-2")).toBeVisible();
  // Selectorul este dupa eticheta exacta a selectului, nu dupa textul coloanei:
  // numele de test al acestui caz contine cuvantul "unitate" si apare in
  // valorile exemplu ale coloanelor Denumire si Email, deci filtrul pe text
  // gaseste trei coloane si cade pe strict mode.
  await expect(page.getByLabel("Câmpul pentru coloana Unitate", { exact: true })).toHaveValue("");

  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-3")).toBeVisible();
  expect(await countAt(page, "import-count-new")).toBe(2);
  expect(await countAt(page, "import-count-error")).toBe(0);

  await runImport(page);
  const stored = await storedByTag(rest, tag);
  expect(stored, "unitatea valida si cea inventata se importa la fel, fiindca niciuna nu este citita").toHaveLength(2);
});

test("import clienti: fisierul de erori are coloana Motiv si un rand pentru fiecare rand respins", async ({
  page,
}) => {
  const tag = testName("motiv");
  const c = CASE.motiv;

  const body = csv([
    HEADERS,
    ["", `0691000${c}0`, testEmail("motiv", "unu"), "", "fără nume", "", "", ""],
    [`${tag} bun`, `0691000${c}1`, testEmail("motiv", "doi"), "", "", "", "", ""],
  ]);

  await openImport(page);
  await chooseFile(page, "clienti-motiv.csv", body);
  await toVerify(page);
  await runImport(page);
  expect(await countAt(page, "import-skipped")).toBe(1);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("import-download-skipped").click(),
  ]);
  expect(download.suggestedFilename()).toBe("randuri-nepreluate-clienti.csv");
  const text = await readFile(await download.path(), "utf8");
  const rows = parseCsv(text);

  expect(rows[0]).toEqual(["Rând", "Motiv", ...HEADERS]);
  const skippedRow = rows.find((r) => r[1] === "Denumire lipsește.");
  expect(skippedRow, "randul nepreluat este in fisier, cu motivul lui").toBeTruthy();
});

// ---------------------------------------------------------------------------
// Modelul descarcat, acelasi standard ca la leaduri (P3-122)
// ---------------------------------------------------------------------------

test("import clienti: modelul descarcat are antetele, un rand exemplu si Denumire marcata obligatorie", async ({
  page,
}) => {
  const expected = parseCsv(templateCsv());
  expect(expected, "antetul plus un rand exemplu").toHaveLength(2);
  const [header, example] = expected as [string[], string[]];

  expect(header[0]).toBe("Denumire *");
  expect(header.filter((h) => h.endsWith(" *")), "o singura coloana marcata").toHaveLength(1);
  expect(header, "cate campuri, atatea coloane in antet").toHaveLength(CLIENT_IMPORT_FIELDS.length);
  expect(example, "randul exemplu are aceleasi coloane ca antetul").toHaveLength(header.length);
  expect(example[0], "exemplul are o denumire scrisa").not.toBe("");

  await openImport(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("import-template").click(),
  ]);
  expect(download.suggestedFilename()).toBe("sablon-clienti.csv");
  const text = await readFile(await download.path(), "utf8");
  expect(parseCsv(text), "fisierul descarcat este exact ce arata functia").toEqual(expected);

  await chooseFile(page, "sablon-clienti.csv", text);
  await toVerify(page);
  expect(await countAt(page, "import-count-error"), "randul exemplu nu cade la nicio verificare").toBe(0);
});

// ---------------------------------------------------------------------------
// Randuri FARA email: se potrivesc dupa nume si telefon
// ---------------------------------------------------------------------------

test("import clienti: acelasi fisier incarcat de doua ori nu dubleaza randurile fara email", async ({
  page,
}) => {
  const rest = await ownerRest();
  const tag = testName("faraemail");
  const body = csv([
    HEADERS,
    [`${tag} unu`, "069200001", "", "", "", "", "", ""],
    [`${tag} doi`, "069200002", "", "", "", "", "", ""],
  ]);

  await openImport(page);
  await chooseFile(page, "clienti-fara-email.csv", body);
  await toVerify(page);
  expect(await countAt(page, "import-count-new")).toBe(2);
  await runImport(page);
  expect(await countAt(page, "import-created")).toBe(2);

  await openImport(page);
  await chooseFile(page, "clienti-fara-email.csv", body);
  await toVerify(page);
  expect(await countAt(page, "import-count-new")).toBe(0);
  expect(await countAt(page, "import-count-duplicate")).toBe(2);
  await runImport(page);
  expect(await countAt(page, "import-created")).toBe(0);

  expect(await storedByTag(rest, tag)).toHaveLength(2);
});

test("import clienti: doua randuri identice fara email in acelasi fisier dau unul nou si un dublat", async ({
  page,
}) => {
  const rest = await ownerRest();
  const tag = testName("faraemail-fisier");
  const body = csv([
    HEADERS,
    [`${tag} unu`, "069300001", "", "", "", "", "", ""],
    [`${tag}  UNU`, "069300001", "", "", "", "", "", ""],
  ]);

  await openImport(page);
  await chooseFile(page, "clienti-identice.csv", body);
  await toVerify(page);
  expect(await countAt(page, "import-count-new")).toBe(1);
  expect(await countAt(page, "import-count-duplicate")).toBe(1);
  await runImport(page);
  expect(await countAt(page, "import-created")).toBe(1);

  expect(await storedByTag(rest, tag)).toHaveLength(1);
});

test("import clienti: telefonul scris 069... si +373 69... este acelasi numar", async ({ page }) => {
  const rest = await ownerRest();
  const tag = testName("faraemail-telefon");
  const body = csv([
    HEADERS,
    [`${tag} unu`, "069400123", "", "", "", "", "", ""],
    [`${tag} unu`, "+373 69 400 123", "", "", "", "", "", ""],
  ]);

  await openImport(page);
  await chooseFile(page, "clienti-telefon.csv", body);
  await toVerify(page);
  expect(await countAt(page, "import-count-new")).toBe(1);
  expect(await countAt(page, "import-count-duplicate")).toBe(1);
  await runImport(page);
  expect(await storedByTag(rest, tag)).toHaveLength(1);
});

test("import clienti: acelasi nume cu alt telefon, fara email, sunt doi clienti noi", async ({
  page,
}) => {
  const rest = await ownerRest();
  const tag = testName("faraemail-alt-telefon");
  const body = csv([
    HEADERS,
    [`${tag} unu`, "069500001", "", "", "", "", "", ""],
    [`${tag} unu`, "069500002", "", "", "", "", "", ""],
  ]);

  await openImport(page);
  await chooseFile(page, "clienti-alt-telefon.csv", body);
  await toVerify(page);
  expect(await countAt(page, "import-count-new")).toBe(2);
  expect(await countAt(page, "import-count-duplicate")).toBe(0);
  await runImport(page);
  expect(await countAt(page, "import-created")).toBe(2);

  expect(await storedByTag(rest, tag)).toHaveLength(2);
});
