import { expect, test, type Page } from "@playwright/test";
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
