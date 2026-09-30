import { expect, test, type Locator, type Page } from "@playwright/test";
import { managerAccount, ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { SETTINGS_SECTIONS, settingsSectionHref } from "@/lib/data/setari-sections";
import { ROLE_LABEL } from "@/lib/supabase/types";

// setari-utilizatori.spec - linia de acceptanta a cardului P3-114 (goal G69 partea 3).
//
// CE PROBEAZA, in ordinea in care conteaza:
//   1. Secțiunea Utilizatori exista si arata conturile pe care le provizioneaza suita,
//      fiecare cu numele, emailul, rolul ROMANESTE si un semn de activ sau inactiv.
//   2. NIMIC NU SE POATE SCRIE DE PE EA, masurat si nu declarat: in tot blocul nu
//      exista niciun input, select, textarea sau buton, deci nici selector de rol,
//      nici intrerupator de pornit si oprit, nici buton de salvare.
//   3. Propoziția romaneasca despre contul creat in afara aplicatiei este pe ecran.
//      Ea este raspunsul in locul unui buton care nu poate reusi niciodata.
//   4. Operatorul primeste la /setari EXACT refuzul de azi, neatins de acest card.
//   5. Ecranul care exista nu s-a rupt: adresa goala nu redirecteaza, casuta de
//      categorie este acolo fara niciun clic, si a cincea secțiune are adresa ei.
//   6. Pe un telefon de 390x844 fiecare cont este un card, nu se deruleaza lateral si
//      fiecare tinta are 44px.
//
// NU SCRIE NIMIC IN BAZA, NICIODATA. Fiecare caz citeste ecranul: niciun cont creat,
// niciun rol schimbat, nicio categorie adaugata. Cardul nu are cod de scriere, deci
// nu exista nici ce sa fie exercitat.
//
// NICIUN NUME SI NICIUN EMAIL SCRIS IN COD. Conturile sunt oameni. Emailurile vin din
// tests/e2e/support/accounts.ts, care le citeste din mediu, deci acest fisier nu
// poarta nici o adresa literala si nici un nume inventat.

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const MIN_TAP = 44;

/** Randul contului cu acest email. Emailul este cel din mediu, nu unul scris aici. */
function rowFor(page: Page, email: string): Locator {
  return page.getByTestId("account-row").filter({ hasText: email });
}

/**
 * Fiecare rand este un card, cu eticheta fiecarei celule egala cu antetul coloanei
 * ei. Aceeasi masura ca in tests/e2e/phone-remainder.spec.ts, scrisa aici fiindca
 * acolo este locala unui spec si nu exportata.
 */
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
        return before.content === "none" || before.content === "normal"
          ? ""
          : before.content.replace(/^"|"$/g, "");
      });
      return { display: getComputedStyle(tr).display, heads, labels };
    });
    expect(reading.display, `randul ${i} nu este card pe ${where}`).toBe("grid");
    expect(reading.heads, `tabel fara antet pe ${where}`).toEqual([
      "Nume",
      "Email",
      "Rol",
      "Stare",
    ]);
    expect(reading.labels, `etichetele randului ${i} pe ${where}`).toEqual(reading.heads);
  }
}

/** Nicio derulare laterala. */
async function expectFitsPhone(page: Page, where: string): Promise<void> {
  const reading = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(reading.scrollWidth, `derulare laterala pe ${where}`).toBeLessThanOrEqual(
    reading.clientWidth,
  );
}

test.describe("P3-114: Utilizatori in Setări, doar de citit", () => {
  test.describe.configure({ timeout: 120_000 });

  test("(1) secțiunea listează conturile suitei cu nume, email, rol românesc și stare", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await page.goto(settingsSectionHref("utilizatori"));

    const block = page.getByTestId("settings-utilizatori");
    await expect(block).toBeVisible({ timeout: 25_000 });
    await expect(block.getByText("Utilizatori", { exact: true })).toBeVisible();

    // AMANDOUA CONTURILE PE CARE LE PROVIZIONEAZA SUITA sunt pe ecran, gasite dupa
    // emailul lor din mediu. Contul fara profil (CRIT-17) nu are rand in profiles, si
    // de aceea nu este cerut aici: ar fi fost o afirmatie falsa despre tabela.
    const owner = rowFor(page, ownerAccount().email);
    const manager = rowFor(page, managerAccount().email);
    await expect(owner, "randul administratorului").toHaveCount(1);
    await expect(manager, "randul operatorului").toHaveCount(1);

    // ROLUL ESTE ROMANESTE SI ESTE CEL DIN ROLE_LABEL, harta pe care o citeste deja
    // bara de sus: Administrator si Operator. Tokenul englezesc al enumului app_role
    // NU AJUNGE PE ECRAN, care este regula P2-01.
    await expect(owner).toHaveAttribute("data-role", "owner");
    await expect(manager).toHaveAttribute("data-role", "account_manager");
    // Celula Rol, a treia, citita ca text si comparata EXACT cu eticheta romaneasca.
    // Se masoara celula si nu tot blocul, fiindca emailul unui cont de test poate
    // conține el insusi cuvantul englezesc si atunci o masura pe tot blocul ar fi
    // spus ceva fals despre ecran.
    await expect(owner.locator("> td").nth(2)).toHaveText(ROLE_LABEL.owner);
    await expect(manager.locator("> td").nth(2)).toHaveText(ROLE_LABEL.account_manager);
    expect(ROLE_LABEL.owner).toBe("Administrator");
    expect(ROLE_LABEL.account_manager).toBe("Operator");

    // NUMELE: fiecare rand arata un nume in prima celula, niciodata un identificator.
    // Regula este ownerDisplayName, deci un cont fara nume complet apare prin email si
    // nu ca o celula goala.
    for (const row of [owner, manager]) {
      const name = (await row.locator("> td").first().innerText()).trim();
      expect(name.length, "celula de nume este goala").toBeGreaterThan(0);
      expect(name, `numele arata ca un identificator: ${name}`).not.toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-/i,
      );
    }

    // STAREA: fiecare rand poarta un semn de activ sau inactiv, cu CUVANTUL pe el si
    // nu doar o culoare. Amandoua conturile suitei sunt active, deci cuvantul cerut
    // este Activ, si atributul spune acelasi lucru pe care il spune cipul.
    for (const row of [owner, manager]) {
      await expect(row).toHaveAttribute("data-active", "true");
      await expect(row.getByText("Activ", { exact: true })).toBeVisible();
    }

    // Cipul secțiunii spune singur ce este ecranul.
    await expect(block.getByText("Doar vizualizare", { exact: true })).toBeVisible();
  });

  test("(2) nimic de pe secțiune nu poate scrie: nici rol, nici pornit-oprit, nici salvare", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await page.goto(settingsSectionHref("utilizatori"));
    const block = page.getByTestId("settings-utilizatori");
    await expect(block).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("account-row").first()).toBeVisible();

    // DOAR DE CITIT, MASURAT SI NU DECLARAT, exact ca la unitatile de masura: in tot
    // blocul nu exista niciun control. Asta acopera deodata cele trei lucruri pe care
    // raportul de proiectare le-a trimis in partea a patra, fiindca fiecare dintre ele
    // ar fi unul dintre elementele de mai jos.
    await expect(block.locator("input, select, textarea, button")).toHaveCount(0);
    await expect(block.locator("form")).toHaveCount(0);
    // Si niciun cuvant de scriere pe ecran, ca nimeni sa nu caute ce nu este acolo.
    for (const word of ["Salvează", "Adaugă", "Dezactivează", "Activează", "Șterge"]) {
      await expect(block.getByText(word, { exact: true }), `cuvantul ${word}`).toHaveCount(0);
    }

    // PROPOZIȚIA CARE OPRESTE O INTREBARE LA SUPORT. Raportul de proiectare o cere
    // literal, si motivul lui: un ecran care isi spune limita nu naste o intrebare.
    const note = page.getByTestId("account-creation-note");
    await expect(note).toBeVisible();
    await expect(note).toContainText("Un cont nou este creat de administrator în afara aplicației");
    await expect(note).toContainText("nu se modifică");
  });

  test("(3) operatorul primește la /setari exact refuzul de azi, neatins de acest card", async ({
    page,
  }) => {
    await signIn(page, managerAccount());
    await page.goto("/setari");

    // Aceeasi afirmatie ca in tests/e2e/auth.spec.ts, repetata aici DELIBERAT: acest
    // card adauga o citire a tabelei conturilor pe acest ecran, deci trebuie sa isi
    // dovedeasca singur ca nu a deschis nimic nimanui.
    const forbidden = page.getByTestId("forbidden");
    await expect(forbidden).toBeVisible({ timeout: 25_000 });
    await expect(forbidden).toContainText("Acces interzis");
    // Rewrite si nu redirect: adresa ramane cea ceruta.
    await expect(page).toHaveURL(/\/setari$/);

    // SI NIMIC DIN SECȚIUNE NU SCAPA PE LANGA REFUZ, nici pe adresa secțiunii.
    await expect(page.getByTestId("settings-utilizatori")).toHaveCount(0);
    await expect(page.getByTestId("account-row")).toHaveCount(0);
    await page.goto(settingsSectionHref("utilizatori"));
    await expect(page.getByTestId("forbidden")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("settings-utilizatori")).toHaveCount(0);
  });

  test("(4) ecranul care exista nu s-a rupt: adresa goala, casuta de categorie, a cincea secțiune", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await page.goto("/setari");

    // FARA REDIRECTARE, si casuta de adaugare a unei categorii este acolo fara clic:
    // zece fisiere de test isi fac o categorie exact asa inainte de a crea un produs.
    await expect(page).toHaveURL(/\/setari$/);
    await expect(page.getByTestId("category-name")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("category-add")).toBeVisible();

    // Cele patru blocuri de dinainte sunt neatinse pe adresa goala, iar al cincilea
    // este langa ele.
    for (const id of [
      "settings-catalog",
      "settings-facturare",
      "settings-optiuni",
      "settings-utilizatori",
    ]) {
      await expect(page.getByTestId(id), `${id} pe adresa goala`).toBeVisible();
    }

    // A CINCEA SECȚIUNE ARE ADRESA EI si sub-meniul o marcheaza pe ea singura.
    await page.goto(settingsSectionHref("utilizatori"));
    await expect(page).toHaveURL(/\/setari\?sectiune=utilizatori$/);
    const active = await page
      .getByTestId("settings-sections")
      .evaluate((nav) =>
        Array.from(nav.querySelectorAll("a[data-active='true']")).map(
          (a) => a.getAttribute("data-testid") ?? "",
        ),
      );
    expect(active).toEqual(["settings-section-utilizatori"]);

    // Si pe ea nu apare niciunul dintre celelalte patru blocuri: se citeste numai ce
    // se arata, regula pusa de P3-113.
    for (const id of ["settings-catalog", "settings-facturare", "settings-optiuni"]) {
      await expect(page.getByTestId(id), `${id} pe secțiunea utilizatori`).toHaveCount(0);
    }
  });

  test("(5) pe telefon (390x844) fiecare cont este un card, fara derulare laterala", async ({
    page,
  }) => {
    // Autentificarea se face pe desktop si abia apoi se strange ecranul, exact ca
    // ajutorul signInOnPhone din tests/e2e/phone-remainder.spec.ts: masurat este
    // ecranul de setari, nu formularul de autentificare.
    await page.setViewportSize(DESKTOP);
    await signIn(page, ownerAccount());
    await page.setViewportSize(PHONE);

    await page.goto(settingsSectionHref("utilizatori"));
    const rows = page.getByTestId("account-row");
    await expect(rows.first()).toBeVisible({ timeout: 25_000 });

    await expectFitsPhone(page, "/setari?sectiune=utilizatori");
    await expectRowCards(rows, "/setari?sectiune=utilizatori");

    // FIECARE intrare a sub-meniului, oricate sunt, este o tinta de 44px.
    //
    // P3-116, goal G69 partea 4. ERA `toBe(5)`, o copie scrisa de mana a unui numar
    // pe care constanta SETTINGS_SECTIONS il poarta deja, si a sasea secțiune l-a
    // facut fals: `Expected: 5, Received: 6`. Se citeste acum din lista, exact
    // reparatia pe care P3-114 a facut-o in fisierul frate
    // tests/e2e/setari-sections.spec.ts si a lasat-o in al lui. MASURA NU SLABESTE:
    // matura fiecare intrare pe care o are sub-meniul, oricate sunt, in loc de
    // primele cinci, iar clauza de 44px de mai jos rămâne neatinsa.
    const heights = await page
      .getByTestId("settings-sections")
      .evaluate((nav) =>
        Array.from(nav.querySelectorAll("a")).map((a) => ({
          id: a.getAttribute("data-testid") ?? "",
          height: a.getBoundingClientRect().height,
        })),
      );
    expect(heights.length, "sub-meniul nu are toate intrarile listei").toBe(
      SETTINGS_SECTIONS.length,
    );
    expect(
      heights.filter((h) => h.height < MIN_TAP).map((h) => `${h.id} ${h.height.toFixed(1)}px`),
      `intrari sub ${MIN_TAP}px in sub-meniu`,
    ).toEqual([]);

    // SI PE ADRESA GOALA, unde blocul sta sub celelalte patru: acolo masoara si cazul
    // (f) din tests/e2e/phone-remainder.spec.ts, deci aceasta clauza il dubleaza
    // intentionat pentru randurile pe care acela nu le cunoaste.
    await page.goto("/setari");
    await expect(page.getByTestId("account-row").first()).toBeVisible({ timeout: 25_000 });
    await expectFitsPhone(page, "/setari");
    await expectRowCards(page.getByTestId("account-row"), "/setari");
  });
});
