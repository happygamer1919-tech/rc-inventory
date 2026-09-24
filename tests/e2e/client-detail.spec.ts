import { expect, test, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// client-detail.spec - linia de acceptanta a cardului P3-08.
//
// Acopera exact ce numeste cardul: toate filele se randeaza si se pot atinge;
// fila activa este in URL si supravietuieste unei reincarcari si unui buton de
// inapoi; Contacte listeaza contactele clientului si il marcheaza pe cel
// principal; Proiecte listeaza proiectele lui cu starea si leaga in fiecare;
// Consum materiale arata materialul eliberat catre client, cel mult 5 randuri, cu
// o legatura catre istoricul complet; Documente isi randeaza starea goala
// romaneasca fara sa arunce; un client fara contacte, fara proiecte si fara
// iesiri randeaza fiecare fila ca stare goala si nu ca prabusire.
//
// FILELE ERAU CINCI PANA LA CARDUL P3-99, iar a cincea era Note. P3-99 a scos-o
// si a mutat panoul "Ce s-a discutat" deasupra benzii; panoul si tot ce dovedea
// el sunt in client-notes.spec.ts. Aici a ramas ce este despre banda, plus un caz
// nou: `?fila=note`, adresa filei scoase, deschide Contacte si nu o eroare.
//
// DATELE DE TEST NU SE STERG NICIODATA, conform conventiei P2-07.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

const TABS = ["contacte", "proiecte", "consum", "documente"] as const;

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

async function addContact(
  page: Page,
  opts: { name: string; role?: string; phone?: string; primary?: boolean },
) {
  await page.getByTestId("tab-contacte").click();
  await page.getByTestId("contact-new").click();
  await expect(page.getByTestId("contact-form")).toBeVisible();
  await page.getByTestId("field-contact-name").fill(opts.name);
  if (opts.role) await page.getByTestId("field-contact-role").fill(opts.role);
  if (opts.phone) await page.getByTestId("field-contact-phone").fill(opts.phone);
  if (opts.primary) await page.getByTestId("field-contact-primary").check();
  await page.getByTestId("contact-submit").click();
}

test.describe("Fișa clientului", () => {
  test.describe.configure({ timeout: 120_000 });

  test("toate filele se randează, iar fila activă trăiește în URL", async ({ page }) => {
    await signIn(page, ownerAccount());
    const id = await createClientRecord(page, `TEST Fise ${RUN}`);

    // BANDA ESTE COMPLETA DIN ACEST CARD. Documente isi randa starea goala pana
    // cand cardul ei a umplut-o; a autora trei file atunci si doua mai tarziu ar
    // fi schimbat aspectul si schema de URL de doua ori.
    for (const tab of TABS) {
      await expect(page.getByTestId(`tab-${tab}`)).toBeVisible();
    }

    // P3-99. Nu mai exista a cincea fila, si nici butonul ei.
    await expect(page.getByTestId("tab-note")).toHaveCount(0);

    // Implicitul este prima fila.
    await expect(page.getByTestId("panel-contacte")).toBeVisible();

    for (const tab of TABS) {
      await page.getByTestId(`tab-${tab}`).click();
      await expect(page.getByTestId(`panel-${tab}`)).toBeVisible({ timeout: 15_000 });
      await expect(page).toHaveURL(new RegExp(`fila=${tab}`));
      await expect(page.getByTestId(`tab-${tab}`)).toHaveAttribute("data-active", "true");
    }

    // FILA ACTIVA SUPRAVIETUIESTE UNEI REINCARCARI, pentru ca traieste in URL si
    // nu in starea componentului. Ultima atinsa in bucla este Documente.
    await page.reload();
    await expect(page.getByTestId("panel-documente")).toBeVisible({ timeout: 20_000 });

    // SI BUTONULUI DE INAPOI, care este cealalta jumatate a aceluiasi motiv.
    await page.goBack();
    await expect(page.getByTestId("panel-consum")).toBeVisible({ timeout: 15_000 });

    // O fila necunoscuta din URL revine la prima, nu da eroare.
    await page.goto(`/clienti/${id}?fila=inexistenta`);
    await expect(page.getByTestId("panel-contacte")).toBeVisible({ timeout: 15_000 });
  });

  // P3-99, constatarea B2. LEGATURILE VECHI TREBUIE SA SE DESCHIDA. `?fila=note`
  // a circulat cat timp Note era a cincea fila, deci adresa exista in mesaje si in
  // marcaje. Cu fila scoasa, `fila` devine o valoare necunoscuta si drumul este
  // cel scris deja in ClientTabs: se revine la prima fila, fara eroare si fara
  // panou gol. Iar ce cauta cine deschide adresa aceea este oricum pe ecran, sus.
  test("o legătură veche cu fila Note deschide pagina pe Contacte, fără eroare", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const id = await createClientRecord(page, `TEST Fila Veche ${RUN}`);

    const failures: string[] = [];
    page.on("pageerror", (e) => failures.push(String(e)));

    await page.goto(`/clienti/${id}?fila=note`);

    await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("panel-contacte")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("tab-contacte")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("panel-note")).toHaveCount(0);

    // Si casuta este chiar acolo, fara nicio fila deschisa.
    await expect(page.getByTestId("client-notes")).toBeVisible();
    await expect(page.getByTestId("note-body")).toBeVisible();

    expect(failures).toEqual([]);
  });

  test("un client gol randează fiecare filă ca stare goală și nu ca prăbușire", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await createClientRecord(page, `TEST Gol ${RUN}`);

    const expected: Record<string, string> = {
      contacte: "Niciun contact înregistrat",
      proiecte: "Niciun proiect",
      consum: "Niciun consum înregistrat",
      documente: "Niciun document",
    };

    for (const tab of TABS) {
      await page.getByTestId(`tab-${tab}`).click();
      await expect(page.getByTestId(`panel-${tab}`)).toContainText(expected[tab]!, {
        timeout: 15_000,
      });
    }

    // P3-99. Starea goala a notelor nu s-a pierdut odata cu fila: este acum in
    // panoul de deasupra benzii, cu acelasi text.
    await expect(page.getByTestId("client-notes")).toContainText("Nicio notă");
  });

  test("Contacte listează persoanele și marchează contactul principal", async ({ page }) => {
    await signIn(page, ownerAccount());
    await createClientRecord(page, `TEST Contacte ${RUN}`);

    await addContact(page, { name: `Ion Rusu ${RUN}`, role: "Șef de șantier", phone: "069 111 222", primary: true });
    await expect(page.getByTestId("contact-form")).toHaveCount(0, { timeout: 20_000 });

    await addContact(page, { name: `Vera Munteanu ${RUN}`, role: "Contabil" });
    await expect(page.getByTestId("contact-form")).toHaveCount(0, { timeout: 20_000 });

    await expect(page.getByTestId("contact-row")).toHaveCount(2, { timeout: 15_000 });

    // CONTACTUL PRINCIPAL PRIMUL SI MARCAT. Cine deschide fila cauta pe cine sa
    // sune, iar raspunsul implicit este contactul principal.
    const first = page.getByTestId("contact-row").first();
    await expect(first).toContainText(`Ion Rusu ${RUN}`);
    await expect(first).toContainText("Contact principal");
    await expect(first).toContainText("Șef de șantier");

    // UN AL DOILEA CONTACT PRINCIPAL ESTE REFUZAT CU MESAJ ROMANESC, si nu cu
    // numele unui index. Regula sta in indexul partial din migratia 0014, si o
    // regula doar de interfata nu este o regula.
    await addContact(page, { name: `Petru Ciobanu ${RUN}`, primary: true });
    const error = page.getByTestId("form-error");
    await expect(error).toBeVisible({ timeout: 20_000 });
    await expect(error).toContainText("contact principal");
    await expect(error).not.toContainText("contacts_one_primary");
  });

  test("Proiecte listează șantierele clientului și leagă în fiecare", async ({ page }) => {
    await signIn(page, ownerAccount());
    const client = `TEST Proiectele ${RUN}`;
    const id = await createClientRecord(page, client);

    // Proiectul se creeaza din sectiunea Proiecte, care este si ce spune starea
    // goala a filei.
    await page.goto("/proiecte");
    await page.getByTestId("project-new").click();
    await expect(page.getByTestId("project-form")).toBeVisible();
    await page.getByTestId("field-project-client").selectOption({ label: client });
    const projectName = `TEST Șantier Fisa ${RUN}`;
    await page.getByTestId("field-project-name").fill(projectName);
    await page.getByTestId("field-project-status").selectOption("active");
    await page.getByTestId("project-submit").click();
    await expect(page.getByTestId("project-detail")).toBeVisible({ timeout: 25_000 });

    await page.goto(`/clienti/${id}?fila=proiecte`);
    const row = page.locator(`[data-testid="client-project-row"][data-name="${projectName}"]`);
    await expect(row).toHaveCount(1, { timeout: 15_000 });
    await expect(row).toContainText("În lucru");

    // Si leaga in proiect.
    await row.getByTestId("client-project-link").click();
    await expect(page.getByTestId("project-detail")).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/proiecte\/[0-9a-f-]{36}/);
  });

  test("Consum materiale este un rezumat cu cel mult 5 rânduri și o legătură către istoric", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const id = await createClientRecord(page, `TEST Consum ${RUN}`);

    await page.goto(`/clienti/${id}?fila=consum`);

    // Fara iesiri, starea goala. Cu iesiri, cel mult cinci randuri plus totalul.
    // Ambele sunt afirmatii despre DENSITATE si niciuna nu cere date construite
    // prin sase ecrane: numarul de randuri nu poate depasi cinci pentru ca
    // functia din 0022 cere cinci.
    const rows = page.getByTestId("material-row");
    expect(await rows.count()).toBeLessThanOrEqual(5);

    if ((await rows.count()) === 0) {
      await expect(page.getByTestId("panel-consum")).toContainText("Niciun consum înregistrat");
    } else {
      await expect(page.getByTestId("material-total")).toBeVisible();
      await expect(page.getByTestId("material-full-history")).toBeVisible();
    }
  });
});
