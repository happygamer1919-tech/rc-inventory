import { expect, request, test, type APIRequestContext } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// p3-256-client-date-enter-wipe.spec - linia de acceptanta a cardului P3-256.
//
// EROAREA. Enter intr-o casuta de text trimite formularul fara ca vreo casuta sa
// piarda focusul. Rosul datei aparea numai dupa ce casuta era parasita, deci o
// data tastata pe jumatate (o singura cifra) trecea de paza ca sir gol si
// serverul scria next_action_at null: data salvata disparea.
//
// CE SE VERIFICA: o cifra tastata, Enter, formularul ramane deschis cu mesajul
// rosu, iar data STOCATA este neatinsa dupa reincarcare. Si invers: o casuta
// golita anume salveaza tot ca "fara data".
//
// DATELE DE TEST NU SE STERG NICIODATA. Randul poarta prefixul TEST si un sufix
// unic pe rulare.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

const DATE_INVALID_MESSAGE =
  "Data nu este validă. Scrie ziua, luna și anul, de exemplu 01.12.2026.";

type OwnerRest = { api: APIRequestContext; headers: Record<string, string> };

async function ownerRest(): Promise<OwnerRest> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  expect(url, "P3-256 are nevoie de NEXT_PUBLIC_SUPABASE_URL").not.toBe("");
  expect(anonKey, "P3-256 are nevoie de NEXT_PUBLIC_SUPABASE_ANON_KEY").not.toBe("");

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

async function storedNextActionAt(rest: OwnerRest, id: string): Promise<string | null> {
  const response = await rest.api.get(`/rest/v1/clients?id=eq.${id}&select=next_action_at`, {
    headers: rest.headers,
  });
  expect(response.status(), await response.text()).toBe(200);
  const rows = (await response.json()) as { next_action_at: string | null }[];
  expect(rows).toHaveLength(1);
  return rows[0]!.next_action_at;
}

async function leadWithNextStep(rest: OwnerRest, name: string, date: string): Promise<string> {
  const created = await rest.api.post("/rest/v1/clients", {
    headers: { ...rest.headers, Prefer: "return=representation" },
    data: { name, active: true, stage: "quoted", next_action_at: date, next_action: "trimit oferta" },
  });
  expect(created.status(), await created.text()).toBe(201);
  return ((await created.json()) as { id: string }[])[0]!.id;
}

function chisinauDay(offsetDays: number): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Chisinau",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + offsetDays)).toISOString().slice(0, 10);
}

function onScreen(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

test.describe("Enter cu data pe jumătate tastată nu șterge data salvată (P3-256)", () => {
  test.describe.configure({ timeout: 120_000 });

  test("o cifră în Data următorului pas și Enter: formularul rămâne deschis cu mesajul roșu, iar data stocată rămâne", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const rest = await ownerRest();
    const kept = chisinauDay(12);
    const id = await leadWithNextStep(rest, `TEST P3-256 enter ${RUN}`, kept);

    await page.goto(`/clienti/${id}`);
    await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("client-edit").click();
    await expect(page.getByTestId("client-form")).toBeVisible();

    const field = page.getByTestId("field-client-next-action-at");
    await expect(field).toHaveValue(onScreen(kept));

    // O SINGURA CIFRA, apoi Enter, fara ca vreo casuta sa piarda focusul.
    await field.fill("1");
    await expect(page.getByTestId("field-client-next-action-at-error")).toHaveText(
      DATE_INVALID_MESSAGE,
    );
    await field.press("Enter");
    await expect(page.getByTestId("client-form")).toBeVisible();
    expect(await storedNextActionAt(rest, id)).toBe(kept);

    // Dupa reincarcare, data este tot cea de dinainte.
    await page.reload();
    await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("client-detail")).toContainText(onScreen(kept));
    expect(await storedNextActionAt(rest, id)).toBe(kept);

    await rest.api.dispose();
  });

  test("o casuta golită anume se salvează tot ca fără dată", async ({ page }) => {
    await signIn(page, ownerAccount());
    const rest = await ownerRest();
    const id = await leadWithNextStep(rest, `TEST P3-256 gol ${RUN}`, chisinauDay(15));

    await page.goto(`/clienti/${id}`);
    await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("client-edit").click();
    await expect(page.getByTestId("client-form")).toBeVisible();

    const field = page.getByTestId("field-client-next-action-at");
    await field.fill("");
    await expect(page.getByTestId("field-client-next-action-at-error")).toHaveCount(0);
    await page.getByTestId("client-submit").click();
    await expect(page.getByTestId("client-form")).toHaveCount(0, { timeout: 20_000 });
    await expect.poll(async () => storedNextActionAt(rest, id)).toBeNull();

    await rest.api.dispose();
  });
});
