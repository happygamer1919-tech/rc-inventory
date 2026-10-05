import { readFile } from "node:fs/promises";
import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { parseCsv, templateCsv, CLIENT_IMPORT_FIELDS } from "@/lib/data/client-import-types";

// clients-export.spec - linia de acceptanta a cardului P3-127, goal G71.
//
// FIXTURILE SUNT INVENTATE AICI, CU MANA. In productie exista date reale de client, deci
// niciun nume, telefon sau email al unui om adevarat nu ajunge in acest fisier. Fiecare
// rand poarta prefixul TEST si un sufix unic pe rulare, iar cautarea listei pe acel sufix
// este FILTRUL fiecarui caz: baza nu este goala, deci "exportul tuturor" ar scoate si
// randurile altor rulari.
//
// DATELE DE TEST NU SE STERG NICIODATA, ca peste tot in aceasta suita.
//
// "REIMPORT IN UN MAGAZIN GOL" SE FACE PRIN IDENTITATE NOUA, nu prin stergere: importul de
// clienti recunoaste un dublat dupa email, iar IDNO-ul este unic, deci aceleasi randuri nu
// s-ar crea a doua oara. Fisierul exportat se reimporta cu numele, emailul, telefonul si
// IDNO-ul mutate pe seria B, iar TOATE celelalte campuri se compara una cate una cu
// originalul. Separat, fisierul NEATINS se reimporta si trebuie sa dea numai dublate.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const RUN4 = String(Math.floor(Math.random() * 9000) + 1000);

/** Cifra fiecarui caz si a seriei de reimport. Telefoanele si IDNO-urile a doua serii nu se
 *  ating niciodata. */
const SERIES = { a: 1, b: 2, filter: 3, bom: 5, headers: 6, inactive: 7 } as const;

const phone = (series: number, n: number): string => `+37368${RUN4}${series}${n}`;
const fiscal = (series: number, n: number): string => `1003${RUN4}${series}${n}`;
const email = (label: string, n: number): string => `test.${RUN}.${label}.${n}@example.test`;
const tagOf = (label: string): string => `TEST ${RUN} cl ${label}`;

// ---------------------------------------------------------------------------
// Legatura directa la baza, ca administratorul
// ---------------------------------------------------------------------------

type OwnerRest = { api: APIRequestContext; headers: Record<string, string>; userId: string };

async function ownerRest(): Promise<OwnerRest> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  expect(url, "P3-127 are nevoie de NEXT_PUBLIC_SUPABASE_URL").not.toBe("");
  expect(anonKey, "P3-127 are nevoie de NEXT_PUBLIC_SUPABASE_ANON_KEY").not.toBe("");

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

async function seedClients(rest: OwnerRest, rows: Record<string, unknown>[]): Promise<string[]> {
  // UN RAND PE CERERE: PostgREST cere ca toate obiectele unei cereri in lot sa aiba
  // aceleasi chei (PGRST102), iar clientii de aici au campuri diferite.
  const ids: string[] = [];
  for (const row of rows) {
    const created = await rest.api.post("/rest/v1/clients", {
      headers: { ...rest.headers, Prefer: "return=representation" },
      data: [row],
    });
    expect(created.status(), await created.text()).toBe(201);
    ids.push(((await created.json()) as { id: string }[])[0]!.id);
  }
  return ids;
}

/** Un client asa cum il tine baza, in cele treisprezece campuri ale importului. */
type Stored = {
  name: string;
  type: string;
  phone: string | null;
  email: string | null;
  interest: string | null;
  source: string | null;
  owner_id: string | null;
  stage: string;
  follow_up_date: string | null;
  next_action: string | null;
  notes: string | null;
  address: string | null;
  fiscal_code: string | null;
};

const COLUMNS =
  "name,type,phone,email,interest,source,owner_id,stage,follow_up_date,next_action,notes,address,fiscal_code";

async function storedByTag(rest: OwnerRest, tag: string): Promise<Stored[]> {
  return restGet<Stored[]>(
    rest,
    `/rest/v1/clients?select=${COLUMNS}&name=like.${encodeURIComponent(`${tag}*`)}&order=name.asc`,
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

/** Deschide Clienți cu filtrele date, apasa Exporta CSV si intoarce fisierul descarcat. */
async function exportView(
  page: Page,
  params: Record<string, string>,
): Promise<{ bytes: Buffer; text: string; name: string }> {
  const search = new URLSearchParams(params);
  await page.goto(`/clienti?${search.toString()}`);
  await expect(page.getByTestId("clienti-export")).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("clienti-export").click(),
  ]);
  const bytes = await readFile(await download.path());
  return { bytes, text: bytes.toString("utf8"), name: download.suggestedFilename() };
}

/** Datele fisierului, fara BOM si fara antet. */
function dataRows(text: string): string[][] {
  return parseCsv(text).slice(1);
}

async function importFile(page: Page, name: string, body: string): Promise<void> {
  await page.goto("/clienti");
  await page.getByTestId("clienti-import").click();
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

async function countAt(page: Page, testId: string): Promise<number> {
  return Number((await page.getByTestId(testId).innerText()).trim());
}

const LABELS = [
  "Denumire *",
  "Tip",
  "Telefon",
  "Email",
  "Interes",
  "Sursă",
  "Responsabil",
  "Etapă",
  "Data de reluare",
  "Următorul pas",
  "Note",
  "Adresă",
  "IDNO",
];

test.beforeEach(async ({ page }) => {
  await signIn(page, ownerAccount());
});

// ---------------------------------------------------------------------------
// Cazurile
// ---------------------------------------------------------------------------

test("export clienti: export apoi import produce inregistrari identice", async ({ page }) => {
  const rest = await ownerRest();
  const tagA = tagOf("rta");
  const tagB = tagOf("rtb");
  const a = SERIES.a;

  // Patru clienti care ating fiecare comportament al importului: virgula, ghilimele si rand
  // nou in text, diacritice, persoana fizica, patru etape, patru surse, cu si fara
  // responsabil, data de reluare. Fiecare are email: e cheia de dublare a importului.
  await seedClients(rest, [
    {
      name: `${tagA} Țiglă, "Prima" SRL`,
      type: "company",
      phone: phone(a, 1),
      email: email("rta", 1),
      interest: "acoperiș din țiglă metalică",
      source: "recomandare",
      owner_id: rest.userId,
      stage: "client",
      next_action: "Trimite oferta, apoi sună",
      notes: 'prima linie\na doua linie, cu virgulă și "ghilimele"',
      address: "Chișinău, str. Ștefan cel Mare 1",
      fiscal_code: fiscal(a, 1),
    },
    {
      name: `${tagA} Șura Mică`,
      type: "individual",
      email: email("rta", 2),
      interest: "jgheaburi și burlane",
      source: "vizita",
      stage: "nurture",
      address: "Bălți",
    },
    {
      name: `${tagA} Reluare`,
      type: "company",
      phone: phone(a, 3),
      email: email("rta", 3),
      source: "telefon",
      stage: "follow_up",
      follow_up_date: "2027-03-14",
      notes: "sună după Paște",
    },
    {
      name: `${tagA} Ofertat`,
      type: "company",
      phone: phone(a, 4),
      email: email("rta", 4),
      source: "site",
      owner_id: rest.userId,
      stage: "quoted",
      fiscal_code: fiscal(a, 4),
    },
  ]);

  const original = await storedByTag(rest, tagA);
  expect(original).toHaveLength(4);

  // 1. EXPORTUL: numai randurile seriei A, prin cautarea listei.
  const exported = await exportView(page, { q: tagA });
  expect(exported.name).toBe("clienti.csv");
  const rows = dataRows(exported.text);
  expect(rows).toHaveLength(4);

  // 2. FISIERUL NEATINS, REIMPORTAT: fiecare rand este un dublat al celui din baza, nu se
  //    creeaza nimic. Asa se dovedeste ca regula de dublare recunoaste ce tocmai a scris
  //    exportul.
  await importFile(page, "clienti-export.csv", exported.text);
  expect(await countAt(page, "import-count-new")).toBe(0);
  expect(await countAt(page, "import-count-duplicate")).toBe(4);
  expect(await countAt(page, "import-count-error")).toBe(0);

  // 3. SERIA B: acelasi fisier cu numele, emailul, telefonul si IDNO-ul mutate pe seria B,
  //    ca importul sa creeze randuri noi. Celelalte campuri raman cum au iesit.
  const col = (field: (typeof CLIENT_IMPORT_FIELDS)[number]): number =>
    CLIENT_IMPORT_FIELDS.indexOf(field);
  const moved = rows.map((row) => {
    const copy = [...row];
    copy[col("name")] = copy[col("name")]!.replace(tagA, tagB);
    const p = copy[col("phone")]!;
    if (p !== "") copy[col("phone")] = phone(SERIES.b, Number(p.slice(-1)));
    copy[col("email")] = copy[col("email")]!.replace(".rta.", ".rtb.");
    const f = copy[col("fiscalCode")]!;
    if (f !== "") copy[col("fiscalCode")] = fiscal(SERIES.b, Number(f.slice(-1)));
    return copy;
  });
  const secondFile = csv([parseCsv(exported.text)[0]!, ...moved]);

  await importFile(page, "clienti-export-b.csv", secondFile);
  expect(await countAt(page, "import-count-new")).toBe(4);
  expect(await countAt(page, "import-count-error")).toBe(0);
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-4")).toBeVisible();
  await page.getByTestId("import-run").click();
  await expect(page.getByTestId("import-summary")).toBeVisible({ timeout: 60_000 });
  expect(await countAt(page, "import-created")).toBe(4);

  // 4. EGALITATE CAMP CU CAMP, din randurile stocate si nu de pe ecran.
  const reimported = await storedByTag(rest, tagB);
  expect(reimported).toHaveLength(4);

  const expected = original.map((client) => ({
    ...client,
    name: client.name.replace(tagA, tagB),
    phone: client.phone ? phone(SERIES.b, Number(client.phone.slice(-1))) : client.phone,
    email: client.email ? client.email.replace(".rta.", ".rtb.") : client.email,
    fiscal_code: client.fiscal_code
      ? fiscal(SERIES.b, Number(client.fiscal_code.slice(-1)))
      : client.fiscal_code,
  }));
  // Aceeasi ordine: dupa denumire, iar sufixul de serie nu schimba ordinea relativa.
  expect(reimported).toEqual(expected);
});

test("export clienti: exportul respecta filtrele curente", async ({ page }) => {
  const rest = await ownerRest();
  const tag = tagOf("fil");
  const c = SERIES.filter;

  await seedClients(rest, [
    { name: `${tag} unu`, type: "company", phone: phone(c, 1), stage: "client" },
    { name: `${tag} doi`, type: "individual", phone: phone(c, 2), stage: "client" },
    { name: `${tag} trei`, type: "company", phone: phone(c, 3), stage: "cold" },
    { name: `${tag} patru`, type: "individual", phone: phone(c, 4), stage: "quoted" },
  ]);
  // Un rand care nu poarta eticheta: nu trebuie sa apara in niciun export de mai jos.
  await seedClients(rest, [
    { name: `TEST ${RUN} cl altul fil`, type: "company", phone: phone(c, 5), stage: "client" },
  ]);

  const names = (text: string): string[] =>
    dataRows(text)
      .map((r) => r[0]!)
      .sort();

  const all = await exportView(page, { q: tag });
  expect(names(all.text)).toEqual([`${tag} doi`, `${tag} patru`, `${tag} trei`, `${tag} unu`]);

  const byType = await exportView(page, { q: tag, tip: "individual" });
  expect(names(byType.text)).toEqual([`${tag} doi`, `${tag} patru`]);

  const byView = await exportView(page, { q: tag, vedere: "clienti" });
  expect(names(byView.text)).toEqual([`${tag} doi`, `${tag} unu`]);

  const both = await exportView(page, { q: tag, vedere: "clienti", tip: "individual" });
  expect(names(both.text)).toEqual([`${tag} doi`]);
});

test("export clienti: un client dezactivat apare in fisier numai cand filtrul il arata", async ({
  page,
}) => {
  const rest = await ownerRest();
  const tag = tagOf("dez");
  const c = SERIES.inactive;

  await seedClients(rest, [
    { name: `${tag} activ`, type: "company", phone: phone(c, 1), stage: "client", active: true },
    { name: `${tag} dezactivat`, type: "company", phone: phone(c, 2), stage: "client", active: false },
  ]);

  const names = (text: string): string[] =>
    dataRows(text)
      .map((r) => r[0]!)
      .sort();

  // Filtrul implicit arata activii: dezactivatul nu este in fisier.
  const active = await exportView(page, { q: tag });
  expect(names(active.text)).toEqual([`${tag} activ`]);

  // Filtrul care arata dezactivatii: fisierul are numai dezactivatul.
  const inactive = await exportView(page, { q: tag, stare: "inactive" });
  expect(names(inactive.text)).toEqual([`${tag} dezactivat`]);

  // Filtrul Toate: amandoi.
  const all = await exportView(page, { q: tag, stare: "toate" });
  expect(names(all.text)).toEqual([`${tag} activ`, `${tag} dezactivat`]);
});

test("export clienti: fisierul incepe cu marca de ordine a octetilor si diacriticele supravietuiesc", async ({
  page,
}) => {
  const rest = await ownerRest();
  const tag = tagOf("bom");
  const c = SERIES.bom;
  const interest = "Țiglă înlocuită la șură, ăâîșț ĂÂÎȘȚ";

  await seedClients(rest, [
    {
      name: `${tag} Șură`,
      type: "company",
      phone: phone(c, 1),
      stage: "client",
      interest,
      address: "Chișinău, Ștefan cel Mare",
    },
  ]);

  const exported = await exportView(page, { q: tag });
  expect([...exported.bytes.subarray(0, 3)], "EF BB BF").toEqual([0xef, 0xbb, 0xbf]);
  expect(exported.text.startsWith("﻿Denumire"), "un singur BOM, apoi antetul").toBe(true);

  const rows = dataRows(exported.text);
  expect(rows).toHaveLength(1);
  const row = rows[0]!;
  expect(row[CLIENT_IMPORT_FIELDS.indexOf("name")]).toBe(`${tag} Șură`);
  expect(row[CLIENT_IMPORT_FIELDS.indexOf("interest")]).toBe(interest);
  expect(row[CLIENT_IMPORT_FIELDS.indexOf("address")]).toBe("Chișinău, Ștefan cel Mare");
  expect(exported.text).not.toContain("�");
});

test("export clienti: antetele exportului sunt identice cu antetele modelului de import", async ({
  page,
}) => {
  const rest = await ownerRest();
  const tag = tagOf("ant");

  await seedClients(rest, [
    { name: `${tag} unu`, type: "company", phone: phone(SERIES.headers, 1), stage: "client" },
  ]);

  const exported = await exportView(page, { q: tag });
  const header = parseCsv(exported.text)[0];
  const model = parseCsv(templateCsv())[0];

  expect(header, "antetul exportului, ca lista").toEqual(model);
  expect(header, "si ca lista scrisa cu mana").toEqual(LABELS);
});

test("export clienti: se exporta toate randurile filtrului, nu doar pagina vizibila", async ({
  page,
}) => {
  const rest = await ownerRest();
  const tag = tagOf("pag");

  const count = 30;
  await seedClients(
    rest,
    Array.from({ length: count }, (_, i) => ({
      name: `${tag} ${String(i + 1).padStart(2, "0")}`,
      type: "company",
      email: email("pag", i + 1),
      stage: "client",
    })),
  );

  // Pe ecran lista are cel mult o pagina de 25.
  await page.goto(`/clienti?${new URLSearchParams({ q: tag }).toString()}`);
  await expect(page.getByTestId("clienti-export")).toBeVisible();
  expect(await page.locator("tbody tr").count()).toBeLessThanOrEqual(25);

  const exported = await exportView(page, { q: tag });
  const rows = dataRows(exported.text);
  expect(rows, "toate cele 30, nu cele 25 de pe pagina").toHaveLength(count);
  expect(new Set(rows.map((r) => r[0])).size, "fara randuri repetate").toBe(count);
});

test("export clienti: exportul arata nume responsabil chiar cand contul e dezactivat", async ({
  page,
}) => {
  const rest = await ownerRest();
  const tag = tagOf("deact");
  const c = SERIES.inactive;

  const manager = ownerAccount();

  // Creeaza un client cu responsabil care va fi dezactivat.
  await seedClients(rest, [
    {
      name: `${tag} cu responsabil`,
      type: "company",
      phone: phone(c, 1),
      email: email("deact-active", 1),
      stage: "client",
      owner_id: rest.userId,
    },
    {
      name: `${tag} fara responsabil`,
      type: "company",
      phone: phone(c, 2),
      email: email("deact-none", 2),
      stage: "client",
      owner_id: null,
    },
  ]);

  // Dezactiveaza administratorul (care e responsabilul primului client).
  await rest.api.patch(`/rest/v1/profiles?id=eq.${rest.userId}`, {
    headers: rest.headers,
    data: { active: false },
  });

  const exported = await exportView(page, { q: tag });
  const rows = dataRows(exported.text);
  expect(rows).toHaveLength(2);

  const ownerCol = CLIENT_IMPORT_FIELDS.indexOf("ownerName");

  // Primul client are responsabil dezactivat, dar exportul arata email-ul.
  const firstOwnerName = rows[0]![ownerCol];
  expect(firstOwnerName, "raspunditor dezactivat apare in export cu email").toBe(manager.email);

  // Al doilea client n-are responsabil, deci spatiu gol.
  const secondOwnerName = rows[1]![ownerCol];
  expect(secondOwnerName, "lipsa responsabil = spatiu gol").toBe("");
});
