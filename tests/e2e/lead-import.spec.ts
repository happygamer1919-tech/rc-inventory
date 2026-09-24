import { readFile } from "node:fs/promises";
import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// lead-import.spec - linia de acceptanta a cardului P3-101, goal G58.
//
// FIXTURILE SUNT INVENTATE AICI, CU MANA. In productie exista date reale de
// client de pe 2026-09-14, deci niciun nume, telefon sau email al unui om
// adevarat nu ajunge in acest fisier, nici intr-un commit si nici intr-un pull
// request. Fiecare rand de aici poarta prefixul TEST si un sufix unic pe rulare.
//
// TELEFOANELE SUNT UNICE PE RULARE, si asta nu este cosmetica: importul cauta
// dublatul dupa telefonul normalizat PRINTRE TOTI CLIENTII STOCATI, iar baza de
// test pastreaza randurile rularilor de dinainte. Un numar fix ar face ca a doua
// rulare sa gaseasca prima si sa dovedeasca altceva decat crede.
//
// SE CITESTE DIN RANDURILE STOCATE, NU DE PE ECRAN, prin PostgREST, cu jetonul
// administratorului: ecranul poate arata un numar pe care baza nu l-a primit.
//
// DATELE DE TEST NU SE STERG NICIODATA, ca peste tot in aceasta suita.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

/** Cinci cifre care fac telefoanele rularii unice. */
const RUN5 = String(Math.floor(Math.random() * 90000) + 10000);

/** Numar moldovenesc local, scris cum il scrie un om: 0 urmat de opt cifre. */
function localPhone(n: number): string {
  return `069${RUN5}${n}`;
}

/** Acelasi numar in forma pe care o stocheaza importul. */
function canonicalPhone(n: number): string {
  return `+37369${RUN5}${n}`;
}

function testEmail(label: string): string {
  return `test.${RUN}.${label}@example.test`;
}

function testName(label: string): string {
  return `TEST ${RUN} ${label}`;
}

// ---------------------------------------------------------------------------
// Legatura directa la baza, ca administratorul
// ---------------------------------------------------------------------------

type OwnerRest = { api: APIRequestContext; headers: Record<string, string>; userId: string };

async function ownerRest(): Promise<OwnerRest> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  expect(url, "P3-101 are nevoie de NEXT_PUBLIC_SUPABASE_URL").not.toBe("");
  expect(anonKey, "P3-101 are nevoie de NEXT_PUBLIC_SUPABASE_ANON_KEY").not.toBe("");

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
  source: string | null;
  interest: string | null;
  owner_id: string | null;
  address: string | null;
  notes: string | null;
};

const STORED_COLUMNS = "id,name,phone,email,stage,source,interest,owner_id,address,notes";

/** Randurile unei etichete, oricare ar fi ele, dupa denumire. */
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

/** Notele unui client, cele mai noi primele. */
async function notesOf(rest: OwnerRest, clientId: string): Promise<{ body: string }[]> {
  return restGet(
    rest,
    `/rest/v1/client_notes?select=body&client_id=eq.${clientId}&order=created_at.desc`,
  );
}

/** Numele complet al administratorului, exact cum il arata lista de responsabili. */
async function ownerFullName(rest: OwnerRest): Promise<string> {
  const rows = await restGet<{ full_name: string | null; email: string | null }[]>(
    rest,
    `/rest/v1/profiles?select=full_name,email&id=eq.${rest.userId}`,
  );
  const profile = rows[0]!;
  return profile.full_name?.trim() || profile.email?.trim() || "Fără nume";
}

/** Creeaza un client de fixtura prin PostgREST, nu prin formular. */
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

/** Scrie un CSV cu virgula, ghilimele unde trebuie. Scris cu mana AICI si nu
 *  importat din aplicatie: un test care importa scriitorul pe care il verifica
 *  dovedeste doar ca acela este egal cu el insusi. */
function csv(rows: string[][]): string {
  return rows
    .map((row) =>
      row.map((cell) => (/[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(","),
    )
    .join("\r\n");
}

async function openImport(page: Page): Promise<void> {
  await page.goto("/clienti?vedere=leaduri");
  await expect(page.getByTestId("leaduri-import")).toBeVisible();
  await page.getByTestId("leaduri-import").click();
  await expect(page.getByTestId("lead-import")).toBeVisible();
  await expect(page.getByTestId("import-step-1")).toBeVisible();
}

async function chooseFile(page: Page, name: string, body: string): Promise<void> {
  await page.getByTestId("import-file").setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(body, "utf8"),
  });
}

/** Din pasul 1 pana la pasul 3, prin potrivirea automata a coloanelor. */
async function toVerify(page: Page): Promise<void> {
  await expect(page.getByTestId("import-read")).toBeVisible();
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-2")).toBeVisible();
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-3")).toBeVisible();
}

/** Din pasul 3 pana la rezumat, cu sursa aleasa daca este ceruta. */
async function runImport(page: Page, source?: string): Promise<void> {
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-4")).toBeVisible();
  if (source !== undefined) await page.getByTestId("import-source").selectOption(source);
  await page.getByTestId("import-run").click();
  await expect(page.getByTestId("import-summary")).toBeVisible({ timeout: 60_000 });
}

async function countAt(page: Page, testId: string): Promise<number> {
  return Number((await page.getByTestId(testId).innerText()).trim());
}

const HEADERS = [
  "Denumire",
  "Telefon",
  "Email",
  "Etapă",
  "Interes",
  "Responsabil",
  "Data de reluare",
  "Adresă",
];

// ---------------------------------------------------------------------------
// Cazurile
// ---------------------------------------------------------------------------

test.beforeEach(async ({ page }) => {
  await signIn(page, ownerAccount());
});

test("G58: un CSV se importa si fiecare lead creat poarta nota de import", async ({ page }) => {
  const rest = await ownerRest();
  const responsible = await ownerFullName(rest);
  const tag = testName("import");

  const fileName = "leaduri-test.csv";
  const body = csv([
    HEADERS,
    [`${tag} unu`, localPhone(1), "", "Lead rece", "acoperiș", responsible, "", "Chișinău"],
    [`${tag} doi`, "", testEmail("doi"), "În cultivare", "țiglă", responsible, "", ""],
    [`${tag} trei`, localPhone(3), "", "De reluat", "jgheaburi", "", "14.03.2027", ""],
  ]);

  await openImport(page);
  await chooseFile(page, fileName, body);
  await toVerify(page);

  expect(await countAt(page, "import-count-new")).toBe(3);
  expect(await countAt(page, "import-count-duplicate")).toBe(0);
  expect(await countAt(page, "import-count-error")).toBe(0);

  await runImport(page, "recomandare");
  expect(await countAt(page, "import-created")).toBe(3);
  expect(await countAt(page, "import-skipped")).toBe(0);

  const stored = await storedByTag(rest, tag);
  expect(stored.map((c) => c.name)).toEqual([`${tag} doi`, `${tag} trei`, `${tag} unu`]);

  const unu = stored.find((c) => c.name === `${tag} unu`)!;
  expect(unu.stage).toBe("cold");
  expect(unu.phone).toBe(canonicalPhone(1));
  expect(unu.source).toBe("recomandare");
  expect(unu.interest).toBe("acoperiș");
  expect(unu.owner_id).toBe(rest.userId);
  expect(unu.address).toBe("Chișinău");

  const doi = stored.find((c) => c.name === `${tag} doi`)!;
  expect(doi.stage).toBe("nurture");
  expect(doi.email).toBe(testEmail("doi"));
  expect(doi.owner_id).toBe(rest.userId);

  const trei = stored.find((c) => c.name === `${tag} trei`)!;
  expect(trei.stage).toBe("follow_up");
  // Fara responsabil in fisier: coloana ramane goala, nu se pune administratorul.
  expect(trei.owner_id).toBeNull();

  // FIECARE LEAD CREAT POARTA NOTA DE IMPORT, prin calea de note a lui G45.
  for (const client of stored) {
    const notes = await notesOf(rest, client.id);
    const imported = notes.filter((n) => n.body.startsWith("Importat din "));
    expect(imported, `nota de import pentru ${client.name}`).toHaveLength(1);
    expect(imported[0]!.body).toContain(fileName);
  }
});

test("G58: XLSX cere salvarea ca CSV, in romana", async ({ page }) => {
  await openImport(page);

  await page.getByTestId("import-file").setInputFiles({
    name: "leaduri.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("PK\u0003\u0004 nu este citit de nimeni", "utf8"),
  });

  const message = page.getByTestId("import-error");
  await expect(message).toBeVisible();
  await expect(message).toContainText("Fișierele Excel (.xlsx) nu pot fi citite încă.");
  await expect(message).toContainText("Salvare ca");
  await expect(message).toContainText("CSV");

  // Nimic nu porneste: butonul de continuare ramane oprit si pasul nu se schimba.
  await expect(page.getByTestId("import-next")).toBeDisabled();
  await expect(page.getByTestId("import-step-1")).toBeVisible();
  await expect(page.getByTestId("import-read")).toHaveCount(0);
});

test("G58: dublatul se sare peste, iar completarea umple numai golurile", async ({ page }) => {
  const rest = await ownerRest();
  const tag = testName("dubl");

  // Un client stocat cu telefonul scris LOCAL si fara interes, si unul cu email
  // scris cu majuscule. Amandoua trebuie sa fie gasite dupa forma normalizata.
  const storedPhoneId = await seedClient(rest, {
    name: `${tag} telefon`,
    phone: localPhone(1),
    address: "Bălți",
  });
  const storedEmailId = await seedClient(rest, {
    name: `${tag} email`,
    email: testEmail("stocat").toUpperCase(),
  });

  const before = {
    phone: await storedById(rest, storedPhoneId),
    email: await storedById(rest, storedEmailId),
  };

  const first = csv([
    HEADERS,
    // Acelasi telefon, scris international si cu spatii.
    [`${tag} din fisier A`, `+373 69 ${RUN5}1`, "", "", "interes nou", "", "", "Orhei"],
    // Acelasi email, scris cu litere mici.
    [`${tag} din fisier B`, "", testEmail("stocat"), "", "", "", "", ""],
    // Doua randuri ale aceluiasi om IN ACELASI FISIER.
    [`${tag} din fisier C`, localPhone(7), "", "", "", "", "", ""],
    [`${tag} din fisier C bis`, localPhone(7), "", "", "interes bis", "", "", ""],
  ]);

  await openImport(page);
  await chooseFile(page, "dublate.csv", first);
  await toVerify(page);

  // Trei dublate: doua fata de baza, unul fata de randul de mai sus.
  expect(await countAt(page, "import-count-duplicate")).toBe(3);
  expect(await countAt(page, "import-count-new")).toBe(1);
  await expect(page.getByTestId("import-duplicate")).toHaveCount(3);
  await expect(
    page.getByTestId("import-duplicate").filter({ hasText: "din același fișier" }),
  ).toHaveCount(1);

  // IMPLICITUL ESTE "Sari peste", pe fiecare dintre ele, fara sa fie ales.
  const choices = page.getByTestId("import-duplicate-choice");
  for (let i = 0; i < 3; i += 1) await expect(choices.nth(i)).toHaveValue("skip");

  await runImport(page);
  expect(await countAt(page, "import-created")).toBe(1);
  expect(await countAt(page, "import-filled")).toBe(0);
  expect(await countAt(page, "import-skipped")).toBe(3);

  // CELE DOUA RANDURI STOCATE SUNT NEATINSE, camp cu camp.
  expect(await storedById(rest, storedPhoneId)).toEqual(before.phone);
  expect(await storedById(rest, storedEmailId)).toEqual(before.email);
  // Si omul dublat in fisier a intrat o singura data.
  const cRows = await storedByTag(rest, `${tag} din fisier C`);
  expect(cRows).toHaveLength(1);
  expect(cRows[0]!.name).toBe(`${tag} din fisier C`);

  // A DOUA TRECERE: completarea campurilor goale, pe randul cu telefonul.
  const second = csv([
    HEADERS,
    [
      `${tag} alt nume cu totul`,
      `+373 69 ${RUN5}1`,
      testEmail("completat"),
      "",
      "interes completat",
      "",
      "",
      "Adresă nouă care nu trebuie scrisă",
    ],
  ]);

  await openImport(page);
  await chooseFile(page, "completare.csv", second);
  await toVerify(page);
  await expect(page.getByTestId("import-duplicate")).toHaveCount(1);
  await page.getByTestId("import-duplicate-choice").selectOption("fill");
  await runImport(page);

  expect(await countAt(page, "import-filled")).toBe(1);
  expect(await countAt(page, "import-created")).toBe(0);

  const after = await storedById(rest, storedPhoneId);
  // GOLURILE S-AU COMPLETAT: emailul si interesul erau NULL si acum nu mai sunt.
  expect(after.email).toBe(testEmail("completat"));
  expect(after.interest).toBe("interes completat");
  // CE ERA SCRIS A RAMAS CUM ERA: denumirea, adresa si telefonul nu se ating.
  expect(after.name).toBe(before.phone.name);
  expect(after.address).toBe("Bălți");
  expect(after.phone).toBe(before.phone.phone);
  expect(after.stage).toBe(before.phone.stage);
});

test("G58: un rand fara denumire este raportat, sarit si descarcabil", async ({ page }) => {
  const rest = await ownerRest();
  const tag = testName("eroare");

  const body = csv([
    HEADERS,
    [`${tag} bun unu`, localPhone(1), "", "", "", "", "", ""],
    ["", localPhone(2), "", "", "fără nume", "", "", ""],
    [`${tag} bun doi`, localPhone(3), "", "", "", "", "", ""],
  ]);

  await openImport(page);
  await chooseFile(page, "cu-eroare.csv", body);
  await toVerify(page);

  expect(await countAt(page, "import-count-error")).toBe(1);
  const errorRow = page.getByTestId("import-error-row");
  await expect(errorRow).toHaveCount(1);
  await expect(errorRow).toContainText("Rândul nu are denumire.");
  // Randul 1 este antetul, deci randul fara denumire este al treilea din fisier.
  await expect(errorRow).toHaveAttribute("data-line", "3");

  await runImport(page);
  expect(await countAt(page, "import-created")).toBe(2);
  expect(await countAt(page, "import-skipped")).toBe(1);

  // RESTUL FISIERULUI S-A IMPORTAT ORICUM.
  const stored = await storedByTag(rest, `${tag} bun`);
  expect(stored.map((c) => c.name)).toEqual([`${tag} bun doi`, `${tag} bun unu`]);
  // Si randul refuzat nu a intrat pe nicio cale.
  const orphan = await restGet<{ id: string }[]>(
    rest,
    `/rest/v1/clients?select=id&phone=eq.${encodeURIComponent(canonicalPhone(2))}`,
  );
  expect(orphan).toHaveLength(0);

  // FISIERUL RANDURILOR NEPRELUATE il duce inapoi operatorului, cu motivul.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("import-download-skipped").click(),
  ]);
  expect(download.suggestedFilename()).toBe("randuri-nepreluate.csv");
  const text = await readFile(await download.path(), "utf8");
  expect(text).toContain("Rândul nu are denumire.");
  expect(text).toContain(localPhone(2));
  expect(text).toContain("fără nume");
});

test("G58: numerele din rezumat sunt cele scrise", async ({ page }) => {
  const rest = await ownerRest();
  const tag = testName("numere");

  const existingId = await seedClient(rest, { name: `${tag} stocat`, phone: localPhone(1) });

  const body = csv([
    HEADERS,
    [`${tag} nou unu`, localPhone(2), "", "", "", "", "", ""],
    [`${tag} nou doi`, localPhone(3), "", "", "", "", "", ""],
    [`${tag} dublat`, localPhone(1), "", "", "", "", "", ""],
    ["", localPhone(4), "", "", "", "", "", ""],
    [`${tag} data rea`, localPhone(5), "", "De reluat", "", "", "32.13.2027", ""],
  ]);

  await openImport(page);
  await chooseFile(page, "numere.csv", body);
  await toVerify(page);
  await runImport(page);

  const created = await countAt(page, "import-created");
  const filled = await countAt(page, "import-filled");
  const skipped = await countAt(page, "import-skipped");
  expect({ created, filled, skipped }).toEqual({ created: 2, filled: 0, skipped: 3 });

  // NUMERELE SUNT CELE SCRISE, citite din baza si nu de pe ecran.
  const written = await storedByTag(rest, `${tag} nou`);
  expect(written).toHaveLength(created);
  let withNote = 0;
  for (const client of written) {
    const notes = await notesOf(rest, client.id);
    if (notes.some((n) => n.body.startsWith("Importat din "))) withNote += 1;
  }
  expect(withNote).toBe(created);

  // Nimic nu s-a scris pe randul dublat si niciun rand cu eroare nu a intrat.
  const stored = await storedById(rest, existingId);
  expect(stored.name).toBe(`${tag} stocat`);
  const refused = await storedByTag(rest, `${tag} data rea`);
  expect(refused).toHaveLength(0);
});

test("G58: cei patru pasi la 390x844", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const tag = testName("telefon");

  const body = csv([
    HEADERS,
    [`${tag} unu`, localPhone(1), "", "", "un interes destul de lung ca sa se rupa pe randuri", "", "", ""],
  ]);

  const sheet = page.getByTestId("lead-import");

  /** Latimea paginii nu depaseste ecranul, tintele sunt de 44px si campurile de 16px. */
  async function checkStep(label: string): Promise<void> {
    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return { scroll: root.scrollWidth, client: root.clientWidth };
    });
    expect(overflow.scroll, `${label}: latimea paginii`).toBeLessThanOrEqual(overflow.client);

    const targets = sheet.locator("button:visible, a:visible");
    const count = await targets.count();
    expect(count, `${label}: are tinte de atins`).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      const box = await targets.nth(i).boundingBox();
      const text = (await targets.nth(i).innerText()).trim().slice(0, 30);
      expect(box?.height ?? 0, `${label}: tinta "${text}"`).toBeGreaterThanOrEqual(44);
    }

    const fields = sheet.locator("input:visible, select:visible, textarea:visible");
    const fieldCount = await fields.count();
    for (let i = 0; i < fieldCount; i += 1) {
      const size = await fields
        .nth(i)
        .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
      expect(size, `${label}: marimea textului din camp`).toBeGreaterThanOrEqual(16);
      const box = await fields.nth(i).boundingBox();
      expect(box?.height ?? 0, `${label}: inaltimea campului`).toBeGreaterThanOrEqual(44);
    }
  }

  await openImport(page);
  await checkStep("pasul 1, gol");
  await chooseFile(page, "telefon.csv", body);
  await expect(page.getByTestId("import-read")).toBeVisible();
  await checkStep("pasul 1, cu fisier");

  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-2")).toBeVisible();
  await checkStep("pasul 2");

  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-3")).toBeVisible();
  await checkStep("pasul 3");

  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-4")).toBeVisible();
  await checkStep("pasul 4");

  // Ecranul se inchide fara sa fi scris nimic: pasul 4 nu scrie pana la buton.
  await page.getByTestId("import-back").click();
  await expect(page.getByTestId("import-step-3")).toBeVisible();
});
