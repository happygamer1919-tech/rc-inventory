import { expect, request, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// inactivi.spec - linia de acceptanta a cardului P3-112, goal G68.
//
// CE AFIRMA. Leadurile si clientii dezactivati au un loc al lor, vederea Inactivi de
// pe /clienti, cu numarul pe pastila, cu cautarea si cu Reactivează pe fiecare rand,
// in loc sa fie accesibili numai schimband filtrul Stare. Cele cinci cazuri:
//   (1) un lead dezactivat lipseste din Leaduri pe Activi, se gaseste in Inactivi, se
//       reactiveaza DE PE RANDUL LUI si se intoarce in lista normala;
//   (2) un client dezactivat este in aceeasi lista, si randul spune care este;
//   (3) numarul de pe pastila este numarul randurilor, propozitia numarata ia forma
//       romaneasca cu "de" peste nouasprezece, si cautarea taie dupa denumire si dupa
//       telefon;
//   (4) starea goala a vederii este in romana si nu trimite nicaieri;
//   (5) la 390x844 fiecare rand este un card, butonul are 44px si casetele 16px.
//
// STAREA SE CITESTE DIN RANDUL STOCAT, NU DE PE ECRAN, prin PostgREST, cu jetonul
// administratorului, exact ca in reactivate-lead.spec si leaduri.spec. Ecranul poate
// arata o stare pe care baza nu a primit-o niciodata; randul nu.
//
// DATELE DE TEST NU SE STERG NICIODATA. Fiecare rand poarta prefixul TEST si un sufix
// unic pe rulare, iar fiecare caz isi cauta randurile prin casuta de cautare, dupa un
// sufix numai al lui. Acolo unde numarul trebuie sa treaca de nouasprezece ca sa se
// vada forma cu "de", el se obtine ADAUGAND randuri, niciodata stergand: aceeasi
// conventie ca in romanian-counts.spec.
//
// REGULA DE PLURAL ESTE SCRISA AICI DIN NOU si nu importata din aplicatie, ca testul
// sa nu verifice aplicatia cu propria ei functie. Aceeasi conventie ca in
// romanian-counts.spec si copy-fixes.spec.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const MIN_TAP = 44;
const MIN_INPUT_FONT = 16;

const NF = new Intl.NumberFormat("ro-MD", { maximumFractionDigits: 0 });

/** Regula romaneasca cu trei forme: 1 cere singularul, un numar al carui rest la 100
 *  este intre 1 si 19 (si zero) cere pluralul simplu, restul cer "de" plus plural. */
function counted(n: number, one: string, many: string): string {
  const shown = NF.format(n);
  if (n === 1) return `${shown} ${one}`;
  const lastTwo = n % 100;
  if (n === 0 || (lastTwo >= 1 && lastTwo <= 19)) return `${shown} ${many}`;
  return `${shown} de ${many}`;
}

/** Sufix unic pe caz si pe rulare, ca doua cazuri sa nu se gaseasca unul pe altul. */
function tag(caseName: string): string {
  return `Inactivi ${caseName} ${RUN}`;
}

// ---------------------------------------------------------------------------
// Legatura directa la baza, ca administratorul
// ---------------------------------------------------------------------------

type OwnerRest = { api: APIRequestContext; headers: Record<string, string> };

async function ownerRest(): Promise<OwnerRest> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  expect(url, "P3-112 are nevoie de NEXT_PUBLIC_SUPABASE_URL").not.toBe("");
  expect(anonKey, "P3-112 are nevoie de NEXT_PUBLIC_SUPABASE_ANON_KEY").not.toBe("");

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

/** Starea stocata a randului, citita din baza si nu de pe ecran. */
async function storedActive(rest: OwnerRest, id: string): Promise<boolean> {
  const response = await rest.api.get(`/rest/v1/clients?id=eq.${id}&select=active`, {
    headers: rest.headers,
  });
  expect(response.status(), await response.text()).toBe(200);
  const rows = (await response.json()) as { active: boolean }[];
  expect(rows).toHaveLength(1);
  return rows[0]!.active;
}

/** Ce a stocat baza pentru randul acesta, pe campurile pe care lista nu le arata:
 *  asa se dovedeste ca reactivarea de pe un rand nu le goleste. */
async function storedFields(
  rest: OwnerRest,
  id: string,
): Promise<{ fiscal_code: string | null; address: string | null; email: string | null; notes: string | null }> {
  const response = await rest.api.get(
    `/rest/v1/clients?id=eq.${id}&select=fiscal_code,address,email,notes`,
    { headers: rest.headers },
  );
  expect(response.status(), await response.text()).toBe(200);
  const rows = (await response.json()) as {
    fiscal_code: string | null;
    address: string | null;
    email: string | null;
    notes: string | null;
  }[];
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

type NewRecord = {
  name: string;
  /** `client` trece prin public.set_client_stage, ca in aplicatie. */
  stage: "cold" | "nurture" | "client";
  active: boolean;
  phone?: string;
  fiscalCode?: string;
  address?: string;
  email?: string;
  notes?: string;
};

/** Randuri noi, cu etapa ceruta prin public.set_client_stage, ca in aplicatie. */
async function createRecords(rest: OwnerRest, rows: NewRecord[]): Promise<string[]> {
  const created = await rest.api.post("/rest/v1/clients", {
    headers: { ...rest.headers, Prefer: "return=representation" },
    data: rows.map((r) => ({
      name: r.name,
      active: r.active,
      phone: r.phone ?? null,
      fiscal_code: r.fiscalCode ?? null,
      address: r.address ?? null,
      email: r.email ?? null,
      notes: r.notes ?? null,
    })),
  });
  expect(created.status(), await created.text()).toBe(201);
  const made = (await created.json()) as { id: string; name: string }[];
  expect(made).toHaveLength(rows.length);

  // Ordinea raspunsului urmeaza ordinea cererii, dar id-ul se ia dupa denumire, ca
  // testul sa nu depinda de asta.
  const idByName = new Map(made.map((m) => [m.name, m.id]));
  const ids: string[] = [];
  for (const r of rows) {
    const id = idByName.get(r.name);
    expect(id, `randul ${r.name} nu s-a creat`).toBeTruthy();
    ids.push(id!);
    if (r.stage !== "cold") {
      const moved = await rest.api.post("/rest/v1/rpc/set_client_stage", {
        headers: rest.headers,
        data: { p_client_id: id, p_stage: r.stage, p_follow_up_date: null },
      });
      expect(moved.status(), await moved.text()).toBe(200);
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Ecranul
// ---------------------------------------------------------------------------

function listUrl(params: Record<string, string>): string {
  return `/clienti?${new URLSearchParams(params).toString()}`;
}

function rowFor(page: Page, name: string): Locator {
  return page.locator(`[data-testid="client-row"][data-name="${name}"]`);
}

/** Explicatia de sub titlul cardului: acolo sta propozitia numarata. */
function listHint(page: Page): Locator {
  return page.locator("h2", { hasText: "Listă" }).locator("xpath=following-sibling::p");
}

// ---------------------------------------------------------------------------
// Masuratoarea de telefon, aceeasi metoda ca phone-lists.spec si phone-remainder.spec
// ---------------------------------------------------------------------------

type Reading = {
  document: { scrollWidth: number; clientWidth: number };
  main: { scrollWidth: number; clientWidth: number };
  smallTargets: string[];
  smallFonts: string[];
  outside: string[];
  visibleTheads: number;
};

async function readPhone(page: Page): Promise<Reading> {
  return page.evaluate(
    ({ minTap, minFont, width }) => {
      const main = document.querySelector("main");
      if (!main) throw new Error("pagina nu are <main>");
      const visible = (el: Element) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== "hidden";
      };
      const name = (el: Element) =>
        `${el.tagName.toLowerCase()}[${el.getAttribute("data-testid") ?? ""}] "${(
          el.getAttribute("aria-label") ??
          el.textContent ??
          el.getAttribute("placeholder") ??
          ""
        )
          .trim()
          .slice(0, 40)}"`;

      const smallTargets: string[] = [];
      for (const el of Array.from(main.querySelectorAll("input, select, button, a[href]"))) {
        if (!visible(el)) continue;
        const height = el.getBoundingClientRect().height;
        if (height < minTap) smallTargets.push(`${name(el)} ${height.toFixed(1)}px`);
      }

      const smallFonts: string[] = [];
      for (const el of Array.from(main.querySelectorAll("input, select, textarea"))) {
        if (!visible(el)) continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size < minFont) smallFonts.push(`${name(el)} ${size}px`);
      }

      const outside: string[] = [];
      for (const el of Array.from(main.querySelectorAll<HTMLElement>("*"))) {
        if (!visible(el)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.left < -0.5 || rect.right > width + 0.5) {
          outside.push(`${name(el)} ${rect.left.toFixed(0)}..${rect.right.toFixed(0)}`);
        }
      }

      return {
        document: {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        },
        main: { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth },
        smallTargets,
        smallFonts,
        outside,
        visibleTheads: Array.from(main.querySelectorAll("thead")).filter(visible).length,
      };
    },
    { minTap: MIN_TAP, minFont: MIN_INPUT_FONT, width: PHONE.width },
  );
}

async function expectFitsPhone(page: Page, where: string): Promise<void> {
  const r = await readPhone(page);
  expect(r.document.scrollWidth, `derulare laterala a documentului pe ${where}`).toBeLessThanOrEqual(
    r.document.clientWidth,
  );
  expect(r.main.scrollWidth, `derulare laterala in <main> pe ${where}`).toBeLessThanOrEqual(r.main.clientWidth);
  expect(r.smallTargets, `tinte sub ${MIN_TAP}px pe ${where}`).toEqual([]);
  expect(r.smallFonts, `casete sub ${MIN_INPUT_FONT}px pe ${where}`).toEqual([]);
  expect(r.outside, `elemente in afara ecranului pe ${where}`).toEqual([]);
  expect(r.visibleTheads, `antet de tabel vizibil pe ${where}`).toBe(0);
}

/** Un card pe rand: randul este o grila, iar fiecare celula CU ANTET poarta ca
 *  eticheta vizibila exact textul antetului coloanei ei. Coloana de actiuni nu are
 *  antet si nu are eticheta: aceeasi forma pe care o verifica phone-remainder.spec. */
async function expectRowCards(rows: Locator, where: string): Promise<void> {
  const count = Math.min(await rows.count(), 5);
  expect(count, `niciun rand de verificat pe ${where}`).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const reading = await rows.nth(i).evaluate((tr) => {
      const heads = Array.from(tr.closest("table")?.querySelectorAll("thead th") ?? []).map((th) =>
        (th.textContent ?? "").trim(),
      );
      const labels = Array.from(tr.querySelectorAll(":scope > td")).map((td) => {
        const before = getComputedStyle(td, "::before");
        return {
          text:
            before.content === "none" || before.content === "normal"
              ? ""
              : before.content.replace(/^"|"$/g, ""),
          shown: before.display !== "none" && before.content !== "none",
        };
      });
      return { display: getComputedStyle(tr).display, heads, labels };
    });
    expect(reading.display, `randul ${i} nu este card pe ${where}`).toBe("grid");
    expect(reading.heads.length, `tabel fara antet pe ${where}`).toBeGreaterThan(0);
    expect(reading.labels.map((l) => l.text), `etichetele randului ${i} pe ${where}`).toEqual(
      reading.heads,
    );
    reading.heads.forEach((head, c) => {
      if (head !== "") expect(reading.labels[c]!.shown, `eticheta ${head} ascunsa pe ${where}`).toBe(true);
    });
  }
}

/** Autentificare la latimea desktop, ca restul suitei, apoi telefonul. */
async function signInOnPhone(page: Page): Promise<void> {
  await page.setViewportSize(DESKTOP);
  await signIn(page, ownerAccount());
  await page.setViewportSize(PHONE);
}

// ---------------------------------------------------------------------------
// Cazurile
// ---------------------------------------------------------------------------

test.describe("P3-112: Inactivi, locul leadurilor si clientilor dezactivati", () => {
  test.describe.configure({ timeout: 180_000 });

  test("1. un lead dezactivat se găsește în Inactivi, se reactivează de pe rândul lui și se întoarce în lista normală", async ({
    page,
  }) => {
    const rest = await ownerRest();
    await signIn(page, ownerAccount());

    const suffix = tag("Lead");
    const name = `TEST ${suffix}`;
    // Campurile pe care lista NU le arata sunt completate anume: daca butonul de pe
    // rand ar trece prin calea care scrie tot setul de campuri, ele ar ajunge null.
    const [id] = await createRecords(rest, [
      {
        name,
        stage: "cold",
        active: false,
        phone: "+373 600 11 001",
        fiscalCode: `1000${RUN.slice(-6)}01`,
        address: "TEST strada Dezactivare 1",
        email: "test-inactivi-lead@example.test",
        notes: "TEST nota care nu are voie sa dispara",
      },
    ]);
    const before = await storedFields(rest, id!);

    // (1a) IN LEADURI, PE FILTRUL IMPLICIT ACTIVI, NU APARE. Asa era si inainte de
    // card, si asa rămâne: cardul adauga un loc unde sa te uiti, nu schimba lista.
    await page.goto(listUrl({ vedere: "leaduri", q: suffix }));
    await expect(page.getByTestId("clients-status")).toHaveValue("active", { timeout: 20_000 });
    await expect(rowFor(page, name)).toHaveCount(0, { timeout: 15_000 });

    // (1b) PASTILA INACTIVI EXISTA SI DUCE LA EL, fara sa atinga niciun selector.
    const pill = page.getByTestId("view-inactivi");
    await expect(pill).toContainText("Inactivi");
    await pill.click();
    await expect(page).toHaveURL(/vedere=inactivi/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Inactivi", level: 1 })).toBeVisible();
    // Vederea este ea insasi filtrul de stare, deci selectorul nu se mai arata.
    await expect(page.getByTestId("clients-status")).toHaveCount(0);
    await expect(rowFor(page, name)).toHaveCount(1, { timeout: 15_000 });

    // (1c) REACTIVEAZA DE PE RAND, si baza o confirma.
    const row = rowFor(page, name);
    const button = row.getByTestId("inactivi-reactivate");
    await expect(button).toHaveText("Reactivează");
    await button.click();
    await expect(page.getByTestId("inactivi-notice")).toContainText("Reactivat", { timeout: 25_000 });
    await expect(page.getByTestId("inactivi-notice")).toContainText(name);
    await expect.poll(() => storedActive(rest, id!), { timeout: 20_000 }).toBe(true);

    // SI NIMIC ALTCEVA NU S-A SCRIS. IDNO-ul, adresa, emailul si notele sunt exact
    // cele de dinainte: butonul scrie o singura coloana.
    expect(await storedFields(rest, id!)).toEqual(before);

    // (1d) A PLECAT DIN INACTIVI si este inapoi in lista normala, pe Activi.
    await expect(rowFor(page, name)).toHaveCount(0, { timeout: 20_000 });
    await page.goto(listUrl({ vedere: "leaduri", q: suffix }));
    await expect(rowFor(page, name)).toHaveCount(1, { timeout: 15_000 });
    await expect(rowFor(page, name)).toContainText("Activ");
  });

  test("2. un client dezactivat apare în aceeași listă, și rândul spune care este", async ({
    page,
  }) => {
    const rest = await ownerRest();
    await signIn(page, ownerAccount());

    const suffix = tag("Fel");
    const leadName = `TEST ${suffix} lead`;
    const clientName = `TEST ${suffix} client`;
    await createRecords(rest, [
      { name: leadName, stage: "nurture", active: false, phone: "+373 600 22 001" },
      { name: clientName, stage: "client", active: false, phone: "+373 600 22 002" },
    ]);

    await page.goto(listUrl({ vedere: "inactivi", q: suffix }));
    await expect(page.getByTestId("client-row")).toHaveCount(2, { timeout: 20_000 });

    // O SINGURA LISTA PENTRU AMANDOUA, si coloana Fel spune despre fiecare rand care
    // este: fara ea, un om care se uita la lista nu poate deosebi un lead pierdut de
    // un client dezactivat.
    const lead = rowFor(page, leadName);
    const client = rowFor(page, clientName);
    await expect(lead.getByTestId("row-kind")).toHaveText("Lead");
    await expect(client.getByTestId("row-kind")).toHaveText("Client");

    // ETAPA VINE DIN ETICHETELE ROMANESTI DE PANA ACUM, cu culoarea LANGA eticheta.
    await expect(lead.getByTestId("row-stage-label")).toHaveText("În cultivare");
    await expect(client.getByTestId("row-stage-label")).toHaveText("Client");
    await expect(lead.getByTestId("row-stage-colour")).toHaveCount(1);

    // TELEFONUL ESTE LEGATURA tel:, ca pe ecranul Azi.
    await expect(lead.getByTestId("inactivi-call")).toHaveAttribute("href", "tel:+37360022001");
    await expect(client.getByTestId("inactivi-call")).toHaveAttribute("href", "tel:+37360022002");

    // NUMELE DUCE LA FISA, exact ca in listele normale.
    await expect(lead.getByTestId("client-link")).toHaveAttribute("href", /^\/clienti\/[0-9a-f-]+$/);
  });

  test("3. numărul de pe pastilă este numărul rândurilor, cu forma cu de peste nouăsprezece, și căutarea taie după denumire și după telefon", async ({
    page,
  }) => {
    const rest = await ownerRest();
    await signIn(page, ownerAccount());

    const suffix = tag("Numar");
    const phoneOf = (i: number) => `+373 700 ${String(300 + i).padStart(3, "0")} 99`;
    const names = Array.from({ length: 20 }, (_, i) => `TEST ${suffix} ${String(i + 1).padStart(2, "0")}`);

    // TREI RANDURI INTAI, ca numarul sa fie verificat si sub nouasprezece, apoi
    // DOUASPREZECE PLUS CINCI pana la douazeci. Se adauga, nu se sterge nimic.
    await createRecords(
      rest,
      names.slice(0, 3).map((name, i) => ({ name, stage: "cold" as const, active: false, phone: phoneOf(i) })),
    );

    await page.goto(listUrl({ vedere: "inactivi", q: suffix }));
    await expect(page.getByTestId("client-row")).toHaveCount(3, { timeout: 20_000 });
    await expect(page.getByTestId("inactivi-count")).toHaveText("3");
    await expect(listHint(page)).toHaveText(counted(3, "înregistrare dezactivată", "înregistrări dezactivate"));

    await createRecords(
      rest,
      names.slice(3).map((name, i) => ({
        name,
        stage: "cold" as const,
        active: false,
        phone: phoneOf(i + 3),
      })),
    );

    // DOUAZECI: PASTILA, RANDURILE SI PROPOZITIA SPUN ACELASI NUMAR, iar propozitia
    // ia forma cu "de", care este exact ce cardul P3-98 a reparat in alte sase locuri.
    await page.goto(listUrl({ vedere: "inactivi", q: suffix }));
    await expect(page.getByTestId("client-row")).toHaveCount(20, { timeout: 20_000 });
    await expect(page.getByTestId("inactivi-count")).toHaveText("20");
    const hint = counted(20, "înregistrare dezactivată", "înregistrări dezactivate");
    expect(hint).toBe("20 de înregistrări dezactivate");
    await expect(listHint(page)).toHaveText(hint);

    // CAUTAREA TAIE DUPA DENUMIRE, o singura casuta, ca in lista de clienti.
    const search = page.getByTestId("clients-search");
    await search.fill(`${suffix} 07`);
    await expect(page.getByTestId("client-row")).toHaveCount(1, { timeout: 20_000 });
    await expect(rowFor(page, names[6]!)).toHaveCount(1);
    await expect(page.getByTestId("inactivi-count")).toHaveText("1");
    await expect(listHint(page)).toHaveText(counted(1, "înregistrare dezactivată", "înregistrări dezactivate"));

    // SI DUPA TELEFON, cu aceeasi casuta. Bucata se ia din numarul stocat exact cum
    // este scris: public.fold_text din 0017 scoate diacriticele si majusculele si
    // STRANGE spatiile, dar nu le scoate, deci un numar cautat fara spatii nu ar
    // potrivi un numar stocat cu ele. Aceeasi regula pe care o respecta si operatorul:
    // scrie ce vede pe ecran.
    const phonePart = phoneOf(11).slice("+373 ".length);
    expect(phonePart).toBe("700 311 99");
    await search.fill(phonePart);
    await expect(page.getByTestId("client-row")).toHaveCount(1, { timeout: 20_000 });
    await expect(rowFor(page, names[11]!)).toHaveCount(1);
  });

  test("4. când nimeni nu este dezactivat, starea goală o spune în română", async ({ page }) => {
    await signIn(page, ownerAccount());

    // O cautare care nu poate potrivi nimic: starea goala a vederii, fara niciun rand
    // sters ca sa se ajunga la ea.
    await page.goto(listUrl({ vedere: "inactivi", q: `TEST ${tag("Gol")} nimic` }));
    await expect(page.getByText("Nicio înregistrare pentru filtrele alese")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Schimbă căutarea sau șterge filtrele.")).toBeVisible();

    // PE INACTIVI NU EXISTA NICI UN BUTON SPRE UN ALT FILTRU: acolo nu lipseste nimeni
    // ascuns, deci nu are unde sa trimita.
    await expect(page.getByTestId("clients-show-inactive")).toHaveCount(0);

    // Si Șterge filtrele RAMANE IN VEDERE: sterge cautarea, nu vederea.
    await page.getByTestId("clients-clear").click();
    await expect(page).toHaveURL(/vedere=inactivi/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Inactivi", level: 1 })).toBeVisible();
  });

  test("5. la 390x844 fiecare rând este un card, butonul are 44px și caseta de căutare 16px", async ({
    page,
  }, testInfo) => {
    const rest = await ownerRest();
    await signInOnPhone(page);

    const suffix = tag("Telefon");
    const names = [`TEST ${suffix} lead`, `TEST ${suffix} client`];
    await createRecords(rest, [
      { name: names[0]!, stage: "cold", active: false, phone: "+373 600 44 001" },
      { name: names[1]!, stage: "client", active: false, phone: "+373 600 44 002" },
    ]);

    await page.goto(listUrl({ vedere: "inactivi", q: suffix }));
    const rows = page.getByTestId("client-row");
    await expect(rows).toHaveCount(2, { timeout: 25_000 });

    await expectFitsPhone(page, "/clienti vedere=inactivi la 390px");
    await expectRowCards(rows, "/clienti vedere=inactivi la 390px");

    // Butonul de pe rand, explicit: 44px este tinta de atingere, iar readPhone o
    // verifica pe fiecare control. Aici se numeste, ca defectul sa fie citibil.
    const button = rowFor(page, names[0]!).getByTestId("inactivi-reactivate");
    const box = await button.boundingBox();
    expect(box, "butonul Reactivează nu are cutie pe telefon").not.toBeNull();
    expect(box!.height, "butonul Reactivează sub 44px pe telefon").toBeGreaterThanOrEqual(MIN_TAP);

    await page.screenshot({ path: testInfo.outputPath("inactivi-telefon.png") });

    // Si pe desktop lista rămâne un tabel, nu carduri: nimic peste 768px nu se schimba.
    await page.setViewportSize(DESKTOP);
    await expect
      .poll(async () => rows.first().evaluate((tr) => getComputedStyle(tr).display), { timeout: 15_000 })
      .toBe("table-row");
  });
});
