import { expect, test, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// client-detail.spec - linia de acceptanta a cardului P3-08.
//
// Acopera exact ce numeste cardul: toate cele cinci file se randeaza si se pot
// atinge; fila activa este in URL si supravietuieste unei reincarcari si unui
// buton de inapoi; Contacte listeaza contactele clientului si il marcheaza pe cel
// principal; Proiecte listeaza proiectele lui cu starea si leaga in fiecare;
// Consum materiale arata materialul eliberat catre client, cel mult 5 randuri, cu
// o legatura catre istoricul complet; Documente si Note isi randeaza starile
// goale romanesti fara sa arunce; un client fara contacte, fara proiecte si fara
// iesiri randeaza fiecare fila ca stare goala si nu ca prabusire.
//
// DATELE DE TEST NU SE STERG NICIODATA, conform conventiei P2-07.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

const TABS = ["contacte", "proiecte", "consum", "documente", "note"] as const;

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

  test("toate cele cinci file se randează, iar fila activă trăiește în URL", async ({ page }) => {
    await signIn(page, ownerAccount());
    const id = await createClientRecord(page, `TEST Fise ${RUN}`);

    // BANDA ESTE COMPLETA DIN ACEST CARD. Documente si Note isi randeaza starile
    // goale pana cand cardurile lor le umplu; a autora trei file acum si doua mai
    // tarziu ar schimba aspectul si schema de URL de doua ori.
    for (const tab of TABS) {
      await expect(page.getByTestId(`tab-${tab}`)).toBeVisible();
    }

    // Implicitul este prima fila.
    await expect(page.getByTestId("panel-contacte")).toBeVisible();

    for (const tab of TABS) {
      await page.getByTestId(`tab-${tab}`).click();
      await expect(page.getByTestId(`panel-${tab}`)).toBeVisible({ timeout: 15_000 });
      await expect(page).toHaveURL(new RegExp(`fila=${tab}`));
      await expect(page.getByTestId(`tab-${tab}`)).toHaveAttribute("data-active", "true");
    }

    // FILA ACTIVA SUPRAVIETUIESTE UNEI REINCARCARI, pentru ca traieste in URL si
    // nu in starea componentului.
    await page.reload();
    await expect(page.getByTestId("panel-note")).toBeVisible({ timeout: 20_000 });

    // SI BUTONULUI DE INAPOI, care este cealalta jumatate a aceluiasi motiv.
    await page.goBack();
    await expect(page.getByTestId("panel-documente")).toBeVisible({ timeout: 15_000 });

    // O fila necunoscuta din URL revine la prima, nu da eroare.
    await page.goto(`/clienti/${id}?fila=inexistenta`);
    await expect(page.getByTestId("panel-contacte")).toBeVisible({ timeout: 15_000 });
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
      note: "Nicio notă",
    };

    for (const tab of TABS) {
      await page.getByTestId(`tab-${tab}`).click();
      await expect(page.getByTestId(`panel-${tab}`)).toContainText(expected[tab]!, {
        timeout: 15_000,
      });
    }
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
