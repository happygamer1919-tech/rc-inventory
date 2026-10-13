// P3-267. Importul de leaduri: un rand care se potriveste cu un client dezactivat primeste
// propriul mesaj, nu se completeaza si nu creeaza un duplicat. Primele cazuri sunt functii
// pure, fara browser si fara baza; ultimul trece prin ecran si prin baza (numai in CI).
import { expect, request, test, type APIRequestContext } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { buildPlan, duplicateReason, type ExistingClient } from "@/lib/data/lead-import-plan";
import { type ColumnMapping } from "@/lib/data/lead-import-types";

const MAPPING: ColumnMapping = ["name", "phone", "email", "address"];

function stored(active: boolean | undefined): ExistingClient {
  return {
    id: "c1",
    name: "Popescu SRL",
    phoneKey: "+37369123456",
    emailKey: null,
    empty: ["address"],
    ...(active === undefined ? {} : { active }),
  };
}

function plan(existing: ExistingClient[], rows: string[][]) {
  return buildPlan({
    rows,
    mapping: MAPPING,
    owners: new Map(),
    fallbackSource: "",
    existing,
  }).plan;
}

test("P3-267: un client activ dublat ramane completabil, cu mesajul de pana acum", () => {
  const entry = plan([stored(true)], [["Popescu", "069123456", "", "Orhei"]]).entries[0]!;
  if (entry.kind !== "duplicate") throw new Error("asteptat dublat");
  expect(entry.fillable).toEqual(["address"]);
  expect(entry.against).toEqual({ kind: "stored", id: "c1", name: "Popescu SRL" });
  expect(duplicateReason(entry)).toBe('Dublat după telefon cu "Popescu SRL", care există deja.');
});

test("P3-267: un client fara marcajul active este tratat ca activ", () => {
  const entry = plan([stored(undefined)], [["Popescu", "069123456", "", "Orhei"]]).entries[0]!;
  if (entry.kind !== "duplicate") throw new Error("asteptat dublat");
  expect(entry.fillable).toEqual(["address"]);
});

test("P3-267: un client dezactivat are mesaj propriu si nimic de completat", () => {
  const result = plan([stored(false)], [["Popescu", "069123456", "", "Orhei"]]);
  expect(result.counts).toEqual({ fresh: 0, duplicate: 1, error: 0 });
  const entry = result.entries[0]!;
  if (entry.kind !== "duplicate") throw new Error("asteptat dublat");
  expect(entry.against).toMatchObject({ kind: "stored", id: "c1", inactive: true });
  expect(entry.fillable).toEqual([]);
  expect(duplicateReason(entry)).toBe(
    "Există deja ca client dezactivat: Popescu SRL. Reactivați-l din fișa clientului înainte de import.",
  );
});

test("P3-267: fara potrivire, randul ramane nou chiar daca exista un client dezactivat", () => {
  const result = plan([stored(false)], [["Altcineva", "069999999", "", "Orhei"]]);
  expect(result.counts).toEqual({ fresh: 1, duplicate: 0, error: 0 });
  expect(result.entries[0]!.kind).toBe("new");
});

// ---------------------------------------------------------------------------
// Prin ecran si prin baza. CLIENTUL DE TEST ESTE DEZACTIVAT, NU STERS.
// ---------------------------------------------------------------------------

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const RUN4 = String(Math.floor(Math.random() * 9000) + 1000);

type OwnerRest = { api: APIRequestContext; headers: Record<string, string> };

async function ownerRest(): Promise<OwnerRest> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  expect(url, "P3-267 are nevoie de NEXT_PUBLIC_SUPABASE_URL").not.toBe("");
  expect(anonKey, "P3-267 are nevoie de NEXT_PUBLIC_SUPABASE_ANON_KEY").not.toBe("");
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

const STORED_COLUMNS = "id,name,phone,email,address,active,notes";

test("import leaduri: un rand care se potriveste cu un client dezactivat este spus ca atare si nu atinge clientul", async ({
  page,
}) => {
  await signIn(page, ownerAccount());
  const rest = await ownerRest();
  const tag = `TEST ${RUN} dezactivat`;

  const created = await rest.api.post("/rest/v1/clients", {
    headers: { ...rest.headers, Prefer: "return=representation" },
    data: [{ name: `${tag} stocat`, phone: `+37369${RUN4}01`, active: false }],
  });
  expect(created.status(), await created.text()).toBe(201);
  const storedId = ((await created.json()) as { id: string }[])[0]!.id;
  const byId = `/rest/v1/clients?select=${STORED_COLUMNS}&id=eq.${storedId}`;
  const before = await restGet<unknown[]>(rest, byId);
  expect(before).toHaveLength(1);

  const body = [
    "Denumire,Telefon,Email,Etapă,Interes,Responsabil,Data de reluare,Adresă",
    `${tag} din fișier,069${RUN4}01,,,,,,Altă adresă`,
  ].join("\r\n");

  await page.goto("/clienti?vedere=leaduri");
  await page.getByTestId("leaduri-import").click();
  await expect(page.getByTestId("import-step-1")).toBeVisible();
  await page.getByTestId("import-file").setInputFiles({
    name: "leaduri-dezactivat.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(body, "utf8"),
  });
  await expect(page.getByTestId("import-read")).toBeVisible();
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-2")).toBeVisible();
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-3")).toBeVisible();

  const duplicate = page.getByTestId("import-duplicate");
  await expect(duplicate).toHaveCount(1);
  await expect(duplicate).toContainText("Există deja ca client dezactivat");
  await expect(duplicate).toContainText("Reactivați-l din fișa clientului înainte de import.");
  await expect(
    page.getByTestId("import-duplicate-choice").locator('option[value="fill"]'),
  ).toBeDisabled();

  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-4")).toBeVisible();
  await page.getByTestId("import-run").click();
  await expect(page.getByTestId("import-summary")).toBeVisible({ timeout: 60_000 });
  const count = async (id: string) => Number((await page.getByTestId(id).innerText()).trim());
  expect(await count("import-created")).toBe(0);
  expect(await count("import-filled")).toBe(0);
  expect(await count("import-skipped")).toBe(1);

  expect(await restGet<unknown[]>(rest, byId)).toEqual(before);
  const withTag = await restGet<{ id: string }[]>(
    rest,
    `/rest/v1/clients?select=id&name=like.${encodeURIComponent(`${tag}*`)}`,
  );
  expect(withTag, "nu apare niciun al doilea client").toHaveLength(1);
});
