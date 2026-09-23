import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// date-invalid-blocks-save.spec - linia de acceptanta a cardului P3-92 pentru
// constatarea F4 a maturarii de erori din 2026-09-22.
//
// EROAREA. `DateField` trimite parintelui `onChange(iso ?? "")` la fiecare tasta.
// O data imposibila sau inca neterminata da acelasi sir gol pe care il da si o
// casuta golita ANUME, iar rosul ramanea numai in camp: niciun formular nu afla,
// niciun buton nu se uita la el. Deci Salvează mergea, sirul gol ajungea la server
// ca "sterge data", si data stocata disparea fara niciun mesaj. Proprietarul
// corecta o zi si ramanea fara ea.
//
// CE SE VERIFICA AICI, si sunt trei lucruri, nu unul:
//   1. mesajul rosu se vede,
//   2. butonul de salvare este OPRIT cat timp se vede,
//   3. data STOCATA este neatinsa dupa ce salvarea a fost oprita.
// Al treilea este singurul care deosebeste o oprire adevarata de un buton care
// arata oprit si trimite oricum.
//
// DOUA FORMULARE DIN SASE, si de ce tocmai acestea. Modifică pe client este
// exemplul din raport, cel in care pierderea a fost descrisa. Proiect, Modifică
// este al doilea fiindca butonul lui purta deja o a doua conditie (`noClients`):
// daca s-ar fi INLOCUIT in loc sa fie largita, cazul de aici ar cadea. Celelalte
// patru (Lead nou, nota "Ce s-a discutat", Comandă nouă si foaia de verificare a
// citirii automate) primesc aceeasi paza in acelasi pull request.
//
// DATELE DE TEST NU SE STERG NICIODATA. Fiecare rand poarta prefixul TEST si un
// sufix unic pe rulare.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

const DATE_INVALID_MESSAGE =
  "Data nu este validă. Scrie ziua, luna și anul, de exemplu 01.12.2026.";

/** O zi care nu exista: februarie nu are 31 de zile, deci nu este o data scrisa
 *  pe jumatate, este o data imposibila. */
const IMPOSSIBLE = "31.02.2027";

function leadName(tag: string): string {
  return `TEST G48 ${tag} ${RUN}`;
}

// ---------------------------------------------------------------------------
// Legatura directa la baza, ca administratorul, ca in lead-follow-up-date-cleared
// ---------------------------------------------------------------------------

type OwnerRest = { api: APIRequestContext; headers: Record<string, string> };

async function ownerRest(): Promise<OwnerRest> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  expect(url, "P3-92 are nevoie de NEXT_PUBLIC_SUPABASE_URL").not.toBe("");
  expect(anonKey, "P3-92 are nevoie de NEXT_PUBLIC_SUPABASE_ANON_KEY").not.toBe("");

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

/** Un lead la Ofertat, cu un pas urmator pus pe o zi anume. */
async function leadWithNextStep(rest: OwnerRest, name: string, date: string): Promise<string> {
  const created = await rest.api.post("/rest/v1/clients", {
    headers: { ...rest.headers, Prefer: "return=representation" },
    data: { name, active: true, stage: "quoted", next_action_at: date, next_action: "trimit oferta" },
  });
  expect(created.status(), await created.text()).toBe(201);
  return ((await created.json()) as { id: string }[])[0]!.id;
}

/** `YYYY-MM-DD` peste un numar de zile, ora Chisinaului. */
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

/** `YYYY-MM-DD` cum il arata ecranul, `DD.MM.YYYY`. */
function onScreen(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function clientName(tag: string): string {
  return `TEST G48 Beneficiar ${tag} ${RUN}`;
}
function projectName(tag: string): string {
  return `TEST G48 Șantier ${tag} ${RUN}`;
}

async function createClientFor(page: Page, name: string) {
  await page.goto("/clienti");
  await page.getByTestId("client-new").click();
  await expect(page.getByTestId("client-form")).toBeVisible();
  await page.getByTestId("field-client-name").fill(name);
  await page.getByTestId("client-submit").click();
  await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });
}

// ---------------------------------------------------------------------------

test.describe("O dată nevalidă oprește salvarea (P3-92, F4)", () => {
  test.describe.configure({ timeout: 120_000 });

  test("G48 F4: pe Modifică, o dată imposibilă în Data următorului pas arată mesajul roșu, ține Salvează oprit și lasă data stocată neatinsă", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const rest = await ownerRest();
    const kept = chisinauDay(12);
    const id = await leadWithNextStep(rest, leadName("F4 client"), kept);

    await page.goto(`/clienti/${id}`);
    await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("client-edit").click();
    await expect(page.getByTestId("client-form")).toBeVisible();

    // PREMISA: casuta chiar porneste cu data stocata si butonul chiar merge.
    const field = page.getByTestId("field-client-next-action-at");
    await expect(field).toHaveValue(onScreen(kept));
    await expect(page.getByTestId("client-submit")).toBeEnabled();

    // O ZI CARE NU EXISTA, tastata peste ea.
    await field.fill(IMPOSSIBLE);
    await expect(page.getByTestId("field-client-next-action-at-error")).toHaveText(
      DATE_INVALID_MESSAGE,
    );
    await expect(page.getByTestId("client-submit")).toBeDisabled();

    // SI TASTA ENTER, care trimite formularul pe langa buton. Formularul ramane
    // deschis si randul stocat este neatins: asta deosebeste o oprire adevarata de
    // un buton care arata oprit si trimite oricum.
    await field.press("Enter");
    await expect(page.getByTestId("client-form")).toBeVisible();
    expect(await storedNextActionAt(rest, id)).toBe(kept);

    // CORECTATA, butonul se intoarce si salvarea merge: oprirea nu este o usa
    // incuiata, ci o usa pe care o deschide o data adevarata.
    const fresh = chisinauDay(20);
    await field.fill(onScreen(fresh));
    await expect(page.getByTestId("field-client-next-action-at-error")).toHaveCount(0);
    await expect(page.getByTestId("client-submit")).toBeEnabled();
    await page.getByTestId("client-submit").click();
    await expect(page.getByTestId("client-form")).toHaveCount(0, { timeout: 20_000 });
    await expect.poll(async () => storedNextActionAt(rest, id)).toBe(fresh);

    await rest.api.dispose();
  });

  test("G48 F4: pe Proiect, Modifică, o dată imposibilă în Termen estimat ține butonul oprit fără să desfacă condiția care exista deja", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());

    const client = clientName("F4");
    await createClientFor(page, client);

    const name = projectName("F4");
    const kept = chisinauDay(40);
    await page.goto("/proiecte");
    await page.getByTestId("project-new").click();
    await expect(page.getByTestId("project-form")).toBeVisible();
    await page.getByTestId("field-project-client").selectOption({ label: client });
    await page.getByTestId("field-project-name").fill(name);
    await page.getByTestId("field-project-end").fill(onScreen(kept));
    await page.getByTestId("project-submit").click();
    await expect(page.getByTestId("project-detail")).toBeVisible({ timeout: 25_000 });

    await page.getByTestId("project-edit").click();
    await expect(page.getByTestId("project-form")).toBeVisible();
    const field = page.getByTestId("field-project-end");
    await expect(field).toHaveValue(onScreen(kept));
    await expect(page.getByTestId("project-submit")).toBeEnabled();

    await field.fill(IMPOSSIBLE);
    await expect(page.getByTestId("field-project-end-error")).toHaveText(DATE_INVALID_MESSAGE);
    await expect(page.getByTestId("project-submit")).toBeDisabled();

    await field.press("Enter");
    await expect(page.getByTestId("project-form")).toBeVisible();

    // Termenul stocat este neatins: se citeste de pe fisa, dupa ce formularul se
    // inchide cu Escape si pagina se incarca din nou.
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(page.getByTestId("project-detail")).toContainText(onScreen(kept), {
      timeout: 25_000,
    });
  });
});
