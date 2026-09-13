import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { managerAccount, ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// clients.spec - linia de acceptanta a cardului P3-06.
//
// Acopera exact ce numeste cardul: lista vine din baza si nu dintr-un strat
// demonstrativ; cautarea potriveste fara diacritice si fara majuscule; cautarea
// dupa IDNO potriveste exact; filtrul de stare ascunde clientii dezactivati si
// "toate" ii arata; lista pagineaza la 25 si nu randeaza un tabel nemarginit;
// un clic pe rand deschide ruta de detaliu si butonul de inapoi al browserului
// intoarce la lista CU termenul de cautare intact; crearea persista peste o
// reincarcare; un IDNO duplicat este refuzat cu mesaj romanesc; fiecare sir
// vizibil este romanesc.
//
// DATELE DE TEST NU SE STERG NICIODATA. Fiecare client creat aici poarta
// prefixul TEST in denumire si sfarseste DEZACTIVAT, niciodata sters, exact ca
// randurile din conventia P2-07. Un DELETE scris pentru o baza de test este un
// DELETE care ajunge intr-o zi pe una reala.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

/** Denumire unica pe rulare, ca doua rulari sa nu se gaseasca una pe alta. */
function clientName(tag: string): string {
  return `TEST ${tag} ${RUN}`;
}

/** IDNO unic pe rulare. Treisprezece cifre, ca un IDNO real. */
function idno(seed: number): string {
  return String(1000000000000 + (Number(`0x${RUN.slice(-4)}`) || 1) * 100 + seed).slice(0, 13);
}

async function createClient(
  page: Page,
  opts: { name: string; type?: "company" | "individual"; fiscal?: string; phone?: string },
) {
  await page.goto("/clienti");
  await page.getByTestId("client-new").click();
  await expect(page.getByTestId("client-form")).toBeVisible();
  await page.getByTestId("field-client-name").fill(opts.name);
  if (opts.type) await page.getByTestId("field-client-type").selectOption(opts.type);
  if (opts.fiscal) await page.getByTestId("field-client-fiscal").fill(opts.fiscal);
  if (opts.phone) await page.getByTestId("field-client-phone").fill(opts.phone);
  await page.getByTestId("client-submit").click();
}

test.describe("Clienți", () => {
  // Fiecare test isi construieste propriile randuri prin interfata: cateva
  // navigari si scrieri inainte de prima afirmatie.
  test.describe.configure({ timeout: 90_000 });

  test("lista vine din baza de date, iar crearea persistă peste o reîncărcare", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());

    const name = clientName("Persistenta");
    await createClient(page, { name, fiscal: idno(1), phone: "069 123 456" });

    // Crearea duce direct pe fisa clientului: cine tocmai a adaugat un client
    // vrea sa continue cu el, nu sa il caute inapoi in lista.
    await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("client-detail")).toContainText(name);

    // Si supravietuieste unei reincarcari complete, care este diferenta dintre
    // "s-a scris in baza" si "traieste in starea unui component".
    await page.reload();
    await expect(page.getByTestId("client-detail")).toContainText(name);

    await page.goto("/clienti");
    await page.getByTestId("clients-search").fill(name);
    await expect(page.locator(`[data-testid="client-row"][data-name="${name}"]`)).toHaveCount(1, {
      timeout: 15_000,
    });
  });

  test("căutarea ignoră diacriticele și majusculele, iar IDNO-ul potrivește exact", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());

    const fiscal = idno(2);
    const name = clientName("Țiglă Șantier");
    await createClient(page, { name, fiscal });
    await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });

    await page.goto("/clienti");

    // Fara diacritice si cu alta capitalizare. Operatorul scrie repede si
    // aproape niciodata cu diacritice.
    await page.getByTestId("clients-search").fill(`tigla santier ${RUN}`);
    await expect(page.locator(`[data-testid="client-row"][data-name="${name}"]`)).toHaveCount(1, {
      timeout: 15_000,
    });

    // Dupa IDNO, in aceeasi casuta. Nu exista un al doilea camp de cautare:
    // operatorul stie ce cauta, nu in ce coloana se afla.
    await page.getByTestId("clients-search").fill(fiscal);
    await expect(page.locator(`[data-testid="client-row"][data-name="${name}"]`)).toHaveCount(1, {
      timeout: 15_000,
    });

    // Si un IDNO care nu exista nu gaseste nimic, in loc sa cada inapoi pe
    // toata lista. O cautare care intoarce tot cand nu gaseste nimic este mai
    // rea decat una care nu gaseste nimic, pentru ca operatorul o crede.
    await page.getByTestId("clients-search").fill("9999999999999");
    await expect(page.getByTestId("client-row")).toHaveCount(0, { timeout: 15_000 });
  });

  test("un IDNO duplicat este refuzat cu mesaj românesc", async ({ page }) => {
    await signIn(page, ownerAccount());

    const fiscal = idno(3);
    await createClient(page, { name: clientName("Primul"), fiscal });
    await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });

    await createClient(page, { name: clientName("Al doilea"), fiscal });
    const error = page.getByTestId("form-error");
    await expect(error).toBeVisible({ timeout: 20_000 });
    await expect(error).toContainText("IDNO");
    // Mesaj romanesc, nu o eroare Postgres pe ecran.
    await expect(error).not.toContainText("duplicate key");
    await expect(error).not.toContainText("violates");
  });

  test("filtrul de stare ascunde clienții dezactivați, iar toate îi arată", async ({ page }) => {
    await signIn(page, ownerAccount());

    const name = clientName("Dezactivat");
    await createClient(page, { name, fiscal: idno(4) });
    await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });

    // Dezactivarea NU este stergere: migratia 0013 nu are politica de delete
    // pentru niciun rol.
    await page.getByTestId("client-edit").click();
    await expect(page.getByTestId("client-form")).toBeVisible();
    await page.getByTestId("field-client-active").uncheck();
    await page.getByTestId("client-submit").click();
    await expect(page.getByTestId("client-form")).toHaveCount(0, { timeout: 20_000 });

    const row = page.locator(`[data-testid="client-row"][data-name="${name}"]`);

    await page.goto(`/clienti?q=${encodeURIComponent(name)}`);
    await expect(row).toHaveCount(0, { timeout: 15_000 });

    await page.goto(`/clienti?q=${encodeURIComponent(name)}&stare=inactive`);
    await expect(row).toHaveCount(1, { timeout: 15_000 });

    await page.goto(`/clienti?q=${encodeURIComponent(name)}&stare=toate`);
    await expect(row).toHaveCount(1, { timeout: 15_000 });

    // Si randul este in continuare acolo, cu starea marcata. Dezactivat inseamna
    // ascuns din selectoare, nu disparut din istoric.
    await expect(row).toContainText("Inactiv");
  });

  test("lista paginează la 25 și nu randează un tabel nemărginit", async ({ page }) => {
    await signIn(page, ownerAccount());

    await page.goto("/clienti?stare=toate");
    // NICIODATA MAI MULT DE 25 DE RANDURI PE PAGINA. Este afirmatia numita de
    // card, si este verificabila fara sa se creeze 26 de clienti: pagina cere
    // 25 de la server si nu poate desena mai multe decat i s-au dat.
    const rows = page.getByTestId("client-row");
    expect(await rows.count()).toBeLessThanOrEqual(25);

    // Paginarea apare numai cand exista mai mult de o pagina. Un subsol de
    // paginare pe o lista de trei randuri este zgomot.
    const pagination = page.getByTestId("clients-pagination");
    if (await pagination.isVisible()) {
      await expect(pagination).toContainText("Pagina");
    }
  });

  test("un clic pe rând deschide fișa, iar butonul înapoi întoarce la listă cu căutarea intactă", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());

    const name = clientName("Navigare");
    await createClient(page, { name, fiscal: idno(5) });
    await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });

    // Se ajunge in lista CU un termen de cautare in URL, care este exact ce
    // trebuie sa supravietuiasca navigarii.
    await page.goto(`/clienti?q=${encodeURIComponent(name)}`);
    const row = page.locator(`[data-testid="client-row"][data-name="${name}"]`);
    await expect(row).toHaveCount(1, { timeout: 15_000 });

    await row.getByTestId("client-link").click();
    await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/clienti\/[0-9a-f-]{36}/);

    // INAPOI DUCE LA LISTA CU CAUTAREA INTACTA. Filtrul traieste in URL tocmai
    // ca sa faca asta: un filtru care traieste numai in starea componentului
    // este un ecran pe care nu il poti trimite nimanui.
    await page.goBack();
    await expect(page).toHaveURL(/\/clienti\?/);
    await expect(page.getByTestId("clients-search")).toHaveValue(name);
    await expect(row).toHaveCount(1, { timeout: 15_000 });
  });

  test("operatorul vede clienții dar nu poate scrie", async ({ page }) => {
    await signIn(page, managerAccount());
    await page.goto("/clienti");

    // Lista se vede: rolul citeste, politicile de select din 0013 sunt
    // "to authenticated using (true)".
    await expect(page.getByTestId("clients-filters")).toBeVisible();

    // Butonul NU exista. P3-06: un ecran care ofera un buton pe care baza il va
    // refuza este defectul, nu politica.
    await expect(page.getByTestId("client-new")).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// P3-43. ETAPA CLIENTULUI.
//
// Fiecare clauza numeste linia din lista de acceptanta a predarii proprietarului,
// partea 4.8, pe care o dovedeste. VALORILE ASTEPTATE SUNT SCRISE AICI, NU
// IMPORTATE din lib/data/clients-types: un test care importa lucrul pe care il
// verifica dovedeste doar ca acel lucru este egal cu el insusi.
//
// SE CITESTE DIN RANDUL STOCAT, NU DE PE ECRAN, prin PostgREST, cu jetonul
// administratorului obtinut ca in deviz.spec. Ecranul poate arata o valoare pe
// care baza nu a primit-o niciodata; randul nu.
//
// CE NU POATE DOVEDI ACEASTA SUITA, SPUS AICI. Clauza 5 cere si ca fiecare client
// existent inainte de migratie sa devina `client`. Stiva locala isi creeaza
// randurile DUPA ce toate migratiile au rulat, deci nu exista niciun rand vechi de
// verificat. Aceasta jumatate o dovedeste migratia 0039 pe ea insasi, intr-un
// bloc DO.
//
// DATELE DE TEST NU SE STERG. Clientii de mai jos poarta prefixul TEST, iar cei
// creati numai pentru ordonare sunt creati dezactivati.
// ---------------------------------------------------------------------------

const STAGES = ["cold", "nurture", "follow_up", "quoted", "client"] as const;
type Stage = (typeof STAGES)[number];

const STAGE_LABEL: Record<Stage, string> = {
  cold: "Lead rece",
  nurture: "În cultivare",
  follow_up: "De reluat",
  quoted: "Ofertat",
  client: "Client",
};

const STAGE_COLOUR: Record<Stage, string> = {
  cold: "red",
  nurture: "blue",
  follow_up: "amber",
  quoted: "purple",
  client: "green",
};

const FOLLOW_UP_REQUIRED = "Pentru etapa De reluat trebuie completată data de reluare.";

type OwnerRest = {
  api: APIRequestContext;
  headers: Record<string, string>;
  userId: string;
};

/** O legatura directa la PostgREST, ca administratorul, fara ecran. */
async function ownerRest(): Promise<OwnerRest> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  expect(url, "P3-43 are nevoie de NEXT_PUBLIC_SUPABASE_URL").not.toBe("");
  expect(anonKey, "P3-43 are nevoie de NEXT_PUBLIC_SUPABASE_ANON_KEY").not.toBe("");

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

type StoredClient = { stage: string; follow_up_date: string | null; phone: string | null };

async function storedClient(rest: OwnerRest, id: string): Promise<StoredClient> {
  const response = await rest.api.get(
    `/rest/v1/clients?id=eq.${id}&select=stage,follow_up_date,phone`,
    { headers: rest.headers },
  );
  expect(response.status(), await response.text()).toBe(200);
  const rows = (await response.json()) as StoredClient[];
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

type StoredHistory = {
  entity_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  created_at: string;
};

async function storedHistory(rest: OwnerRest, id: string): Promise<StoredHistory[]> {
  const response = await rest.api.get(
    `/rest/v1/status_history?entity_type=eq.client&entity_id=eq.${id}` +
      "&select=entity_id,from_status,to_status,changed_by,created_at&order=created_at.asc",
    { headers: rest.headers },
  );
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as StoredHistory[];
}

/** Id-ul clientului abia creat, din ruta de detaliu pe care a ajuns ecranul. */
async function createdClientId(page: Page): Promise<string> {
  await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });
  const match = /\/clienti\/([0-9a-f-]{36})/.exec(page.url());
  expect(match, `nu s-a ajuns pe fisa clientului: ${page.url()}`).not.toBeNull();
  return match![1]!;
}

async function saveStage(page: Page, stage: Stage, opts: { phone?: string } = {}) {
  await page.getByTestId("client-edit").click();
  await expect(page.getByTestId("client-form")).toBeVisible();
  await page.getByTestId("field-client-stage").selectOption(stage);
  if (opts.phone !== undefined) await page.getByTestId("field-client-phone").fill(opts.phone);
  await page.getByTestId("client-submit").click();
  await expect(page.getByTestId("client-form")).toHaveCount(0, { timeout: 20_000 });
}

/** Eticheta romaneasca, culoarea ALATURI de ea, si niciun token brut pe ecran. */
async function expectStageOnScreen(page: Page, stage: Stage) {
  const box = page.getByTestId("client-stage");
  await expect(box.getByTestId("client-stage-label")).toHaveText(STAGE_LABEL[stage], {
    timeout: 15_000,
  });
  const colour = box.getByTestId("client-stage-colour");
  await expect(colour).toBeVisible();
  await expect(colour).toHaveAttribute("data-colour", STAGE_COLOUR[stage]);

  // `client` nu se verifica aici: tokenul si eticheta difera doar prin majuscula.
  for (const token of ["cold", "nurture", "follow_up", "quoted"]) {
    await expect(page.getByTestId("client-detail")).not.toContainText(token);
  }
}

test.describe("Clienți, etapa (P3-43)", () => {
  test.describe.configure({ timeout: 120_000 });

  test("P3-43 (1)(5): un client nou fără etapă este Lead rece, iar etapa se alege din formular și se citește din rândul stocat", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const rest = await ownerRest();

    await createClient(page, { name: clientName("Etapa") });
    const id = await createdClientId(page);

    // HANDOVER 4.8 LINE 10, A DOUA JUMATATE: un client creat fara etapa aleasa
    // se stocheaza `cold`.
    expect((await storedClient(rest, id)).stage).toBe("cold");
    await expectStageOnScreen(page, "cold");

    // CINCI ETAPE, IN ORDINEA DECLARATA, CU ETICHETE ROMANESTI. Tokenul este doar
    // valoarea optiunii, niciodata textul ei.
    await page.getByTestId("client-edit").click();
    const options = page.getByTestId("field-client-stage").locator("option");
    await expect(options).toHaveText(STAGES.map((s) => STAGE_LABEL[s]));
    expect(
      await options.evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value)),
    ).toEqual([...STAGES]);
    await page.getByTestId("client-form").getByRole("button", { name: "Renunță" }).click();
    await expect(page.getByTestId("client-form")).toHaveCount(0);

    for (const stage of ["nurture", "quoted", "client", "cold"] as const) {
      await saveStage(page, stage);
      await expect.poll(async () => (await storedClient(rest, id)).stage).toBe(stage);
      await expectStageOnScreen(page, stage);
    }

    await rest.api.dispose();
  });

  test("P3-43 (2): etapele se ordonează în ordinea declarată, nu alfabetic", async () => {
    const rest = await ownerRest();

    // PREMISA, AFIRMATA: ordinea declarata difera si de ordinea alfabetica a
    // tokenurilor si de cea a etichetelor. Altfel afirmatia de mai jos nu ar putea
    // deosebi ordinea datelor de o sortare alfabetica.
    const declaredLabels = STAGES.map((s) => STAGE_LABEL[s]);
    const tokensAlphabetical = [...STAGES].sort();
    const labelsAlphabetical = [...declaredLabels].sort((a, b) => a.localeCompare(b, "ro"));
    expect(tokensAlphabetical).not.toEqual([...STAGES]);
    expect(labelsAlphabetical).not.toEqual(declaredLabels);

    // Cinci clienti de test, creati dezactivati, intr-o ordine care nu este nici
    // cea declarata nici cea alfabetica. Etapa fiecaruia se pune prin aceeasi
    // functie pe care o foloseste formularul.
    const tag = `TEST Ordine ${RUN}`;
    const insertOrder: Stage[] = ["quoted", "client", "follow_up", "cold", "nurture"];
    const created = await rest.api.post("/rest/v1/clients", {
      headers: { ...rest.headers, Prefer: "return=representation" },
      data: insertOrder.map((stage) => ({ name: `${tag} ${stage}`, active: false })),
    });
    expect(created.status(), await created.text()).toBe(201);
    const rows = (await created.json()) as { id: string; name: string }[];
    expect(rows).toHaveLength(5);

    for (const row of rows) {
      const stage = row.name.slice(tag.length + 1) as Stage;
      if (stage === "cold") continue;
      const moved = await rest.api.post("/rest/v1/rpc/set_client_stage", {
        headers: rest.headers,
        data: {
          p_client_id: row.id,
          p_stage: stage,
          p_follow_up_date: stage === "follow_up" ? "2026-11-02" : null,
        },
      });
      expect(moved.status(), await moved.text()).toBe(200);
    }

    const ordered = await rest.api.get(
      `/rest/v1/clients?select=stage&name=like.${encodeURIComponent(`${tag} *`)}&order=stage.asc,id.asc`,
      { headers: rest.headers },
    );
    expect(ordered.status(), await ordered.text()).toBe(200);
    const stages = ((await ordered.json()) as { stage: string }[]).map((r) => r.stage);

    expect(stages).toEqual([...STAGES]);
    expect(stages).not.toEqual(tokensAlphabetical);
    expect(stages.map((s) => STAGE_LABEL[s as Stage])).not.toEqual(labelsAlphabetical);

    await rest.api.dispose();
  });

  test("P3-43 (3): De reluat fără dată este refuzat în română și de baza de date, iar cu dată se salvează", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const rest = await ownerRest();

    await createClient(page, { name: clientName("De reluat"), phone: "069 000 111" });
    const id = await createdClientId(page);
    const before = await storedClient(rest, id);
    expect(before).toEqual({ stage: "cold", follow_up_date: null, phone: "069 000 111" });

    // HANDOVER 4.8 LINE 4, DIN FORMULAR. Se schimba si telefonul, ca "randul
    // stocat este neschimbat" sa insemne tot randul si nu doar etapa.
    await page.getByTestId("client-edit").click();
    await expect(page.getByTestId("client-form")).toBeVisible();
    await page.getByTestId("field-client-stage").selectOption("follow_up");
    const date = page.getByTestId("field-client-follow-up");
    await expect(date).toBeVisible();
    await expect(date).toHaveValue("");
    await page.getByTestId("field-client-phone").fill("069 999 999");
    await page.getByTestId("client-submit").click();

    const error = page.getByTestId("form-error");
    await expect(error).toHaveText(FOLLOW_UP_REQUIRED, { timeout: 20_000 });
    await expect(error).not.toContainText("23514");
    await expect(error).not.toContainText("violates");
    expect(await storedClient(rest, id)).toEqual(before);

    // ACEEASI SCRIERE, FARA FORMULAR. Baza o refuza singura, cu constrangerea de
    // verificare, deci o cale care ocoleste ecranul nu poate stoca starea aceasta.
    const refused = await rest.api.patch(`/rest/v1/clients?id=eq.${id}`, {
      headers: rest.headers,
      data: { stage: "follow_up", follow_up_date: null },
    });
    expect(refused.status()).toBe(400);
    expect(((await refused.json()) as { code: string }).code).toBe("23514");
    expect(await storedClient(rest, id)).toEqual(before);

    // CU DATA, SALVAREA REUSESTE si data se citeste inapoi neschimbata.
    await date.fill("2026-10-15");
    await page.getByTestId("client-submit").click();
    await expect(page.getByTestId("client-form")).toHaveCount(0, { timeout: 20_000 });
    await expect
      .poll(async () => storedClient(rest, id))
      .toEqual({ stage: "follow_up", follow_up_date: "2026-10-15", phone: "069 999 999" });
    await expectStageOnScreen(page, "follow_up");
    await expect(page.getByTestId("client-follow-up")).toContainText("15.10.2026");

    await rest.api.dispose();
  });

  test("P3-43 (4): o schimbare de etapă scrie exact un rând de istoric, iar aceeași etapă nu scrie niciunul", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const rest = await ownerRest();

    await createClient(page, { name: clientName("Istoric") });
    const id = await createdClientId(page);
    expect(await storedHistory(rest, id)).toHaveLength(0);

    // HANDOVER 4.8 LINE 9.
    await saveStage(page, "nurture");
    await expect.poll(async () => (await storedClient(rest, id)).stage).toBe("nurture");

    const history = await storedHistory(rest, id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      entity_id: id,
      from_status: "cold",
      to_status: "nurture",
      changed_by: rest.userId,
    });
    expect(Number.isNaN(Date.parse(history[0]!.created_at))).toBe(false);

    // ACEEASI ETAPA, ALT CAMP SCHIMBAT: nicio linie noua. Un dublu clic nu este
    // un eveniment.
    await saveStage(page, "nurture", { phone: "069 222 333" });
    await expect.poll(async () => (await storedClient(rest, id)).phone).toBe("069 222 333");
    expect(await storedHistory(rest, id)).toHaveLength(1);

    await rest.api.dispose();
  });
});
