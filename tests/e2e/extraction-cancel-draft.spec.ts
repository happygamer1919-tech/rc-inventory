import { expect, test, type APIRequestContext, type Page, type Route } from "@playwright/test";
import { managerAccount, ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { MAKE_CALLBACK_SECRET, firedFor } from "./support/make";

// extraction-cancel-draft.spec - linia de acceptanta a cardului P3-84,
// constatarea F20 a lui Ivan, citata in termeni:
//
//   "a named e2e test cancels a draft from the review screen, sees it gone from
//    the queue, and reads the row still present with its new state."
//
// CE AFIRMA. Proprietarul renunta la un document de pe /incarca-comanda, cu un
// pas de confirmare si un motiv optional. Documentul iese din coada si ramane
// gasit sub ea, marcat "Renunțat". Randul ramane in baza, cu cine, cand si de
// ce, iar status, error_code si liniile raman exact cum erau. Confirmarea si
// retrimiterea il refuza pe server, un manager de cont nu poate renunta, iar un
// callback intarziat primeste acelasi cod HTTP ca azi si nu il readuce.
//
// DATELE DE TEST SE RENUNTA, NU SE STERG. Specul nu sterge niciun rand; fiecare
// fisier poarta eticheta RUN, ca in review.spec.
//
// AL DOILEA GRUP DE CAZURI, ADAUGAT DE CARDUL P3-93 (G49, constatarile F5 si
// F15), sta la finalul fisierului: acolo se citeste ce VEDE operatorul cand o
// retrimitere este refuzata, si nu ce raspunde serverul. Motivul pentru care
// traieste aici este ca refuzul folosit este chiar cel al renuntarii, pe care
// numai acest fisier stie sa il produca. Antetul lui isi poarta explicatia.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const CALLBACK = "/api/extraction/callback";
const UPLOAD = "/incarca-comanda";
const MACHINE_RETRIES = 2;

/** Mesajele actiunilor, scrise aici ca sa nu depinda de un import din fisierul
 *  "use server", care exporta numai functii. */
const NOT_ALLOWED = "Nu ai dreptul să renunți la un document.";
const CANCELLED_REFUSAL = "S-a renunțat la acest document. Nu mai poate fi confirmat sau retrimis.";

function pdfBytes(tag: string): Buffer {
  return Buffer.from(
    `%PDF-1.4\n% RC test ${tag}\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
    "utf8",
  );
}

/** Incarca un document pe banda de extragere si intoarce order_id-ul trimis.
 *  Acelasi drum ca in review.spec. */
async function uploadForExtraction(page: Page, request: APIRequestContext, tag: string): Promise<string> {
  const filename = `TEST-F20-${tag}-${RUN}.pdf`;
  await page.goto(UPLOAD);
  await page.getByTestId("extraction-input").setInputFiles({
    name: filename,
    mimeType: "application/pdf",
    buffer: pdfBytes(tag),
  });

  const card = page.locator(`[data-testid="draft-card"]`).filter({ hasText: filename });
  await expect(card).toHaveCount(1, { timeout: 30_000 });

  const orderId = (await card.getAttribute("data-order-id")) ?? "";
  expect(orderId).toMatch(/^[0-9a-f-]{36}$/i);

  const fired = await firedFor(request, orderId);
  expect(fired).toHaveLength(1);
  return orderId;
}

/** Un payload digital, cu o linie, din aceeasi forma ca in review.spec. */
function callbackBody(orderId: string, over: Record<string, unknown> = {}) {
  return {
    order_id: orderId,
    status: "extracted",
    error_code: null,
    reason: null,
    supplier_name: "Bilka Steel SRL",
    document_source: "digital",
    order_date: "2026-08-14",
    subtotal: 18450.0,
    vat_amount: 3690.0,
    document_total: 22140.0,
    prices_include_vat: false,
    vat_rate: 20.0,
    currency: "MDL",
    currency_raw: "lei",
    confidence: 0.94,
    lines: [
      {
        product_name: `Tigla metalica F20 ${RUN}`,
        quantity: 240.5,
        unit: "m2",
        unit_raw: "mp",
        unit_price: 76.72,
        line_total: 18450.0,
        currency: "MDL",
        currency_raw: "lei",
        category: null,
        category_raw: "Invelitori",
        confidence: 0.91,
      },
    ],
    _meta: { model: "gpt-4o-mini", prompt_version: "v2.0", page_count: 1, duration_ms: 1200 },
    ...over,
  };
}

function post(request: APIRequestContext, body: unknown) {
  return request.post(CALLBACK, {
    headers: { "Content-Type": "application/json", "x-rc-callback-secret": MAKE_CALLBACK_SECRET },
    data: body,
    maxRetries: MACHINE_RETRIES,
  });
}

/** Randul citit pe drumul masinii: `select *`, deci si cele trei coloane noi. */
async function draftState(request: APIRequestContext, orderId: string) {
  const r = await request.get(`${CALLBACK}?order_id=${orderId}`, {
    headers: { "x-rc-callback-secret": MAKE_CALLBACK_SECRET },
    maxRetries: MACHINE_RETRIES,
  });
  expect(r.status(), "randul exista si se poate citi").toBe(200);
  return (await r.json()) as Record<string, unknown> & { lines: Record<string, unknown>[] };
}

function draftCard(page: Page, orderId: string) {
  return page.locator(`[data-testid="draft-card"][data-order-id="${orderId}"]`);
}

function cancelledCard(page: Page, orderId: string) {
  return page.locator(`[data-testid="cancelled-card"][data-order-id="${orderId}"]`);
}

/** Renuntarea prin ecran, exact drumul omului: butonul, pasul de confirmare,
 *  motivul, confirmarea. */
async function cancelFromScreen(page: Page, orderId: string, reason: string) {
  await page.goto(UPLOAD);
  const card = draftCard(page, orderId);
  await expect(card).toHaveCount(1, { timeout: 30_000 });
  await card.getByTestId("draft-cancel").click();

  const block = card.getByTestId("draft-cancel-block");
  await expect(block).toBeVisible();
  await expect(block).toContainText(
    "Documentul dispare din listă, dar rămâne păstrat și poate fi găsit la Documente la care s-a renunțat.",
  );
  await expect(block.getByTestId("draft-cancel-keep")).toHaveText("Nu, păstrează");
  if (reason) await block.getByTestId("draft-cancel-reason").fill(reason);
  await block.getByTestId("draft-cancel-confirm").click();

  await expect(draftCard(page, orderId)).toHaveCount(0, { timeout: 30_000 });
}

/** Deschide sectiunea documentelor la care s-a renuntat. */
async function openCancelledSection(page: Page) {
  const section = page.getByTestId("cancelled-section");
  await expect(section).toHaveCount(1, { timeout: 20_000 });
  if ((await section.getAttribute("open")) === null) {
    await section.locator("summary").click();
  }
  return section;
}

// ---------------------------------------------------------------------------
// ACTIUNEA DE SERVER, PRINSA SI TRIMISA DIN NOU.
//
// Aceeasi forma ca in document-download-security.spec: cererea pleaca din
// browser la un clic real, se prinde cu antetul Next-Action si corpul ei, si se
// OPRESTE inainte sa ajunga la server. Trimisa din nou mai tarziu, cu alta
// sesiune sau dupa renuntare, ea dovedeste paza DE PE SERVER, nu lipsa butonului.
// ---------------------------------------------------------------------------

type CapturedAction = { url: string; headers: Record<string, string>; body: string };

async function captureAction(page: Page, click: () => Promise<void>): Promise<CapturedAction> {
  const holder: { action: CapturedAction | null } = { action: null };
  const pattern = `**${UPLOAD}`;
  const handler = async (route: Route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"] && holder.action === null) {
      const all = await request.allHeaders();
      const headers: Record<string, string> = {};
      for (const key of ["next-action", "content-type", "accept", "next-router-state-tree", "origin"]) {
        if (all[key]) headers[key] = all[key]!;
      }
      if (!headers.origin) headers.origin = new URL(request.url()).origin;
      holder.action = { url: request.url(), headers, body: request.postData() ?? "" };
      await route.abort();
      return;
    }
    await route.continue();
  };
  await page.route(pattern, handler);
  await click();
  await expect.poll(() => holder.action !== null, { timeout: 15_000 }).toBe(true);
  await page.unroute(pattern, handler);
  return holder.action!;
}

/** Textul raspunsului unei actiuni, cu eventualele secvente \uXXXX decodate, ca
 *  un mesaj cu diacritice sa se poata compara intreg. */
async function replay(context: APIRequestContext, action: CapturedAction): Promise<string> {
  const response = await context.post(action.url, {
    headers: action.headers,
    data: action.body,
    maxRedirects: 0,
  });
  const text = await response.text();
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

// ---------------------------------------------------------------------------
// CINE ESTE CEL CARE A RENUNTAT, citit cu cheia de service_role, ca in
// review.spec. DACA CHEIA LIPSESTE, CAZUL CADE, nu sare.
// ---------------------------------------------------------------------------

function restAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "cazul are nevoie de NEXT_PUBLIC_SUPABASE_URL si SUPABASE_SERVICE_ROLE_KEY. " +
        "In CI sunt exportate de pasul 'Export local Supabase credentials'.",
    );
  }
  return { origin: new URL(url).origin, auth: { Authorization: `Bearer ${key}`, apikey: key } };
}

/** Emailul contului de autentificare si numele afisat al profilului unui id. */
async function whoIs(userId: string): Promise<{ email: string; displayName: string }> {
  const rest = restAdmin();
  const user = await fetch(`${rest.origin}/auth/v1/admin/users/${userId}`, { headers: rest.auth });
  expect(user.status, "contul celui care a renuntat exista").toBe(200);
  const email = String(((await user.json()) as { email?: string }).email ?? "");

  const profile = await fetch(`${rest.origin}/rest/v1/profiles?select=full_name,email&id=eq.${userId}`, {
    headers: rest.auth,
  });
  expect(profile.status).toBe(200);
  const [row] = (await profile.json()) as { full_name: string | null; email: string | null }[];
  const displayName = row?.full_name?.trim() || row?.email?.trim() || "Fără nume";
  return { email, displayName };
}

test.describe("G39 F20: renunțarea la un document de pe ecranul de verificare", () => {
  test.describe.configure({ timeout: 180_000 });

  test("G39 F20: 1. proprietarul renunță la un document citit, care iese din coadă și rămâne în bază", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "citit");
    expect((await post(request, callbackBody(orderId))).status(), "prima sosire").toBe(202);

    const before = await draftState(request, orderId);
    expect(before.status).toBe("extracted");
    expect(before.cancelled_at, "inainte de renuntare coloana este goala").toBeNull();
    const linesBefore = before.lines.length;
    expect(linesBefore).toBeGreaterThan(0);

    const reason = `Document de test F20 ${RUN}`;
    await cancelFromScreen(page, orderId, reason);

    // DISPARUT DIN COADA, GASIT DEDESUBT, MARCAT.
    const section = await openCancelledSection(page);
    const row = cancelledCard(page, orderId);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Renunțat");
    await expect(row).toContainText(`TEST-F20-citit-${RUN}.pdf`);
    await expect(row.getByTestId("cancelled-reason")).toHaveText(`Motiv: ${reason}`);

    // RANDUL ESTE INCA ACOLO, CU STAREA NOUA. Aceasta este linia lui Ivan.
    const after = await draftState(request, orderId);
    expect(after.order_id, "randul exista inca").toBe(orderId);
    expect(after.cancelled_at, "cancelled_at scris").not.toBeNull();
    expect(after.cancel_reason, "motivul asa cum a fost tastat").toBe(reason);
    expect(after.status, "status neschimbat").toBe(before.status);
    expect(after.error_code, "error_code neschimbat").toBe(before.error_code);
    expect(after.confirmed_at, "nu a fost confirmat").toBeNull();
    expect(after.lines, "liniile raman, acelasi numar").toHaveLength(linesBefore);

    // CINE: proprietarul, si numele lui pe ecran.
    const who = await whoIs(String(after.cancelled_by));
    expect(who.email.toLowerCase(), "cancelled_by este proprietarul").toBe(ownerAccount().email.toLowerCase());
    await expect(row.getByTestId("cancelled-by")).toHaveText(who.displayName);
    await expect(section).toBeVisible();
  });

  test("G39 F20: 2. un document încă în lucru poate fi abandonat și iese din coadă", async ({
    page,
    request,
  }, testInfo) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "inlucru");

    const before = await draftState(request, orderId);
    expect(before.status, "niciun raspuns inca").toBeNull();

    // PE TELEFON, O DATA: pasul de confirmare se aseaza unul sub altul si nu
    // iese din ecran la 390px. Se masoara numai blocul acestui card, nu tot
    // ecranul, care are propriile lui teste de telefon.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(UPLOAD);
    const phoneCard = draftCard(page, orderId);
    await expect(phoneCard).toHaveCount(1, { timeout: 30_000 });
    await phoneCard.getByTestId("draft-cancel").click();
    const block = phoneCard.getByTestId("draft-cancel-block");
    await expect(block).toBeVisible();
    for (const id of ["draft-cancel-block", "draft-cancel-reason", "draft-cancel-confirm", "draft-cancel-keep"]) {
      const box = await phoneCard.getByTestId(id).boundingBox();
      expect(box, `${id} este pe ecran`).not.toBeNull();
      expect(box!.x + box!.width, `${id} nu iese din ecran la 390px`).toBeLessThanOrEqual(390 + 0.5);
    }
    const confirmBox = await block.getByTestId("draft-cancel-confirm").boundingBox();
    const keepBox = await block.getByTestId("draft-cancel-keep").boundingBox();
    expect(keepBox!.y, "butoanele se aseaza unul sub altul pe telefon").toBeGreaterThan(confirmBox!.y);
    await page.screenshot({ path: testInfo.outputPath("g39-f20-cancel-block-390.png") });
    await block.getByTestId("draft-cancel-keep").click();
    await expect(block, "Nu, păstrează inchide pasul fara sa renunte").toHaveCount(0);
    expect((await draftState(request, orderId)).cancelled_at, "nimic scris").toBeNull();
    // Inapoi la marimea proiectului, Desktop Chrome.
    await page.setViewportSize({ width: 1280, height: 720 });

    await cancelFromScreen(page, orderId, "");
    await openCancelledSection(page);
    await expect(cancelledCard(page, orderId)).toHaveCount(1);
    await expect(cancelledCard(page, orderId).getByTestId("cancelled-reason")).toHaveText("Fără motiv.");

    const after = await draftState(request, orderId);
    expect(after.cancelled_at).not.toBeNull();
    expect(after.cancel_reason, "fara motiv inseamna null, nu sir gol").toBeNull();
    expect(after.status, "tot fara status").toBeNull();
  });

  test("G39 F20: 3. după renunțare, confirmarea și retrimiterea sunt refuzate pe server", async ({ page, request }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "paza");
    expect(
      (
        await post(
          request,
          callbackBody(orderId, {
            status: "partial",
            error_code: "extraction_failed",
            reason: `O pozitie nu a putut fi citita ${RUN}`,
          }),
        )
      ).status(),
    ).toBe(202);

    // Cele doua actiuni, prinse la un clic real si oprite inainte de server.
    await page.goto(UPLOAD);
    const card = draftCard(page, orderId);
    await expect(card).toHaveCount(1, { timeout: 30_000 });
    await card.getByTestId("draft-review").click();
    await expect(page.getByTestId("review-form")).toBeVisible({ timeout: 15_000 });
    const confirmAction = await captureAction(page, () => page.getByTestId("review-confirm").click());

    await page.goto(UPLOAD);
    await expect(draftCard(page, orderId)).toHaveCount(1, { timeout: 30_000 });
    const refireAction = await captureAction(page, () =>
      draftCard(page, orderId).getByTestId("draft-refire").click(),
    );
    const firedBefore = (await firedFor(request, orderId)).length;

    await cancelFromScreen(page, orderId, "Paza de server");

    // Pe ecran nu mai exista nicio cale: fisa a iesit din coada, cu butoanele ei.
    await page.goto(UPLOAD);
    await expect(draftCard(page, orderId)).toHaveCount(0, { timeout: 20_000 });

    // SI PE SERVER: aceleasi cereri, trimise din nou cu sesiunea proprietarului.
    const confirmText = await replay(page.request, confirmAction);
    expect(confirmText, "confirmarea este refuzata").toContain(CANCELLED_REFUSAL);
    const refireText = await replay(page.request, refireAction);
    expect(refireText, "retrimiterea este refuzata").toContain(CANCELLED_REFUSAL);

    // Nimic nu a plecat din nou spre extragere, si randul nu s-a miscat.
    expect((await firedFor(request, orderId)).length, "nicio trimitere noua").toBe(firedBefore);
    const after = await draftState(request, orderId);
    expect(after.confirmed_at, "nicio comanda creata").toBeNull();
    expect(after.cancelled_at).not.toBeNull();
    expect(after.status, "retrimiterea nu a golit statusul").toBe("partial");
  });

  test("G39 F20: 4. managerul de cont nu vede butonul și este refuzat pe server", async ({
    page,
    request,
    browser,
  }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "rol");
    expect((await post(request, callbackBody(orderId))).status()).toBe(202);

    // Cererea de renuntare a proprietarului, prinsa si oprita: nu a renuntat nimeni.
    await page.goto(UPLOAD);
    const card = draftCard(page, orderId);
    await expect(card).toHaveCount(1, { timeout: 30_000 });
    await card.getByTestId("draft-cancel").click();
    await card.getByTestId("draft-cancel-reason").fill("Incercare a managerului");
    const cancelAction = await captureAction(page, () => card.getByTestId("draft-cancel-confirm").click());
    expect((await draftState(request, orderId)).cancelled_at, "cererea prinsa nu a ajuns").toBeNull();

    const managerContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const manager = await managerContext.newPage();
    await signIn(manager, managerAccount());
    await manager.goto(UPLOAD);
    const managerCard = draftCard(manager, orderId);
    await expect(managerCard, "managerul vede documentul in coada").toHaveCount(1, { timeout: 30_000 });
    await expect(managerCard.getByTestId("draft-cancel"), "dar nu si butonul").toHaveCount(0);

    const refused = await replay(managerContext.request, cancelAction);
    expect(refused, "actiunea refuza managerul").toContain(NOT_ALLOWED);
    const after = await draftState(request, orderId);
    expect(after.cancelled_at, "randul a ramas nerenuntat").toBeNull();
    expect(after.cancel_reason).toBeNull();
    await managerContext.close();

    // Datele de test se renunta, nu se lasa in coada: proprietarul renunta acum.
    await cancelFromScreen(page, orderId, "Curatenie dupa cazul 4");
  });

  test("G39 F20: 5. un callback sosit după renunțare primește același cod și documentul rămâne abandonat", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "tarziu");
    expect((await post(request, callbackBody(orderId))).status(), "prima sosire").toBe(202);

    await cancelFromScreen(page, orderId, "Callback intarziat");
    const cancelled = await draftState(request, orderId);

    // O a doua sosire pentru acelasi order_id raspunde 200, ca azi: ruta nu a
    // fost atinsa de acest card.
    const late = await post(request, callbackBody(orderId));
    expect(late.status(), "acelasi cod ca pentru orice a doua sosire").toBe(200);

    const after = await draftState(request, orderId);
    expect(after.cancelled_at, "renuntarea nu a fost stearsa").toBe(cancelled.cancelled_at);
    expect(after.cancelled_by).toBe(cancelled.cancelled_by);
    expect(after.cancel_reason).toBe("Callback intarziat");

    await page.goto(UPLOAD);
    await expect(draftCard(page, orderId), "nu revine in coada").toHaveCount(0, { timeout: 20_000 });
    await openCancelledSection(page);
    await expect(cancelledCard(page, orderId)).toHaveCount(1);
  });

  test("G39 F20: 6. niciun document abandonat nu este numărat în coadă", async ({ page, request }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "numar");
    await cancelFromScreen(page, orderId, "");

    await page.goto(UPLOAD);
    const section = await openCancelledSection(page);
    const rows = page.getByTestId("cancelled-card");
    const shown = await rows.count();
    expect(shown).toBeGreaterThanOrEqual(1);

    // Numarul din titlu este numarul randurilor, nimic in plus.
    await expect(section.locator("summary")).toHaveText(`Documente la care s-a renunțat (${shown})`);

    // Si niciunul dintre ele nu este si in coada.
    const cancelledIds = await rows.evaluateAll((els) => els.map((el) => el.getAttribute("data-order-id")));
    const queueIds = await page
      .getByTestId("draft-card")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-order-id")));
    for (const id of cancelledIds) {
      expect(queueIds, `documentul ${id} nu este si in coada`).not.toContain(id);
    }
  });
});

// ---------------------------------------------------------------------------
// G49, constatarile F5 si F15 ale maturarii CRITIC din 2026-09-22, cardul P3-93.
//
// CE LIPSEA. Cazul 3 de mai sus dovedeste ca SERVERUL refuza retrimiterea unui
// document la care s-a renuntat, prin cererea prinsa si trimisa din nou, si nu
// citeste ecranul deloc. review.spec si extraction.spec apasa "Retrimite" si se
// uita la ce a ajuns la webhook. Niciun spec nu intreba CE I SE SPUNE
// OPERATORULUI cand o retrimitere este refuzata, si exact de aceea F5 a putut
// trece neobservat: butonul arunca raspunsul actiunii.
//
// CAZUL DE AICI APASA BUTONUL PE ECRAN si citeste cutia rosie de pe fisa.
//
// FILA LASATA DESCHISA, si nu un truc de test: coada se citeste pe server la
// randare, deci o fila deschisa inainte de renuntare arata mai departe butonul
// "Retrimite" pentru un document care intre timp nu mai poate fi retrimis.
// Aceasta este forma reala a defectului, aceeasi cu a sesiunii expirate peste
// noapte, si singura dintre cele cinci refuzuri care se poate produce fara
// schele noi: renuntarea este deja stiuta de acest fisier.
//
// DE CE NU SI SESIUNEA EXPIRATA. Proxy-ul din proxy.ts redirecteaza catre
// ecranul de autentificare ORICE cerere fara sesiune catre o cale care nu este
// pe lista permisa, iar actiunea de server este o astfel de cerere. Dupa un
// signOut apasarea butonului nu ar mai ajunge niciodata la refireExtraction, si
// cazul ar dovedi proxy-ul in locul ecranului. Refuzul acela ramane acoperit de
// tipul actiunii, nu de un spec.
// ---------------------------------------------------------------------------

test.describe("G49 F15: refuzul retrimiterii ajunge pe ecran", () => {
  test.describe.configure({ timeout: 180_000 });

  test("G49 F15: retrimiterea refuzată spune pe fișă de ce a fost refuzată", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "refuz");

    // "Partial" este starea pe care fisa arata butonul "Retrimite".
    expect(
      (
        await post(
          request,
          callbackBody(orderId, {
            status: "partial",
            error_code: "extraction_failed",
            reason: `O pozitie nu a putut fi citita ${RUN}`,
          }),
        )
      ).status(),
    ).toBe(202);

    // FILA UNU, deschisa cat documentul se mai poate retrimite.
    await page.goto(UPLOAD);
    const card = draftCard(page, orderId);
    await expect(card).toHaveCount(1, { timeout: 30_000 });
    await expect(card.getByTestId("draft-refire")).toHaveText("Retrimite");
    await expect(page.getByTestId("draft-refire-error"), "nimic rosu inainte de apasare").toHaveCount(0);

    // FILA DOI, acelasi proprietar, renunta la document.
    const other = await page.context().newPage();
    await cancelFromScreen(other, orderId, `Renunțare G49 ${RUN}`);
    await other.close();

    const firedBefore = (await firedFor(request, orderId)).length;

    // FILA UNU APASA BUTONUL, fara sa stie nimic despre renuntare.
    await card.getByTestId("draft-refire").click();

    const message = card.getByTestId("draft-refire-error");
    await expect(message, "motivul este pe ecran").toBeVisible({ timeout: 20_000 });
    await expect(message).toHaveText(CANCELLED_REFUSAL);
    await expect(message).toHaveAttribute("role", "alert");
    // PE FISA CARE A PRIMIT REFUZUL, si nicaieri altundeva in lista.
    await expect(page.getByTestId("draft-refire-error"), "un singur mesaj in toata coada").toHaveCount(1);
    // Butonul s-a intors la starea lui, deci ecranul nu ramane blocat.
    await expect(card.getByTestId("draft-refire")).toHaveText("Retrimite");

    // SI NIMIC NU S-A INTAMPLAT DINCOLO DE MESAJ.
    expect((await firedFor(request, orderId)).length, "nicio trimitere noua").toBe(firedBefore);
    const after = await draftState(request, orderId);
    expect(after.cancelled_at, "documentul a ramas abandonat").not.toBeNull();
    expect(after.status, "retrimiterea refuzata nu a golit statusul").toBe("partial");
    expect(after.confirmed_at, "nicio comanda creata").toBeNull();
  });
});
