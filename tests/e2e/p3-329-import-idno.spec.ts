import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// P3-329. IDNO-ul este cheie de dublare la importul de clienti, iar completarea nu scrie
// niciodata un IDNO pe care il tine alt client. Cu baza si cu ecranul; planul pur este in
// p3-329-import-idno-plan.spec.ts.
//
// Datele sunt inventate aici, cu eticheta rularii. Clientii de test se dezactiveaza sau
// ramin, nu se sterg.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
// Doar cifre, ca sa nu depinda de litere mari sau mici; unic pe rulare.
const IDNO = String(Date.now()).slice(-13);

const tag = `TEST ${RUN} idno`;
const email = (label: string) => `test.${RUN}.idno.${label}@example.test`;

type OwnerRest = { api: APIRequestContext; headers: Record<string, string> };

async function ownerRest(): Promise<OwnerRest> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  expect(url, "P3-329 are nevoie de NEXT_PUBLIC_SUPABASE_URL").not.toBe("");
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

async function seedClient(rest: OwnerRest, row: Record<string, unknown>): Promise<string> {
  const created = await rest.api.post("/rest/v1/clients", {
    headers: { ...rest.headers, Prefer: "return=representation" },
    data: [row],
  });
  expect(created.status(), await created.text()).toBe(201);
  return ((await created.json()) as { id: string }[])[0]!.id;
}

type Stored = { fiscal_code: string | null; address: string | null };

async function stored(rest: OwnerRest, id: string): Promise<Stored> {
  const response = await rest.api.get(`/rest/v1/clients?select=fiscal_code,address&id=eq.${id}`, {
    headers: rest.headers,
  });
  expect(response.status()).toBe(200);
  return ((await response.json()) as Stored[])[0]!;
}

function csv(rows: string[][]): string {
  return rows.map((row) => row.join(",")).join("\r\n");
}

async function importFile(page: Page, body: string, choice?: "fill"): Promise<void> {
  await page.goto("/clienti");
  await page.getByTestId("clienti-import").click();
  await page.getByTestId("import-file").setInputFiles({
    name: "clienti-idno.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(body, "utf8"),
  });
  await expect(page.getByTestId("import-read")).toBeVisible();
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-2")).toBeVisible();
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-3")).toBeVisible();
  if (choice) await page.getByTestId("import-duplicate-choice").selectOption(choice);
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-4")).toBeVisible();
  await page.getByTestId("import-run").click();
  await expect(page.getByTestId("import-summary")).toBeVisible({ timeout: 60_000 });
}

const count = async (page: Page, testId: string) =>
  Number((await page.getByTestId(testId).innerText()).trim());

test("P3-329: un rand cu IDNO-ul altui client este dublat, iar completarea nu il scrie", async ({
  page,
}) => {
  await signIn(page, ownerAccount());
  const rest = await ownerRest();

  const holderId = await seedClient(rest, {
    name: `${tag} detinator`,
    email: email("detinator"),
    fiscal_code: IDNO,
  });
  const emptyId = await seedClient(rest, { name: `${tag} gol`, email: email("gol") });

  // 1. Acelasi IDNO, alt nume si alt email: dublat dupa IDNO, nu se creeaza un client nou.
  await importFile(page, csv([["Denumire", "Email", "IDNO"], [`${tag} altul`, email("altul"), IDNO]]));
  expect(await count(page, "import-created")).toBe(0);
  expect(await count(page, "import-skipped")).toBe(1);
  expect((await stored(rest, holderId)).fiscal_code).toBe(IDNO);

  // 2. Randul se potriveste dupa email cu clientul fara IDNO, dar IDNO-ul din fisier este al
  //    detinatorului: adresa se completeaza, IDNO-ul nu.
  await importFile(
    page,
    csv([["Denumire", "Email", "IDNO", "Adresă"], [`${tag} gol`, email("gol"), IDNO, "Orhei"]]),
    "fill",
  );
  expect(await count(page, "import-filled")).toBe(1);
  const after = await stored(rest, emptyId);
  expect(after.address).toBe("Orhei");
  expect(after.fiscal_code).toBeNull();
  expect((await stored(rest, holderId)).fiscal_code).toBe(IDNO);
});
