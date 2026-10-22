import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// P3-338. Doi administratori care importa fisiere suprapuse in acelasi timp creeaza UN singur
// client. Blocajul din ecran sta in browser si nu opreste un al doilea calculator; aici se
// dovedeste blocajul de pe server (functia import_insert_client, migratia 0090), cu cereri
// reale in paralel, cu baza si cu ecranul. Planul pur nu s-a schimbat.
//
// Datele sunt inventate aici, cu eticheta rularii. Clientii de test raman, nu se sterg.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const tag = `TEST ${RUN} p3-338`;
const email = (label: string) => `test.${RUN}.p3338.${label}@example.test`;

type OwnerRest = { api: APIRequestContext; headers: Record<string, string> };

async function ownerRest(): Promise<OwnerRest> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  expect(url, "P3-338 are nevoie de NEXT_PUBLIC_SUPABASE_URL").not.toBe("");
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

type Answer = { id?: string; duplicate?: { id: string; by: string } };

async function importInsert(
  rest: OwnerRest,
  args: { row: Record<string, unknown>; email?: string | null; name?: string | null; phone?: string | null },
): Promise<Answer> {
  const response = await rest.api.post("/rest/v1/rpc/import_insert_client", {
    headers: rest.headers,
    data: {
      p_row: args.row,
      p_email_key: args.email ?? null,
      p_name_key: args.name ?? null,
      p_phone_key: args.phone ?? null,
    },
  });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as Answer;
}

async function storedWhere(rest: OwnerRest, filter: string): Promise<{ id: string }[]> {
  const response = await rest.api.get(`/rest/v1/clients?select=id&${filter}`, { headers: rest.headers });
  expect(response.status()).toBe(200);
  return (await response.json()) as { id: string }[];
}

test("P3-338: sase scrieri deodata cu acelasi email creeaza un singur client", async () => {
  const rest = await ownerRest();
  const mail = email("paralel");
  const answers = await Promise.all(
    [1, 2, 3, 4, 5, 6].map((n) =>
      importInsert(rest, {
        row: { name: `${tag} paralel ${n}`, email: mail },
        email: mail,
        name: `${tag} paralel ${n}`.toLowerCase(),
      }),
    ),
  );

  const created = answers.filter((a) => a.id);
  const refused = answers.filter((a) => a.duplicate);
  expect(created, JSON.stringify(answers)).toHaveLength(1);
  expect(refused, JSON.stringify(answers)).toHaveLength(5);
  for (const a of refused) {
    expect(a.duplicate?.by).toBe("email");
    expect(a.duplicate?.id).toBe(created[0]!.id);
  }
  expect(await storedWhere(rest, `email=eq.${encodeURIComponent(mail)}`)).toHaveLength(1);
});

test("P3-338: patru scrieri deodata ale aceluiasi nume si telefon, fara email, creeaza un singur client", async () => {
  const rest = await ownerRest();
  const name = `${tag} fara email`;
  const phone = `0${String(Date.now()).slice(-8)}`;
  const answers = await Promise.all(
    [1, 2, 3, 4].map(() =>
      importInsert(rest, {
        row: { name, phone },
        name: name.toLowerCase(),
        phone: phone.slice(-8),
      }),
    ),
  );

  expect(answers.filter((a) => a.id), JSON.stringify(answers)).toHaveLength(1);
  expect(answers.filter((a) => a.duplicate?.by === "namePhone"), JSON.stringify(answers)).toHaveLength(3);
  expect(await storedWhere(rest, `name=eq.${encodeURIComponent(name)}`)).toHaveLength(1);
});

test("P3-338: un rand cu alt email decat al clientului stocat, cu acelasi nume si telefon, ramane un client nou", async () => {
  const rest = await ownerRest();
  const name = `${tag} doua adrese`;
  const phone = `0${String(Date.now() + 1).slice(-8)}`;
  const first = await importInsert(rest, {
    row: { name, phone, email: email("prima") },
    email: email("prima"),
    name: name.toLowerCase(),
    phone: phone.slice(-8),
  });
  const second = await importInsert(rest, {
    row: { name, phone, email: email("a-doua") },
    email: email("a-doua"),
    name: name.toLowerCase(),
    phone: phone.slice(-8),
  });
  expect(first.id).toBeTruthy();
  expect(second.id, "alt email inseamna alt client").toBeTruthy();
  expect(second.id).not.toBe(first.id);
});

function csv(rows: string[][]): string {
  return rows.map((row) => row.join(",")).join("\r\n");
}

async function importFile(page: Page, body: string): Promise<{ created: number; skipped: number }> {
  await page.goto("/clienti");
  await page.getByTestId("clienti-import").click();
  await page.getByTestId("import-file").setInputFiles({
    name: "clienti-paralel.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(body, "utf8"),
  });
  await expect(page.getByTestId("import-read")).toBeVisible();
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-2")).toBeVisible();
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-3")).toBeVisible();
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-4")).toBeVisible();
  await page.getByTestId("import-run").click();
  await expect(page.getByTestId("import-summary")).toBeVisible({ timeout: 60_000 });
  const count = async (testId: string) => Number((await page.getByTestId(testId).innerText()).trim());
  return { created: await count("import-created"), skipped: await count("import-skipped") };
}

test("P3-338: doua importuri ale aceluiasi fisier, pornite deodata din doua browsere, creeaza un singur client", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const baseURL = test.info().project.use.baseURL;
  const rest = await ownerRest();
  const mail = email("doua-browsere");
  const file = csv([["Denumire", "Email"], [`${tag} doua browsere`, mail]]);

  // Doua contexte = doua spatii de stocare: blocajul din browser (localStorage) nu le leaga.
  const one = await browser.newContext({ baseURL });
  const two = await browser.newContext({ baseURL });
  try {
    const pageOne = await one.newPage();
    const pageTwo = await two.newPage();
    await Promise.all([signIn(pageOne, ownerAccount()), signIn(pageTwo, ownerAccount())]);

    const [a, b] = await Promise.all([importFile(pageOne, file), importFile(pageTwo, file)]);

    expect(a.created + b.created, `create: ${a.created} si ${b.created}`).toBe(1);
    expect(a.skipped + b.skipped, `nepreluate: ${a.skipped} si ${b.skipped}`).toBe(1);
    expect(await storedWhere(rest, `email=eq.${encodeURIComponent(mail)}`)).toHaveLength(1);
  } finally {
    await one.close();
    await two.close();
  }
});
