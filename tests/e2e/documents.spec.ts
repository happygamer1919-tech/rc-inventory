import { expect, test, type Page } from "@playwright/test";
import { managerAccount, ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// documents.spec - linia de acceptanta a cardului P3-15.
//
// Cele opt cazuri ale cardului, in ordinea lui:
//   1. un fisier incarcat pe un proiect apare in fila Documente a proiectului si
//      nicaieri altundeva;
//   2. un fisier incarcat pe un client apare in fila Documente a clientului;
//   3. fisierul se citeste NUMAI printr-o legatura semnata; o cerere nesemnata
//      catre obiect este refuzata;
//   4. o cerere neautentificata catre obiect este refuzata;
//   5. un fisier peste limita este refuzat cu un mesaj romanesc care numeste
//      limita (20 MB, raspunsul implicit la intrebarea q013);
//   6. un tip nepermis este refuzat cu un mesaj romanesc care numeste ce se
//      accepta, iar verificarea este pe CONTINUT, nu doar pe extensie;
//   7. stergerea unui document scoate randul si obiectul si scrie cine a sters;
//   8. fiecare text vizibil este romanesc.
// Plus doctrina densitatii: cel mult 5 randuri pe fila, restul in lista completa.
//
// CE SE CITESTE DIN BAZA SI DIN DEPOZIT SE CITESTE CU CHEIA service_role a stivei
// LOCALE, ca document-url.spec. Nu exista alt drum catre randul de stergere, iar
// "obiectul nu mai exista" nu se poate dovedi de pe ecran.
//
// DATELE DE TEST NU SE STERG NICIODATA, conform conventiei P2-07. Singura
// stergere din acest fisier este cea pe care o testeaza cazul 7, a unui document
// creat de acelasi caz.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const MB = 1024 * 1024;

const ALLOWED = "PDF, JPG, JPEG, PNG, WEBP, DOC, DOCX, XLS, XLSX";

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "documents.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY si " +
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

async function rest<T>(path: string): Promise<T> {
  const response = await fetch(`${env().origin}/rest/v1/${path}`, { headers: serviceHeaders() });
  if (!response.ok) {
    throw new Error(`rest ${path} a raspuns ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return (await response.json()) as T;
}

type DocumentDbRow = {
  id: string;
  client_id: string | null;
  project_id: string | null;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  kind: string;
  uploaded_by: string | null;
};

function documentsNamed(name: string): Promise<DocumentDbRow[]> {
  return rest<DocumentDbRow[]>(
    "documents?select=id,client_id,project_id,storage_path,original_name,mime_type,size_bytes,kind,uploaded_by" +
      `&original_name=eq.${encodeURIComponent(name)}`,
  );
}

/** Obiectele din depozit de sub un dosar, cu cheia service_role. */
async function storedObjects(prefix: string): Promise<{ name: string }[]> {
  const response = await fetch(`${env().origin}/storage/v1/object/list/rc-docs`, {
    method: "POST",
    headers: { ...serviceHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit: 100, offset: 0 }),
  });
  if (!response.ok) throw new Error(`list ${prefix} a raspuns ${response.status}`);
  return ((await response.json()) as { name: string }[]).filter((o) => o.name && !o.name.startsWith("."));
}

async function userIdByEmail(email: string): Promise<string> {
  const response = await fetch(`${env().origin}/auth/v1/admin/users?per_page=1000`, {
    headers: serviceHeaders(),
  });
  if (!response.ok) throw new Error(`admin users a raspuns ${response.status}`);
  const { users } = (await response.json()) as { users: { id: string; email: string }[] };
  const found = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!found) throw new Error(`contul ${email} nu exista in stiva locala`);
  return found.id;
}

/* ---------------------------------------------------------------- fisiere -- */

function pdf(totalBytes = 64): Buffer {
  const head = Buffer.from("%PDF-1.4\n% documents.spec\n");
  return Buffer.concat([head, Buffer.alloc(Math.max(0, totalBytes - head.length), 0x20)]);
}

function png(): Buffer {
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(56, 0)]);
}

/* ---------------------------------------------------------------- ecrane -- */

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

async function createProjectRecord(page: Page, clientName: string, name: string): Promise<string> {
  await page.goto("/proiecte");
  await page.getByTestId("project-new").click();
  await expect(page.getByTestId("project-form")).toBeVisible();
  await page.getByTestId("field-project-client").selectOption({ label: clientName });
  await page.getByTestId("field-project-name").fill(name);
  await page.getByTestId("project-submit").click();
  await expect(page.getByTestId("project-detail")).toBeVisible({ timeout: 25_000 });
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

async function chooseAndSubmit(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
  kind: string,
) {
  const panel = page.getByTestId("panel-documente");
  await panel.getByTestId("document-kind").selectOption(kind);
  await panel.getByTestId("document-input").setInputFiles(file);
  await expect(panel.getByTestId("document-chosen")).toHaveText(file.name);
  await panel.getByTestId("document-submit").click();
}

async function uploadOk(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
  kind: string,
) {
  await chooseAndSubmit(page, file, kind);
  await expect(page.getByTestId("document-done")).toBeVisible({ timeout: 60_000 });
  await expect(rowNamed(page, file.name)).toBeVisible({ timeout: 20_000 });
}

test.describe("Documente pe client și pe proiect", () => {
  test.describe.configure({ timeout: 240_000 });

  test("1. un fișier încărcat pe un proiect apare în fila proiectului și nicăieri altundeva", async ({ page }) => {
    await signIn(page, ownerAccount());
    const clientName = `TEST Doc Beneficiar ${RUN}`;
    const clientId = await createClientRecord(page, clientName);
    const projectId = await createProjectRecord(page, clientName, `TEST Doc Șantier ${RUN}`);
    const otherProjectId = await createProjectRecord(page, clientName, `TEST Doc Alt șantier ${RUN}`);

    const name = `Contract șantier ${RUN}.pdf`;
    await openDocuments(page, `/proiecte/${projectId}`);
    await uploadOk(page, { name, mimeType: "application/pdf", buffer: pdf() }, "contract");
    await expect(rowNamed(page, name)).toContainText("Contract");

    // IN BAZA: un rand, al proiectului, fara client, la o cale structurata care
    // nu contine numele fisierului.
    const rows = await documentsNamed(name);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.project_id).toBe(projectId);
    expect(rows[0]!.client_id).toBeNull();
    expect(rows[0]!.storage_path).toMatch(new RegExp(`^project/${projectId}/[0-9a-f-]{36}\\.pdf$`));
    expect(rows[0]!.mime_type).toBe("application/pdf");
    expect(rows[0]!.kind).toBe("contract");

    // NICAIERI ALTUNDEVA: nici pe clientul proiectului, nici pe alt proiect al
    // aceluiasi client.
    for (const path of [`/clienti/${clientId}`, `/proiecte/${otherProjectId}`]) {
      await openDocuments(page, path);
      await expect(page.getByText("Niciun document")).toBeVisible();
      await expect(rowNamed(page, name)).toHaveCount(0);
    }
  });

  test("2. un fișier încărcat pe un client apare în fila clientului", async ({ page }) => {
    await signIn(page, ownerAccount());
    const clientName = `TEST Doc Client ${RUN}`;
    const clientId = await createClientRecord(page, clientName);
    const projectId = await createProjectRecord(page, clientName, `TEST Doc Șantierul clientului ${RUN}`);

    const name = `Fotografie fațadă ${RUN}.png`;
    await openDocuments(page, `/clienti/${clientId}`);
    await uploadOk(page, { name, mimeType: "image/png", buffer: png() }, "foto");
    await expect(rowNamed(page, name)).toContainText("Fotografie");

    const rows = await documentsNamed(name);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.client_id).toBe(clientId);
    expect(rows[0]!.project_id).toBeNull();
    expect(rows[0]!.storage_path).toMatch(new RegExp(`^client/${clientId}/[0-9a-f-]{36}\\.png$`));

    // Reincarcat, este tot acolo: randul vine din baza, nu din starea ecranului.
    await openDocuments(page, `/clienti/${clientId}`);
    await expect(rowNamed(page, name)).toBeVisible();

    // Si nu pe proiectul clientului.
    await openDocuments(page, `/proiecte/${projectId}`);
    await expect(rowNamed(page, name)).toHaveCount(0);
  });

  test("3. fișierul se citește numai printr-o legătură semnată", async ({ page, request }) => {
    await signIn(page, ownerAccount());
    const clientId = await createClientRecord(page, `TEST Doc Semnat ${RUN}`);
    const name = `Act semnat ${RUN}.pdf`;
    const body = pdf(512);
    await openDocuments(page, `/clienti/${clientId}`);
    await uploadOk(page, { name, mimeType: "application/pdf", buffer: body }, "act");

    const [doc] = await documentsNamed(name);
    expect(doc).toBeTruthy();
    const { origin } = env();

    // Descarca produce legatura semnata a Supabase, pentru calea documentului.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      rowNamed(page, name).getByTestId("document-download").click(),
    ]);
    const signed = download.url();
    expect(signed).toContain(`/storage/v1/object/sign/rc-docs/${doc!.storage_path}`);
    const token = new URL(signed).searchParams.get("token") ?? "";
    expect(token).not.toBe("");

    // Legatura semnata citeste exact fisierul incarcat, fara nicio cheie.
    const ok = await request.get(signed);
    expect(ok.status()).toBe(200);
    expect(Buffer.from(await ok.body()).equals(body)).toBe(true);

    // Adresa publica: bucketul este privat.
    const asPublic = await request.get(`${origin}/storage/v1/object/public/rc-docs/${doc!.storage_path}`);
    expect(asPublic.status(), "adresa publica a obiectului").toBeGreaterThanOrEqual(400);

    // Adresa de semnatura fara jeton.
    const noToken = await request.get(`${origin}/storage/v1/object/sign/rc-docs/${doc!.storage_path}`);
    expect(noToken.status(), "legatura fara jeton").toBeGreaterThanOrEqual(400);

    // Un jeton alterat.
    const tampered = new URL(signed);
    tampered.searchParams.set("token", `${token.slice(0, -6)}AAAAAA`);
    const badToken = await request.get(tampered.toString());
    expect(badToken.status(), "legatura cu jeton alterat").toBeGreaterThanOrEqual(400);
  });

  test("4. o cerere neautentificată către obiect este refuzată", async ({ page, request }) => {
    await signIn(page, ownerAccount());
    const clientId = await createClientRecord(page, `TEST Doc Anonim ${RUN}`);
    const name = `Factură privată ${RUN}.pdf`;
    await openDocuments(page, `/clienti/${clientId}`);
    await uploadOk(page, { name, mimeType: "application/pdf", buffer: pdf() }, "factura");

    const [doc] = await documentsNamed(name);
    expect(doc).toBeTruthy();
    const { origin, anon } = env();
    const objectUrl = `${origin}/storage/v1/object/rc-docs/${doc!.storage_path}`;

    // Fara nicio cheie.
    const bare = await request.get(objectUrl);
    expect(bare.status(), "fara nicio cheie").toBeGreaterThanOrEqual(400);

    // Cu cheia anonima, adica un vizitator neautentificat al API-ului.
    const asAnon = await request.get(objectUrl, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    });
    expect(asAnon.status(), "cu cheia anonima").toBeGreaterThanOrEqual(400);

    // MARTORUL: aceeasi adresa, cu cheia service_role, raspunde 200. Deci refuzul
    // de mai sus este despre CINE intreaba, nu despre o cale gresita.
    const control = await request.get(objectUrl, { headers: serviceHeaders() });
    expect(control.status(), "martorul service_role").toBe(200);

    // Si o sesiune de browser iesita din cont nu vede fila deloc.
    const context = await page.context().browser()!.newContext({
      baseURL: test.info().project.use.baseURL,
    });
    const anonymous = await context.newPage();
    await anonymous.goto(`/clienti/${clientId}?fila=documente`);
    await expect(anonymous.getByTestId("login-form")).toBeVisible({ timeout: 20_000 });
    await expect(anonymous.getByText(name)).toHaveCount(0);
    await context.close();
  });

  test("5. un fișier peste limită este refuzat cu limita numită", async ({ page }) => {
    await signIn(page, ownerAccount());
    const clientId = await createClientRecord(page, `TEST Doc Limită ${RUN}`);
    await openDocuments(page, `/clienti/${clientId}`);

    // Un octet peste 20 MB. Mesajul vine de la server: panoul nu are verificare
    // proprie de marime.
    const big = `Prea mare ${RUN}.pdf`;
    await chooseAndSubmit(page, { name: big, mimeType: "application/pdf", buffer: pdf(20 * MB + 1) }, "act");
    await expect(page.getByTestId("document-error")).toHaveText("Fișierul depășește limita de 20 MB.", {
      timeout: 30_000,
    });
    expect(await documentsNamed(big)).toHaveLength(0);
    expect(await storedObjects(`client/${clientId}`)).toHaveLength(0);

    // 12 MB, peste vechea limita de 10 MB a bucketului, trece: bucketul a fost
    // largit de 0044, altfel Supabase l-ar refuza inaintea aplicatiei.
    const mid = `Deviz scanat ${RUN}.pdf`;
    await uploadOk(page, { name: mid, mimeType: "application/pdf", buffer: pdf(12 * MB) }, "act");
    const [row] = await documentsNamed(mid);
    expect(Number(row!.size_bytes)).toBe(12 * MB);
    await expect(rowNamed(page, mid)).toContainText("12 MB");
  });

  test("6. un tip nepermis este refuzat cu tipurile acceptate numite", async ({ page }) => {
    await signIn(page, ownerAccount());
    const clientId = await createClientRecord(page, `TEST Doc Tip ${RUN}`);
    await openDocuments(page, `/clienti/${clientId}`);

    // O extensie care nu este pe lista.
    const txt = `Notițe ${RUN}.txt`;
    await chooseAndSubmit(page, { name: txt, mimeType: "text/plain", buffer: Buffer.from("doar text") }, "altele");
    await expect(page.getByTestId("document-error")).toHaveText(
      `Tipul fișierului nu este acceptat. Se acceptă doar ${ALLOWED}.`,
      { timeout: 30_000 },
    );
    expect(await documentsNamed(txt)).toHaveLength(0);

    // O EXTENSIE BUNA PE UN CONTINUT GRESIT. Tipul se verifica pe primii octeti ai
    // fisierului stocat, nu pe extensie si nu pe ce spune browserul.
    const fake = `Factură falsă ${RUN}.pdf`;
    await chooseAndSubmit(
      page,
      { name: fake, mimeType: "application/pdf", buffer: Buffer.from("acesta nu este un PDF, este text") },
      "factura",
    );
    await expect(page.getByTestId("document-error")).toHaveText(
      `Conținutul fișierului nu corespunde extensiei lui. Se acceptă doar ${ALLOWED}.`,
      { timeout: 30_000 },
    );
    expect(await documentsNamed(fake)).toHaveLength(0);
    // Si obiectul pe care browserul apucase sa il trimita a fost sters.
    expect(await storedObjects(`client/${clientId}`)).toHaveLength(0);
    await expect(page.getByText("Niciun document")).toBeVisible();
  });

  test("7. ștergerea scoate rândul și obiectul și scrie cine a șters", async ({ page, browser }) => {
    await signIn(page, ownerAccount());
    const clientId = await createClientRecord(page, `TEST Doc Ștergere ${RUN}`);
    const name = `De șters ${RUN}.pdf`;
    await openDocuments(page, `/clienti/${clientId}`);
    await uploadOk(page, { name, mimeType: "application/pdf", buffer: pdf() }, "altele");

    const [doc] = await documentsNamed(name);
    expect(doc).toBeTruthy();
    const ownerId = await userIdByEmail(ownerAccount().email);
    expect(doc!.uploaded_by).toBe(ownerId);

    const objectUrl = `${env().origin}/storage/v1/object/rc-docs/${doc!.storage_path}`;
    expect((await fetch(objectUrl, { headers: serviceHeaders() })).status, "obiectul exista inainte").toBe(200);

    // OPERATORUL VEDE DOCUMENTUL, dar nu poate incarca si nu are buton de stergere.
    const managerContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const manager = await managerContext.newPage();
    await signIn(manager, managerAccount());
    await openDocuments(manager, `/clienti/${clientId}`, false);
    await expect(rowNamed(manager, name)).toBeVisible({ timeout: 20_000 });
    await expect(manager.getByTestId("document-upload")).toHaveCount(0);
    await expect(rowNamed(manager, name).getByTestId("document-delete")).toHaveCount(0);
    await managerContext.close();

    // ADMINISTRATORUL STERGE, cu confirmare.
    const row = rowNamed(page, name);
    await row.getByTestId("document-delete").click();
    await expect(row).toContainText("Ștergi definitiv documentul?");
    await row.getByTestId("document-delete-confirm").click();
    await expect(rowNamed(page, name)).toHaveCount(0, { timeout: 20_000 });

    // Randul nu mai exista.
    expect(await documentsNamed(name)).toHaveLength(0);

    // Obiectul nu mai exista.
    expect((await fetch(objectUrl, { headers: serviceHeaders() })).status, "obiectul dupa stergere").toBeGreaterThanOrEqual(400);

    // CINE A STERS, scris de declansatorul din 0044.
    const record = await rest<
      { document_id: string; client_id: string | null; storage_path: string; original_name: string; deleted_by: string | null; deleted_at: string | null }[]
    >(
      "document_deletions?select=document_id,client_id,storage_path,original_name,deleted_by,deleted_at" +
        `&document_id=eq.${doc!.id}`,
    );
    expect(record).toHaveLength(1);
    expect(record[0]!.deleted_by).toBe(ownerId);
    expect(record[0]!.client_id).toBe(clientId);
    expect(record[0]!.storage_path).toBe(doc!.storage_path);
    expect(record[0]!.original_name).toBe(name);
    expect(record[0]!.deleted_at).toBeTruthy();
  });

  test("8. fiecare text vizibil din fila Documente este românesc", async ({ page }) => {
    await signIn(page, ownerAccount());
    const clientId = await createClientRecord(page, `TEST Doc Limba ${RUN}`);
    await openDocuments(page, `/clienti/${clientId}`);
    const panel = page.getByTestId("panel-documente");

    // Starea goala.
    await expect(panel).toContainText("Niciun document");

    // Cele cinci tipuri, cu diacriticele lor.
    await expect(panel.getByTestId("document-kind").locator("option")).toHaveText([
      "Alege tipul",
      "Contract",
      "Act",
      "Factură",
      "Fotografie",
      "Altele",
    ]);

    // Butonul nativ al campului de fisier scrie in engleza, deci este ascuns vizual
    // si il inlocuieste eticheta romaneasca.
    const inputBox = await panel.getByTestId("document-input").boundingBox();
    expect(inputBox === null || (inputBox.width <= 1 && inputBox.height <= 1)).toBe(true);
    await expect(panel.getByTestId("document-choose")).toHaveText("Alege fișierul");
    await expect(panel.getByTestId("document-chosen")).toHaveText("Niciun fișier ales");

    // Mesajele fara fisier si fara tip.
    await panel.getByTestId("document-submit").click();
    await expect(panel.getByTestId("document-error")).toHaveText("Alege tipul documentului.");
    await panel.getByTestId("document-kind").selectOption("contract");
    await panel.getByTestId("document-submit").click();
    await expect(panel.getByTestId("document-error")).toHaveText("Alege un fișier.");

    const name = `Contract cadru ${RUN}.pdf`;
    await uploadOk(page, { name, mimeType: "application/pdf", buffer: pdf() }, "contract");
    await expect(panel.getByTestId("document-done")).toHaveText("Documentul a fost încărcat.");

    // Confirmarea stergerii, apoi renuntarea.
    const row = rowNamed(page, name);
    await row.getByTestId("document-delete").click();
    await expect(row.getByTestId("document-delete-confirm")).toHaveText("Da, șterge");
    await expect(row.getByTestId("document-delete-cancel")).toHaveText("Renunță");
    const confirmText = await panel.innerText();
    await row.getByTestId("document-delete-cancel").click();

    const text = await panel.innerText();
    for (const expected of [
      "Documente",
      "Tip document",
      "Fișier",
      "Alege fișierul",
      "Încarcă",
      `Se acceptă ${ALLOWED}, de cel mult 20 MB.`,
      "Denumire",
      "Tip",
      "Mărime",
      "Încărcat la",
      "Descarcă",
      "Șterge",
    ]) {
      expect(text, `lipseste "${expected}"`).toContain(expected);
    }
    expect(confirmText).toContain("Ștergi definitiv documentul?");

    const ENGLISH =
      /\b(Upload|Uploading|Download|Delete|Remove|Choose|chosen|File|Files|Size|Type|Name|Date|Cancel|Confirm|Loading|Error|Browse|Documents?|No file|Kind|Other|Invoice|Photo)\b/;
    expect(text).not.toMatch(ENGLISH);
    expect(confirmText).not.toMatch(ENGLISH);
  });

  test("doctrina densității: cel mult 5 rânduri pe filă, restul în lista completă", async ({ page }) => {
    await signIn(page, ownerAccount());
    const clientId = await createClientRecord(page, `TEST Doc Densitate ${RUN}`);
    await openDocuments(page, `/clienti/${clientId}`);

    const names: string[] = [];
    for (let i = 1; i <= 6; i++) {
      const name = `Act ${i} ${RUN}.pdf`;
      names.push(name);
      await uploadOk(page, { name, mimeType: "application/pdf", buffer: pdf() }, "act");
    }

    await openDocuments(page, `/clienti/${clientId}`);
    await expect(page.getByTestId("document-row")).toHaveCount(5);
    // Cele mai noi primele: primul incarcat este cel ramas pe dinafara.
    await expect(rowNamed(page, names[0]!)).toHaveCount(0);
    await expect(rowNamed(page, names[5]!)).toBeVisible();

    await page.getByTestId("documents-all").click();
    await expect(page).toHaveURL(/documente=toate/);
    await expect(page.getByTestId("document-row")).toHaveCount(6, { timeout: 20_000 });
    await expect(page.getByTestId("documents-pager")).toContainText("Pagina 1 din 1, 6 documente");

    await page.getByTestId("documents-summary").click();
    await expect(page.getByTestId("document-row")).toHaveCount(5, { timeout: 20_000 });
  });
});
