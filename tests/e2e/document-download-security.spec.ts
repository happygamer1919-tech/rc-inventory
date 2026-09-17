import { randomUUID } from "node:crypto";
import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { DOCUMENT_MESSAGES } from "@/lib/data/documents-types";
import { ownerAccount, type TestAccount } from "./support/accounts";
import { LOGIN_PATH, signIn } from "./support/auth";

// document-download-security.spec - linia de acceptanta a cardului P3-70,
// constatarea F1 a lui Ivan: legatura de descarcare a unui document se da numai
// unui profil ACTIV.
//
// Cazurile cardului:
//   1. un al doilea cont, activ, primeste o legatura semnata de la API-ul de
//      stocare cu propriul token (MARTORUL); dupa ce profilul lui devine
//      active = false, ACELASI token este refuzat de stocare, fila Documente deja
//      deschisa arata un refuz romanesc si nu porneste nicio descarcare, actiunea
//      de descarcare trimisa din nou cu sesiunea lui nu intoarce nicio legatura, iar
//      o reincarcare arata ecranul romanesc "Contul nu are acces";
//   2. fara sesiune, actiunea trimisa fara cookie-uri nu intoarce nicio legatura si
//      este trimisa la autentificare, pagina clientului duce la autentificare, iar
//      stocarea refuza cheia anonima.
// Fiecare refuz are martorul lui in acelasi caz: actiunea trimisa din nou cu
// sesiunea administratorului INTOARCE legatura, deci refuzul este despre cine
// intreaba, nu despre o cerere gresit reconstruita.
//
// DE CE SI API-UL DE STOCARE, nu doar ecranul. proxy.ts intoarce deja un cont
// dezactivat de la fiecare ecran al aplicatiei. Gaura din F1 era dedesubt: un
// token inca valid putea cere direct stocarii o legatura pentru orice obiect din
// rc-docs, pentru ca rc_docs_select din 0002 cerea doar o sesiune. Cazul 1 este
// dovada, pe o stiva Supabase reala, a politicii din 0050.
//
// CONTUL AL DOILEA ESTE NOU LA FIECARE RULARE, creat cu cheia service_role a
// stivei LOCALE. Conturile comune de test nu se dezactiveaza niciodata: alte
// specificatii se autentifica cu ele. Parola este aleasa la rulare si nu se scrie
// nicaieri. Nimic nu se sterge: contul ramane dezactivat, conform conventiei P2-07.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "document-download-security.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY si " +
        "SUPABASE_SERVICE_ROLE_KEY. In CI sunt exportate de pasul 'Export local Supabase credentials'. " +
        "Local: supabase status -o env.",
    );
  }
  return { origin: new URL(url).origin, anon, service };
}

function serviceHeaders() {
  const { service } = env();
  return { apikey: service, Authorization: `Bearer ${service}` };
}

/* ------------------------------------------------------------ baza locala -- */

type DocumentDbRow = { id: string; storage_path: string };

async function documentNamed(name: string): Promise<DocumentDbRow> {
  const response = await fetch(
    `${env().origin}/rest/v1/documents?select=id,storage_path&original_name=eq.${encodeURIComponent(name)}`,
    { headers: serviceHeaders() },
  );
  if (!response.ok) throw new Error(`documents a raspuns ${response.status}`);
  const rows = (await response.json()) as DocumentDbRow[];
  expect(rows, `un singur document numit ${name}`).toHaveLength(1);
  return rows[0]!;
}

type SecondAccount = TestAccount & { id: string };

/** Un cont nou, cu profil activ de operator, in stiva locala. */
async function createSecondAccount(): Promise<SecondAccount> {
  const { origin } = env();
  const email = `p3-70-${RUN}-${randomUUID().slice(0, 8)}@rc-inventory.local`;
  const password = `p3-70-${randomUUID()}`;

  const created = await fetch(`${origin}/auth/v1/admin/users`, {
    method: "POST",
    headers: { ...serviceHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = (await created.json().catch(() => ({}))) as { id?: string };
  if (!created.ok || !body.id) throw new Error(`contul de test nu a putut fi creat: ${created.status}`);

  const profile = await fetch(`${origin}/rest/v1/profiles?on_conflict=id`, {
    method: "POST",
    headers: {
      ...serviceHeaders(),
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify([
      { id: body.id, email, role: "account_manager", full_name: "Test P3-70", active: true },
    ]),
  });
  if (!profile.ok) throw new Error(`profilul contului de test nu a putut fi scris: ${profile.status}`);

  return { id: body.id, email, password, label: "operator P3-70" };
}

async function setProfileActive(id: string, active: boolean): Promise<void> {
  const response = await fetch(`${env().origin}/rest/v1/profiles?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...serviceHeaders(), "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ active }),
  });
  if (!response.ok) throw new Error(`profilul ${id} nu a putut fi schimbat: ${response.status}`);
}

/** Tokenul de acces al unui cont, exact cel pe care il are un browser autentificat. */
async function accessToken(account: TestAccount): Promise<string> {
  const { origin, anon } = env();
  const response = await fetch(`${origin}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string };
  if (!response.ok || !body.access_token) throw new Error(`autentificarea API a raspuns ${response.status}`);
  return body.access_token;
}

/* ---------------------------------------------------- API-ul de stocare -- */

/** Cererea de semnare catre stocare, pe langa aplicatie, cu un token dat. */
async function signAtStorage(bearer: string, path: string): Promise<{ status: number; signed: string }> {
  const { origin, anon } = env();
  const response = await fetch(`${origin}/storage/v1/object/sign/rc-docs/${path}`, {
    method: "POST",
    headers: { apikey: anon, Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 60 }),
  });
  const body = (await response.json().catch(() => ({}))) as { signedURL?: string };
  return { status: response.status, signed: body.signedURL ?? "" };
}

/** Citirea directa a obiectului, cu un token dat. */
async function readAtStorage(bearer: string, path: string): Promise<number> {
  const { origin, anon } = env();
  const response = await fetch(`${origin}/storage/v1/object/authenticated/rc-docs/${path}`, {
    headers: { apikey: anon, Authorization: `Bearer ${bearer}` },
  });
  await response.arrayBuffer().catch(() => undefined);
  return response.status;
}

/* ---------------------------------------------------------------- ecrane -- */

function pdf(totalBytes = 128): Buffer {
  const head = Buffer.from("%PDF-1.4\n% document-download-security.spec\n");
  return Buffer.concat([head, Buffer.alloc(Math.max(0, totalBytes - head.length), 0x20)]);
}

async function createClientRecord(page: Page, name: string): Promise<string> {
  await page.goto("/clienti");
  await page.getByTestId("client-new").click();
  await expect(page.getByTestId("client-form")).toBeVisible();
  await page.getByTestId("field-client-name").fill(name);
  await page.getByTestId("client-submit").click();
  await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });
  const url = page.url();
  return url.slice(url.lastIndexOf("/") + 1).split("?")[0]!;
}

async function openDocuments(page: Page, path: string, asOwner = true) {
  await page.goto(`${path}?fila=documente`);
  await expect(page.getByTestId("panel-documente")).toBeVisible({ timeout: 20_000 });
  if (asOwner) await expect(page.getByTestId("document-upload")).toBeVisible({ timeout: 20_000 });
}

function rowNamed(page: Page, name: string) {
  return page.locator(`[data-testid="document-row"][data-name="${name}"]`);
}

async function uploadPdf(page: Page, name: string) {
  const panel = page.getByTestId("panel-documente");
  await panel.getByTestId("document-kind").selectOption("contract");
  await panel.getByTestId("document-input").setInputFiles({ name, mimeType: "application/pdf", buffer: pdf() });
  await expect(panel.getByTestId("document-chosen")).toHaveText(name);
  await panel.getByTestId("document-submit").click();
  await expect(page.getByTestId("document-done")).toBeVisible({ timeout: 60_000 });
  await expect(rowNamed(page, name)).toBeVisible({ timeout: 20_000 });
}

/** Clientul, documentul lui si randul din baza, create de administrator. */
async function ownerDocument(page: Page, label: string) {
  await signIn(page, ownerAccount());
  const clientId = await createClientRecord(page, `TEST Doc Acces ${label} ${RUN}`);
  const name = `Contract ${label} ${RUN}.pdf`;
  await openDocuments(page, `/clienti/${clientId}`);
  await uploadPdf(page, name);
  const doc = await documentNamed(name);
  return { clientId, name, doc };
}

/* ------------------------------------------- actiunea, trimisa din nou -- */

type CapturedAction = { url: string; headers: Record<string, string>; body: string };

/**
 * Clicul administratorului pe Descarca, cu cererea actiunii prinsa exact cum a
 * plecat din browser: adresa, antetul Next-Action si corpul cu id-ul documentului.
 * Cookie-urile NU se pastreaza: fiecare trimitere foloseste sesiunea contextului
 * din care pleaca, sau niciuna.
 */
async function captureDownloadAction(page: Page, name: string, storagePath: string): Promise<CapturedAction> {
  const [actionRequest, download] = await Promise.all([
    page.waitForRequest((r) => r.method() === "POST" && Boolean(r.headers()["next-action"])),
    page.waitForEvent("download"),
    rowNamed(page, name).getByTestId("document-download").click(),
  ]);
  expect(download.url()).toContain(`/storage/v1/object/sign/rc-docs/${storagePath}`);

  const all = await actionRequest.allHeaders();
  const headers: Record<string, string> = {};
  for (const key of ["next-action", "content-type", "accept", "next-router-state-tree", "origin"]) {
    if (all[key]) headers[key] = all[key]!;
  }
  if (!headers.origin) headers.origin = new URL(actionRequest.url()).origin;
  return { url: actionRequest.url(), headers, body: actionRequest.postData() ?? "" };
}

async function replay(context: APIRequestContext, action: CapturedAction) {
  const response = await context.post(action.url, {
    headers: action.headers,
    data: action.body,
    maxRedirects: 0,
  });
  return {
    status: response.status(),
    location: response.headers()["location"] ?? "",
    text: await response.text(),
  };
}

/* ----------------------------------------------------------------- cazuri -- */

test.describe("Descărcarea unui document cere un profil activ", () => {
  test.setTimeout(240_000);

  test("1. un cont dezactivat nu mai primește legătura, nici din aplicație, nici direct de la stocare", async ({
    page,
    browser,
  }) => {
    const { clientId, name, doc } = await ownerDocument(page, "Dezactivat");
    const signedPath = `sign/rc-docs/${doc.storage_path}`;

    // MARTORUL ACTIUNII: trimisa din nou cu sesiunea administratorului, intoarce legatura.
    const action = await captureDownloadAction(page, name, doc.storage_path);
    const asOwner = await replay(page.request, action);
    expect(asOwner.text, "actiunea trimisa din nou de administrator intoarce legatura").toContain(signedPath);

    // Al doilea cont, activ, cu fila Documente deschisa.
    const second = await createSecondAccount();
    const secondContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const other = await secondContext.newPage();
    await signIn(other, second);
    await openDocuments(other, `/clienti/${clientId}`, false);
    await expect(rowNamed(other, name).getByTestId("document-download")).toBeVisible({ timeout: 20_000 });

    // MARTORUL STOCARII: cat timp profilul este activ, tokenul lui semneaza si citeste.
    const token = await accessToken(second);
    const activeSign = await signAtStorage(token, doc.storage_path);
    expect(activeSign.status, "profil activ: stocarea semneaza").toBe(200);
    expect(activeSign.signed).toContain(signedPath);
    expect(await readAtStorage(token, doc.storage_path), "profil activ: stocarea da obiectul").toBe(200);

    // Administratorul dezactiveaza contul. Tokenul ramane valid pana expira.
    await setProfileActive(second.id, false);

    // STOCAREA REFUZA ACELASI TOKEN: politica rc_docs_select din 0050.
    const inactiveSign = await signAtStorage(token, doc.storage_path);
    expect(inactiveSign.status, "profil dezactivat: stocarea nu semneaza").toBeGreaterThanOrEqual(400);
    expect(inactiveSign.signed, "profil dezactivat: nicio legatura").toBe("");
    expect(await readAtStorage(token, doc.storage_path), "profil dezactivat: stocarea nu da obiectul")
      .toBeGreaterThanOrEqual(400);

    // FILA DEJA DESCHISA: clicul arata un refuz romanesc si nu descarca nimic.
    let downloaded = false;
    other.on("download", () => {
      downloaded = true;
    });
    await rowNamed(other, name).getByTestId("document-download").click();
    const refusal = other.getByTestId("document-list-error");
    await expect(refusal).toBeVisible({ timeout: 20_000 });
    const refusalText = (await refusal.textContent())?.trim() ?? "";
    expect([DOCUMENT_MESSAGES.downloadFailed, DOCUMENT_MESSAGES.session]).toContain(refusalText);
    await other.waitForTimeout(1_500);
    expect(downloaded, "niciun fisier descarcat de contul dezactivat").toBe(false);

    // ACTIUNEA, trimisa din nou cu sesiunea contului dezactivat: nicio legatura.
    const asInactive = await replay(secondContext.request, action);
    expect(asInactive.text, "actiunea nu intoarce legatura unui cont dezactivat").not.toContain(signedPath);
    expect(asInactive.text).not.toContain("token=");

    // O reincarcare arata ecranul romanesc fara acces, fara niciun buton de descarcare.
    await other.reload();
    await expect(other.getByRole("heading", { name: "Contul nu are acces" })).toBeVisible({ timeout: 20_000 });
    await expect(other.getByTestId("document-download")).toHaveCount(0);

    await secondContext.close();
  });

  test("2. fără sesiune, nici acțiunea, nici pagina, nici stocarea nu dau legătura", async ({
    page,
    browser,
    baseURL,
  }) => {
    const { clientId, name, doc } = await ownerDocument(page, "Anonim");
    const signedPath = `sign/rc-docs/${doc.storage_path}`;

    // MARTORUL: aceeasi cerere, cu sesiunea administratorului, intoarce legatura.
    const action = await captureDownloadAction(page, name, doc.storage_path);
    const asOwner = await replay(page.request, action);
    expect(asOwner.text).toContain(signedPath);

    // ACTIUNEA FARA COOKIE-URI: trimisa la autentificare, fara legatura.
    const anonymous = await playwrightRequest.newContext({ baseURL });
    const asAnonymous = await replay(anonymous, action);
    await anonymous.dispose();
    expect(asAnonymous.text, "actiunea nu intoarce legatura fara sesiune").not.toContain(signedPath);
    expect(asAnonymous.text).not.toContain("token=");
    expect(asAnonymous.status, "actiunea fara sesiune este redirectionata").toBeGreaterThanOrEqual(300);
    expect(asAnonymous.status).toBeLessThan(400);
    expect(new URL(asAnonymous.location, baseURL).pathname).toBe(LOGIN_PATH);

    // PAGINA CLIENTULUI, intr-un browser fara sesiune: formularul romanesc de autentificare.
    const bareContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const bare = await bareContext.newPage();
    await bare.goto(`/clienti/${clientId}?fila=documente`);
    await bare.waitForURL((url) => new URL(url).pathname === LOGIN_PATH, { timeout: 20_000 });
    await expect(bare.getByTestId("login-form")).toBeVisible();
    await expect(bare.getByTestId("document-download")).toHaveCount(0);
    await bareContext.close();

    // STOCAREA, cu cheia anonima in locul unui token de utilizator: refuz.
    const anonSign = await signAtStorage(env().anon, doc.storage_path);
    expect(anonSign.status, "cheia anonima: stocarea nu semneaza").toBeGreaterThanOrEqual(400);
    expect(anonSign.signed).toBe("");
  });
});
