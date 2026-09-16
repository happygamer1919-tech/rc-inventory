import { expect, test, type Locator, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { LOGIN_PATH, signIn } from "./support/auth";

// phone-shell.spec - linia de acceptanta a cardului P3-60 (G23 partea 1).
//
// Invelisul aplicatiei pe un telefon de 390x844: ecranul de autentificare, meniul
// lateral si bara de sus. Restul suitei ruleaza la 1440x900 si ramane neschimbat;
// doar acest fisier isi alege alta latime.
//
// CE INSEAMNA "INCAPE", masurat in pagina, nu citit din clase:
//   - fara derulare laterala: document.documentElement.scrollWidth <= clientWidth
//   - tinta de atingere: fiecare control vizibil are cel putin 44px inaltime
//   - campuri de text de cel putin 16px, altfel iOS mareste pagina la focus
//   - nimic taiat: fiecare element vizibil sta intre 0 si 390px pe orizontala,
//     iar textul lui nu depaseste propria cutie (scrollWidth <= clientWidth)
//
// Spec-ul doar citeste. Nu creeaza si nu modifica niciun rand.

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const MIN_TAP = 44;
const MIN_INPUT_FONT = 16;

test.use({ viewport: PHONE });

async function expectNoSidewaysScroll(page: Page, where: string): Promise<void> {
  const sizes = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    sizes.scrollWidth,
    `derulare laterala pe ${where}: scrollWidth ${sizes.scrollWidth}, clientWidth ${sizes.clientWidth}`,
  ).toBeLessThanOrEqual(sizes.clientWidth);
}

type Box = { what: string; left: number; right: number; height: number; clipped: boolean };

/** Cutiile elementelor vizibile care se potrivesc selectorului, in interiorul lui root. */
async function boxes(root: Locator, selector: string): Promise<Box[]> {
  return root.evaluate((el, sel) => {
    const out: Box[] = [];
    for (const node of Array.from(el.querySelectorAll<HTMLElement>(sel))) {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      if (rect.width === 0 || rect.height === 0 || style.visibility === "hidden") continue;
      out.push({
        what: `${node.tagName.toLowerCase()} "${(node.getAttribute("aria-label") ?? node.textContent ?? "").trim().slice(0, 40)}"`,
        left: rect.left,
        right: rect.right,
        height: rect.height,
        clipped: node.scrollWidth > node.clientWidth + 1 && style.overflowX !== "visible",
      });
    }
    return out;
  }, selector);
}

function expectInsideViewport(list: Box[], where: string): void {
  for (const box of list) {
    expect(box.left, `${box.what} iese spre stanga pe ${where}`).toBeGreaterThanOrEqual(0);
    expect(box.right, `${box.what} iese spre dreapta pe ${where}`).toBeLessThanOrEqual(PHONE.width);
    expect(box.clipped, `${box.what} are textul taiat pe ${where}`).toBe(false);
  }
}

function expectTapTargets(list: Box[], where: string): void {
  expect(list.length, `niciun control gasit pe ${where}`).toBeGreaterThan(0);
  for (const box of list) {
    expect(box.height, `${box.what} are sub ${MIN_TAP}px pe ${where}`).toBeGreaterThanOrEqual(MIN_TAP);
  }
}

/** Bara de sus: fara derulare proprie, nimic in afara ecranului, butoane de 44px. */
async function expectTopbarFits(page: Page, where: string): Promise<void> {
  const header = page.locator("header").first();
  await expect(header).toBeVisible();
  const own = await header.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  expect(own.scrollWidth, `bara de sus deruleaza lateral pe ${where}`).toBeLessThanOrEqual(own.clientWidth);
  const children = await boxes(header, "*");
  expect(children.length).toBeGreaterThan(0);
  expectInsideViewport(children, `bara de sus, ${where}`);
  expectTapTargets(await boxes(header, "button, a[href]"), `bara de sus, ${where}`);
  await expectNoSidewaysScroll(page, where);
}

test.describe("Invelisul aplicatiei pe telefon (390x844)", () => {
  test("1. ecranul de autentificare incape: fara derulare laterala, tinte de 44px, campuri de 16px", async ({
    page,
  }) => {
    await page.goto(LOGIN_PATH);
    const form = page.getByTestId("login-form");
    await expect(form).toBeVisible();
    await expect(page.getByTestId("login-submit")).toBeEnabled();

    await expectNoSidewaysScroll(page, LOGIN_PATH);

    // Ecranul insusi: titlul, formularul si nota de jos. Nu tot <body>, unde Next
    // tine anuntatorul de ruta, un element de 1px pus deliberat in afara ecranului
    // pentru cititoarele de ecran.
    const screen = form.locator("xpath=..");
    const controls = await boxes(screen, "input, button, select, textarea, a[href], [role='button']");
    expectTapTargets(controls, LOGIN_PATH);
    expectInsideViewport(await boxes(screen, "*"), LOGIN_PATH);

    const fonts = await page
      .locator("input:not([type='hidden']):not([type='checkbox']):not([type='radio']), textarea")
      .evaluateAll((els) => els.map((el) => ({ id: el.id, size: parseFloat(getComputedStyle(el).fontSize) })));
    expect(fonts.length, "niciun camp de text pe ecranul de autentificare").toBeGreaterThanOrEqual(2);
    for (const font of fonts) {
      expect(font.size, `campul #${font.id} are sub ${MIN_INPUT_FONT}px`).toBeGreaterThanOrEqual(MIN_INPUT_FONT);
    }
  });

  test("2. meniul lateral este sertar: ascuns implicit, deschis din bara de sus, aceleasi legaturi ca pe desktop", async ({
    page,
  }, testInfo) => {
    await signIn(page, ownerAccount());

    const aside = page.locator("aside");
    const open = page.getByTestId("sidebar-open");
    await expect(aside).toHaveCount(1);
    await expect(aside).toBeHidden();
    await expect(open).toBeVisible();
    await expect(open).toHaveAccessibleName("Deschide meniul");
    await expect(open).toHaveAttribute("aria-expanded", "false");
    expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(MIN_TAP);
    await expectNoSidewaysScroll(page, "/ cu sertarul inchis");
    await page.screenshot({ path: testInfo.outputPath("phone-shell-drawer-closed.png") });

    // Accesibil de la tastatura: Tab ajunge pe buton inainte de continutul paginii.
    let reached = false;
    for (let i = 0; i < 30 && !reached; i++) {
      await page.keyboard.press("Tab");
      reached = await open.evaluate((el) => el === document.activeElement);
    }
    expect(reached, "butonul de meniu nu se poate atinge cu Tab").toBe(true);

    await open.click();
    await expect(aside).toBeVisible();
    await expect(open).toHaveAttribute("aria-expanded", "true");
    await expectNoSidewaysScroll(page, "/ cu sertarul deschis");

    const links = page.locator("aside nav a");
    await expect(links.first()).toBeVisible();
    const phoneLabels = (await links.allInnerTexts()).map((t) => t.trim());
    const phoneHrefs = await links.evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
    expect(phoneLabels.length).toBeGreaterThan(0);
    for (const label of phoneLabels) expect(label, "o legatura din sertar fara text").not.toBe("");
    const navBoxes = await boxes(aside, "a[href], button");
    expectInsideViewport(navBoxes, "sertarul deschis");
    expectTapTargets(navBoxes, "sertarul deschis");
    await page.screenshot({ path: testInfo.outputPath("phone-shell-drawer-open.png") });

    // Se inchide din controlul lui si din Escape, iar focusul revine pe buton.
    await page.getByTestId("sidebar-close").click();
    await expect(aside).toBeHidden();
    await open.click();
    await expect(aside).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(aside).toBeHidden();
    await expect(open).toBeFocused();

    // O legatura apasata in sertar navigheaza si inchide sertarul.
    await open.click();
    await links.filter({ hasText: /^Necesar de materiale$/ }).click();
    await page.waitForURL((url) => new URL(url).pathname === "/necesar", { timeout: 30_000 });
    await expect(aside).toBeHidden();

    // ACELEASI LEGATURI CA PE DESKTOP, unde meniul este vizibil fara niciun clic.
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await expect(aside).toBeVisible();
    await expect(page.getByTestId("sidebar-open")).toBeHidden();
    const desktopLabels = (await links.allInnerTexts()).map((t) => t.trim());
    const desktopHrefs = await links.evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
    expect(phoneLabels).toEqual(desktopLabels);
    expect(phoneHrefs).toEqual(desktopHrefs);
  });

  test("3. bara de sus incape la 390px: fara derulare, nimic taiat, pe tabloul de bord si pe titlul cel mai lung", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await expectTopbarFits(page, "/");

    // "Necesar de materiale" este cel mai lung titlu din meniu: se rupe pe doua
    // randuri, nu se taie si nu impinge bara in afara ecranului.
    await page.goto("/necesar");
    await expect(page.locator("header").first()).toContainText("Necesar de materiale");
    await expectTopbarFits(page, "/necesar");
  });
});
