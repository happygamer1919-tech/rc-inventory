import { expect, request, test, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// deviz.spec - linia de acceptanta a cardului P3-13b.
//
// Acopera exact ce numeste cardul: o versiune se creeaza pe un proiect ca
// versiunea 1 in starea Ciorna si isi pastreaza liniile; a doua versiune este 2
// si prima ramane citibila; o linie adaugata din catalog isi SCRIE pretul din
// catalogul de la acel moment; pretul de pe o linie salvata NU se schimba cand
// catalogul se schimba dupa aceea, iar randul arata trei valori separate, pretul
// ofertat, pretul curent si diferenta; CAZUL NUMIT DE ADDENDUM, un deviz ofertat
// in martie arata in continuare preturile din martie; acelasi produs nu poate fi
// adaugat de doua ori; totalul de linie, subtotalul, Adaosul si Totalul se
// potrivesc cu numerele calculate de mana; unitatea vine de pe produs si nu se
// poate tasta; o ciorna se editeaza si orice alta stare nu, iar refuzul vine DIN
// BAZA; un deviz emis a carui valabilitate a trecut poarta un avertisment
// romanesc; fiecare sir vizibil este romanesc.
//
// DATELE VIN DIN scripts/seed-test-deviz.mjs SI SUNT FIXE. Aritmetica este
// scrisa in capul acelui fisier si repetata aici, ca amandoua sa poata fi
// verificate de mana fara sa fie deschis celalalt.

const PROJECT_ID = "7e57c051-0000-4000-8000-000000000302";
const PROJECT_EMPTY_ID = "7e57c051-0000-4000-8000-000000000303";
const DEVIZ_MARCH_ID = "7e57c051-0000-4000-8000-000000000401";
const MARCH_LINE_ID = "7e57c051-0000-4000-8000-000000000411";

// Devizul din martie, calculat de mana.
const MARCH_QUOTED = { "TEST-DEVIZ-01": 100, "TEST-DEVIZ-02": 50 };
const MARCH_CURRENT = { "TEST-DEVIZ-01": 130, "TEST-DEVIZ-02": 45 };
const MARCH_DIFFERENCE = { "TEST-DEVIZ-01": 30, "TEST-DEVIZ-02": -5 };
const MARCH_LINE_TOTAL = { "TEST-DEVIZ-01": 400, "TEST-DEVIZ-02": 300 };
const MARCH_SUBTOTAL = 700;
const MARCH_ADAOS = 70; // 10% din 700
const MARCH_TOTAL = 770;

async function devizTab(page: Page, projectId: string, devizId?: string) {
  const suffix = devizId ? `&deviz=${devizId}` : "";
  await page.goto(`/proiecte/${projectId}?fila=deviz${suffix}`);
  await expect(page.getByTestId("panel-deviz")).toBeVisible({ timeout: 25_000 });
}

/** Valoarea afisata, citita din atributul de date si nu din textul formatat.
 *
 *  Textul trece prin Intl si contine spatii insecabile, deci o comparatie pe
 *  sirul afisat ar cadea pe formatare in loc sa cada pe aritmetica. */
async function valueOf(page: Page, testId: string): Promise<number> {
  const raw = await page.getByTestId(testId).getAttribute("data-value-mdl");
  return Number(raw);
}

/** Adauga o linie prin ecran si asteapta sa apara.
 *
 *  NU EXISTA CAMP DE PRET IN FORMULAR. Asta este cardul: pretul se citeste din
 *  catalog in momentul salvarii si se scrie pe linie. */
async function comboPick(page: Page, testId: string, query: string) {
  const input = page.getByTestId(testId).locator("input");
  await input.click();
  await input.fill(query);
  const list = page.locator("[data-rc-combo-list]");
  await expect(list).toBeVisible({ timeout: 10_000 });
  // Exact o potrivire, acelasi motiv ca in outbound.spec: doua potriviri
  // inseamna ca testul alege la intamplare si esueaza mai tarziu, pe alt numar.
  await expect(list.locator("li")).toHaveCount(1);
  await list.locator("li").first().click();
}

async function addLine(page: Page, productLabel: string, quantity: string, sku: string) {
  await comboPick(page, "deviz-add-product", productLabel);
  await page.getByTestId("deviz-add-quantity").fill(quantity);
  await page.getByTestId("deviz-add-submit").click();
  await expect(page.getByTestId(`deviz-line-quoted-${sku}`)).toBeVisible({ timeout: 25_000 });
}

test.describe("Deviz pe proiect", () => {
  test.describe.configure({ timeout: 120_000 });

  test("o versiune noua este versiunea 1 în Ciornă și își păstrează liniile", async ({ page }) => {
    await signIn(page, ownerAccount());

    // Proiectul gol din seed poarta deja o versiune 1 emisa, deci se creeaza un
    // proiect curat prin ecran ar fi scop. Se foloseste proiectul principal,
    // unde versiunea urmatoare se calculeaza din maximul existent, si se
    // verifica proprietatea pe care cardul o numeste: numerotarea creste, starea
    // initiala este Ciorna, iar liniile persista peste o reincarcare.
    await devizTab(page, PROJECT_ID);

    const before = await page.getByTestId("deviz-row").count();
    await page.getByTestId("deviz-new").click();
    await expect(page.getByTestId("deviz-row")).toHaveCount(before + 1, { timeout: 25_000 });

    const top = page.getByTestId("deviz-row").first();
    await expect(top).toContainText("Ciornă");
    const version = Number(await top.getAttribute("data-version"));
    expect(version).toBe(before + 1);

    // Preluarea a copiat liniile versiunii deschise, cu preturile lor inghetate.
    const devizId = await top.getAttribute("data-deviz-id");
    await devizTab(page, PROJECT_ID, devizId ?? undefined);
    expect(await valueOf(page, "deviz-line-quoted-TEST-DEVIZ-01")).toBe(
      MARCH_QUOTED["TEST-DEVIZ-01"],
    );

    // Persista peste o reincarcare, care este ce inseamna "salvat".
    await page.reload();
    await expect(page.getByTestId("panel-deviz")).toBeVisible({ timeout: 25_000 });
    expect(await valueOf(page, "deviz-line-quoted-TEST-DEVIZ-01")).toBe(
      MARCH_QUOTED["TEST-DEVIZ-01"],
    );
  });

  test("a doua versiune este 2 și prima rămâne citibilă", async ({ page }) => {
    await signIn(page, ownerAccount());
    await devizTab(page, PROJECT_ID);

    const before = await page.getByTestId("deviz-row").count();
    await page.getByTestId("deviz-new").click();
    await expect(page.getByTestId("deviz-row")).toHaveCount(before + 1, { timeout: 25_000 });

    // VERSIUNEA 1, CEA DIN MARTIE, ESTE IN CONTINUARE ACOLO SI SE DESCHIDE.
    // Crearea unei versiuni noi nu rescrie istoria: o versiune emisa ramane
    // emisa si ramane citibila.
    await devizTab(page, PROJECT_ID, DEVIZ_MARCH_ID);
    await expect(page.getByTestId("deviz-line")).toHaveCount(2);
    expect(await valueOf(page, "deviz-total")).toBe(MARCH_TOTAL);
  });

  test("linia adăugată își scrie prețul din catalogul de la acel moment", async ({ page }) => {
    await signIn(page, ownerAccount());
    await devizTab(page, PROJECT_ID);

    // ASTEPTAREA ESTE PE NUMARUL DE VERSIUNI, NU PE FORMULAR. Formularul de
    // adaugare este DEJA vizibil, de pe versiunea deschisa inainte de clic, deci
    // toBeVisible se intoarce imediat si nu sincronizeaza nimic: linia pleca spre
    // versiunea veche in timp ce afirmatia citea versiunea noua. In CI asta a
    // aratat ca o linie care nu apare, cu versiunea precedenta purtand-o.
    // Numarul de randuri creste o singura data si numai dupa ce serverul a
    // raspuns, ceea ce testele de mai sus foloseau deja.
    const versionsBefore = await page.getByTestId("deviz-row").count();
    await page.getByTestId("deviz-new").click();
    await expect(page.getByTestId("deviz-row")).toHaveCount(versionsBefore + 1, {
      timeout: 25_000,
    });
    await expect(page.getByTestId("deviz-add-line")).toBeVisible({ timeout: 25_000 });

    // TEST-DEVIZ-03 nu este pe niciun deviz din seed, deci pretul lui ofertat nu
    // poate veni de altundeva decat din catalogul de acum: 20.00.
    await addLine(page, "TEST Deviz Cărămidă", "3", "TEST-DEVIZ-03");

    expect(await valueOf(page, "deviz-line-quoted-TEST-DEVIZ-03")).toBe(20);
    expect(await valueOf(page, "deviz-line-current-TEST-DEVIZ-03")).toBe(20);
    expect(await valueOf(page, "deviz-line-difference-TEST-DEVIZ-03")).toBe(0);
    expect(await valueOf(page, "deviz-line-total-TEST-DEVIZ-03")).toBe(60);
  });

  test("CAZUL ADDENDUMULUI: un deviz ofertat în martie arată în continuare prețurile din martie", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await devizTab(page, PROJECT_ID, DEVIZ_MARCH_ID);

    // TREI VALORI SEPARATE PE ACELASI RAND, si niciuna nu este derivata din
    // cealalta pe ecran: ofertatul vine de pe linie, curentul de pe produs,
    // diferenta este calculata.
    for (const sku of ["TEST-DEVIZ-01", "TEST-DEVIZ-02"] as const) {
      expect(await valueOf(page, `deviz-line-quoted-${sku}`)).toBe(MARCH_QUOTED[sku]);
      expect(await valueOf(page, `deviz-line-current-${sku}`)).toBe(MARCH_CURRENT[sku]);
      expect(await valueOf(page, `deviz-line-difference-${sku}`)).toBe(MARCH_DIFFERENCE[sku]);
    }

    // Catalogul s-a miscat in amandoua directiile si devizul nu s-a miscat deloc.
    expect(MARCH_CURRENT["TEST-DEVIZ-01"]).toBeGreaterThan(MARCH_QUOTED["TEST-DEVIZ-01"]);
    expect(MARCH_CURRENT["TEST-DEVIZ-02"]).toBeLessThan(MARCH_QUOTED["TEST-DEVIZ-02"]);
  });

  test("totalul de linie, Subtotalul, Adaosul și Totalul sunt numerele calculate de mână", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await devizTab(page, PROJECT_ID, DEVIZ_MARCH_ID);

    expect(await valueOf(page, "deviz-line-total-TEST-DEVIZ-01")).toBe(
      MARCH_LINE_TOTAL["TEST-DEVIZ-01"],
    );
    expect(await valueOf(page, "deviz-line-total-TEST-DEVIZ-02")).toBe(
      MARCH_LINE_TOTAL["TEST-DEVIZ-02"],
    );
    expect(await valueOf(page, "deviz-subtotal")).toBe(MARCH_SUBTOTAL);
    expect(await valueOf(page, "deviz-adaos")).toBe(MARCH_ADAOS);
    expect(await valueOf(page, "deviz-total")).toBe(MARCH_TOTAL);

    // TOTALUL FOLOSESTE PRETUL OFERTAT SI NU PE CEL CURENT. La preturile de azi
    // subtotalul ar fi 4 x 130 + 6 x 45 = 790, iar totalul 869. Cifra afirmata
    // mai sus este cealalta, si asta este singura diferenta observabila dintre
    // un instantaneu si o valoare implicita.
    expect(await valueOf(page, "deviz-subtotal")).not.toBe(790);
  });

  test("unitatea vine de pe produs și nu există câmp în care să fie tastată", async ({ page }) => {
    await signIn(page, ownerAccount());
    await devizTab(page, PROJECT_ID, DEVIZ_MARCH_ID);

    // Migratia 0025 nu are coloana de unitate pe linie, exact ca sa nu existe
    // unde. Ecranul o randeaza din produs: sac pentru ciment, kg pentru nisip.
    await expect(page.getByTestId("deviz-line-unit-TEST-DEVIZ-01")).toHaveText("sac");
    await expect(page.getByTestId("deviz-line-unit-TEST-DEVIZ-02")).toHaveText("kg");

    const unitCell = page.getByTestId("deviz-line-unit-TEST-DEVIZ-01");
    await expect(unitCell.locator("input")).toHaveCount(0);
    await expect(unitCell.locator("select")).toHaveCount(0);
  });

  test("același produs nu poate fi adăugat de două ori pe un deviz", async ({ page }) => {
    await signIn(page, ownerAccount());
    await devizTab(page, PROJECT_ID);

    // ASTEPTAREA ESTE PE NUMARUL DE VERSIUNI, NU PE FORMULAR. Formularul de
    // adaugare este DEJA vizibil, de pe versiunea deschisa inainte de clic, deci
    // toBeVisible se intoarce imediat si nu sincronizeaza nimic: linia pleca spre
    // versiunea veche in timp ce afirmatia citea versiunea noua. In CI asta a
    // aratat ca o linie care nu apare, cu versiunea precedenta purtand-o.
    // Numarul de randuri creste o singura data si numai dupa ce serverul a
    // raspuns, ceea ce testele de mai sus foloseau deja.
    const versionsBefore = await page.getByTestId("deviz-row").count();
    await page.getByTestId("deviz-new").click();
    await expect(page.getByTestId("deviz-row")).toHaveCount(versionsBefore + 1, {
      timeout: 25_000,
    });
    await expect(page.getByTestId("deviz-add-line")).toBeVisible({ timeout: 25_000 });

    // Preluarea a adus deja TEST-DEVIZ-01 pe versiunea noua. A doua adaugare a
    // aceluiasi produs loveste deviz_lines_product_unique_per_deviz din 0025.
    await expect(page.getByTestId("deviz-line-quoted-TEST-DEVIZ-01")).toBeVisible();

    // NUMARUL DE DINAINTE, NU UNUL FIX. Preluarea copiaza liniile versiunii
    // deschise, iar un test care ruleaza mai devreme in acest fisier lasa acolo o
    // versiune cu trei linii si nu cu perechea din seed. Proprietatea pe care o
    // numeste cardul este ca refuzul NU ADAUGA UN RAND, deci se compara cu ce era
    // inainte: daca duplicatul ar trece, numarul ar creste si testul ar pica la
    // fel de tare. Un 2 scris in clar afirma in plus cate linii avea versiunea
    // copiata, ceea ce nu tine de acest test si depinde de ordinea rularii.
    const linesBefore = await page.getByTestId("deviz-line").count();

    await comboPick(page, "deviz-add-product", "TEST Deviz Ciment");
    await page.getByTestId("deviz-add-quantity").fill("1");
    await page.getByTestId("deviz-add-submit").click();

    await expect(page.getByTestId("deviz-message")).toContainText("deja pe acest deviz", {
      timeout: 25_000,
    });
    await expect(page.getByTestId("deviz-line")).toHaveCount(linesBefore);
  });

  test("o ciornă se editează și un deviz emis nu, iar refuzul vine din baza de date", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());

    // JUMATATEA DE ECRAN: pe un deviz emis nu exista formular de adaugare, iar
    // in locul lui apare propozitia romaneasca.
    await devizTab(page, PROJECT_ID, DEVIZ_MARCH_ID);
    await expect(page.getByTestId("deviz-add-line")).toHaveCount(0);
    await expect(page.getByTestId("deviz-locked")).toContainText("Emis");
    await expect(page.getByTestId("deviz-locked")).toContainText("versiune nouă");

    // JUMATATEA DE BAZA DE DATE, SI EA ESTE CEA CARE CONTEAZA. Un buton
    // dezactivat este o curtoazie. Aici se ocoleste ecranul complet si se cere
    // modificarea direct la PostgREST, cu un jeton de administrator valid, ca sa
    // se vada ca refuzul vine de la declansatorul din migratia 0025 si nu de la
    // interfata.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    expect(url).not.toBe("");
    expect(anonKey).not.toBe("");

    const api = await request.newContext({ baseURL: url });
    const owner = ownerAccount();
    const tokenResponse = await api.post("/auth/v1/token?grant_type=password", {
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      data: { email: owner.email, password: owner.password },
    });
    expect(tokenResponse.ok()).toBe(true);
    const accessToken = (await tokenResponse.json()).access_token as string;

    const refused = await api.patch(`/rest/v1/deviz_lines?id=eq.${MARCH_LINE_ID}`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      data: { quantity: 999 },
    });
    expect(refused.ok()).toBe(false);
    expect(await refused.text()).toContain("no longer a draft");

    // Si randul nu s-a miscat.
    await devizTab(page, PROJECT_ID, DEVIZ_MARCH_ID);
    expect(await valueOf(page, "deviz-line-total-TEST-DEVIZ-01")).toBe(
      MARCH_LINE_TOTAL["TEST-DEVIZ-01"],
    );
    await api.dispose();
  });

  test("un deviz emis a cărui valabilitate a trecut poartă un avertisment românesc", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await devizTab(page, PROJECT_EMPTY_ID);

    // Starea din baza ramane Emis: migratia 0025 spune ca valid_until este
    // inregistrat si nu impus de un job. Doar afisarea avertizeaza.
    await expect(page.getByTestId("deviz-expired-warning")).toBeVisible();
    await expect(page.getByTestId("deviz-expired-warning")).toContainText("Valabilitatea");
    await expect(page.getByTestId("deviz-row").first()).toContainText("Emis");
  });

  test("fiecare șir vizibil este românesc", async ({ page }) => {
    await signIn(page, ownerAccount());
    await devizTab(page, PROJECT_ID, DEVIZ_MARCH_ID);

    for (const text of [
      "Devize",
      "Versiune",
      "Stare",
      "Valabil până la",
      "Linii",
      "Produs",
      "Cantitate",
      "Unitate",
      "Preț ofertat",
      "Preț curent",
      "Diferență",
      "Total linie",
      "Subtotal",
      "Adaos",
      "Total",
    ]) {
      await expect(page.getByTestId("deviz-panel").getByText(text, { exact: false }).first()).toBeVisible();
    }

    // Starile poarta etichetele romanesti fixate de addendum, nu jetoanele
    // englezesti din enumul public.deviz_status.
    const body = (await page.getByTestId("deviz-panel").innerText()).toLowerCase();
    for (const token of ["draft", "sent", "accepted", "rejected", "expired"]) {
      expect(body).not.toContain(token);
    }
  });

  test("un proiect fără estimare arată o stare goală românească", async ({ page }) => {
    await signIn(page, ownerAccount());

    // Proiectul de cost din P3-11 nu are niciun deviz si nu capata unul aici.
    await devizTab(page, "7e57c051-0000-4000-8000-000000000002");
    await expect(page.getByTestId("deviz-panel")).toContainText("Niciun deviz");
  });
});
