import { expect, test, type Locator, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { CHIP_BASE, CHIP_TONES, CHIP_TONE_NAMES } from "@/components/ui/chip-tones";

// button-contrast.spec - linia de acceptanta a cardului P3-53.
//
// Textul alb de pe portocaliu trebuie sa atinga pragul WCAG AA pentru text
// normal, 4.5:1. Revizuirea aplicatiei live din 2026-09-14 (constatarea F9) a
// masurat 2.71:1 pe butonul principal.
//
// METODA DE MASURARE. Contrastul se calculeaza IN PAGINA, din ce a calculat
// browserul: getComputedStyle(el).color pentru text si
// getComputedStyle(el).backgroundColor pentru fundalul elementului insusi.
// Fiecare culoare trece prin formula luminantei relative din WCAG 2.1: canalele
// sRGB impartite la 255, liniarizate (c <= 0.03928 ? c / 12.92 :
// ((c + 0.055) / 1.055) ^ 2.4), apoi L = 0.2126 R + 0.7152 G + 0.0722 B.
// Raportul este (L1 + 0.05) / (L2 + 0.05), cu L1 luminanta mai mare. Nu se
// citeste nicio clasa din cod: se masoara ce vede utilizatorul.
//
// CELE TREI ECRANE SI BUTOANELE LOR:
//   /clienti   Client nou     data-testid="client-new"
//   /proiecte  Proiect nou    data-testid="project-new"
//   /inventar  Adaugă produs  data-testid="product-new"
// Toate trei sunt Button din components/ui/primitives.tsx, varianta implicita.
//
// TRANZITIA. Butonul are tranzitie de culoare, deci imediat dupa hover()
// fundalul este inca la jumatatea drumului. Citirea asteapta intai sa se termine
// animatiile elementului, altfel ar masura o culoare intermediara.
//
// Spec-ul doar citeste. Nu creeaza si nu modifica niciun rand.

const MIN_RATIO = 4.5;

const SCREENS = [
  { path: "/clienti", testId: "client-new", label: "Client nou" },
  { path: "/proiecte", testId: "project-new", label: "Proiect nou" },
  { path: "/inventar", testId: "product-new", label: "Adaugă produs" },
] as const;

type Screen = (typeof SCREENS)[number];

type Reading = {
  color: string;
  backgroundColor: string;
  ratio: number;
  /** Text si fundal fara transparenta: altfel fundalul real ar fi al parintelui. */
  opaque: boolean;
};

async function read(target: Locator): Promise<Reading> {
  return target.evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((a) => a.finished.catch(() => undefined)));

    const style = getComputedStyle(el);

    // Browserul poate intoarce culoarea in mai multe sintaxe CSS. Canvasul o
    // converteste in sRGB pe 8 biti, fara un parser scris de mana.
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas 2d indisponibil");
    const rgba = (css: string): number[] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data);
    };

    const luminance = (c: number[]): number => {
      const lin = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * lin(c[0]!) + 0.7152 * lin(c[1]!) + 0.0722 * lin(c[2]!);
    };

    const fg = rgba(style.color);
    const bg = rgba(style.backgroundColor);
    const lf = luminance(fg);
    const lb = luminance(bg);
    return {
      color: style.color,
      backgroundColor: style.backgroundColor,
      ratio: (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05),
      opaque: fg[3] === 255 && bg[3] === 255,
    };
  });
}

/** Butonul ecranului, citit o data in repaus si o data sub cursor. */
async function readButton(page: Page, screen: Screen): Promise<{ rest: Reading; hover: Reading }> {
  await page.goto(screen.path);
  const button = page.getByTestId(screen.testId);
  await expect(button, `${screen.label} pe ${screen.path}`).toBeVisible();
  await expect(button, `${screen.label} pe ${screen.path}`).toBeEnabled();

  // Cursorul ramane unde l-a lasat autentificarea; il mutam departe de buton.
  await page.mouse.move(1, 1);
  const rest = await read(button);
  await button.hover();
  const hover = await read(button);
  return { rest, hover };
}

function explain(r: Reading): string {
  return `text ${r.color} pe ${r.backgroundColor}, raport ${r.ratio.toFixed(2)}:1`;
}

test.describe("Contrastul textului alb pe portocaliu", () => {
  test.describe.configure({ timeout: 90_000 });

  test.beforeEach(async ({ page }) => {
    await signIn(page, ownerAccount());
  });

  // Clauzele 1 si 2, cate un caz pe ecran.
  for (const screen of SCREENS) {
    test(`${screen.label} pe ${screen.path}: eticheta albă atinge 4.5:1 în repaus și sub cursor`, async ({
      page,
    }) => {
      const { rest, hover } = await readButton(page, screen);

      expect(rest.opaque, `în repaus: ${explain(rest)}`).toBe(true);
      expect(rest.ratio, `în repaus: ${explain(rest)}`).toBeGreaterThanOrEqual(MIN_RATIO);

      // Daca hover() nu schimba fundalul, clauza 2 nu ar masura nimic nou.
      expect(hover.backgroundColor, `sub cursor fundalul trebuie să se schimbe: ${explain(hover)}`).not.toBe(
        rest.backgroundColor,
      );
      expect(hover.opaque, `sub cursor: ${explain(hover)}`).toBe(true);
      expect(hover.ratio, `sub cursor: ${explain(hover)}`).toBeGreaterThanOrEqual(MIN_RATIO);
    });
  }

  // Clauza 3. Acelasi fundal pe toate trei inseamna o singura schimbare, nu o
  // reparatie pe fiecare ecran. Raportul se verifica si aici, ca acest caz sa
  // pice pe arborele de dinainte de card, unde culoarea comuna era prea deschisa.
  test("toate butoanele principale verificate au același fundal, iar acel fundal atinge 4.5:1", async ({
    page,
  }) => {
    const readings: { screen: Screen; rest: Reading; hover: Reading }[] = [];
    for (const screen of SCREENS) {
      readings.push({ screen, ...(await readButton(page, screen)) });
    }
    const summary = readings
      .map((r) => `${r.screen.label}: repaus ${r.rest.backgroundColor}, cursor ${r.hover.backgroundColor}`)
      .join("; ");

    expect(new Set(readings.map((r) => r.rest.backgroundColor)).size, summary).toBe(1);
    expect(new Set(readings.map((r) => r.hover.backgroundColor)).size, summary).toBe(1);
    for (const r of readings) {
      expect(r.rest.ratio, `${r.screen.label}: ${explain(r.rest)}`).toBeGreaterThanOrEqual(MIN_RATIO);
    }
  });

  // Clauza 4.
  test("cercul cu inițialele contului din bara de sus: text alb pe portocaliu la 4.5:1", async ({ page }) => {
    const avatar = page.getByTestId("topbar-avatar");
    await expect(avatar).toBeVisible();
    const reading = await read(avatar);
    expect(reading.opaque, explain(reading)).toBe(true);
    expect(reading.ratio, explain(reading)).toBeGreaterThanOrEqual(MIN_RATIO);
  });
});

// ---------------------------------------------------------------------------
// P3-98, CONSTATARILE F17 SI F13. CIPURILE, PE CARE SPEC-UL NU LE MASURA DELOC.
//
// Pana aici fisierul masura NUMAI etichete albe pe portocaliu: trei cazuri
// despre butonul principal si unul despre cercul cu initialele. Niciun cip nu
// trecea pe sub formula, si de aceea doua tonuri au putut sta luni de zile sub
// prag fara ca CI sa spuna ceva (maturarea din 2026-09-22, constatarea F13:
// portocaliu 2.92:1, chihlimbar 3.44:1, pe fundalurile lor palide).
//
// TEXTUL CIPULUI ESTE DE 12px SI GROS, deci NU este "text mare" dupa WCAG (acela
// incepe la 18.66px gros): pragul care se aplica este acelasi 4.5:1 de mai sus.
//
// CUM SE MASOARA CELE SASE TONURI. Doua dintre ele se gasesc pe ecran fara nicio
// pregatire, si se masoara exact acolo, pe elementul pe care il randeaza
// aplicatia: portocaliu pe /setari ("Doar administrator") si chihlimbar pe
// /memento ("N sub prag"). Celelalte patru nu exista pe niciun ecran fara date
// potrivite - tonul `info` se vede doar pe un deviz emis - asa ca se randeaza
// cate unul din fiecare ton IN PAGINA ADEVARATA, cu foaia de stil adevarata, din
// clasele aplicatiei insesi (components/ui/chip-tones.ts). Ca randarea aceea sa
// nu poata ramane in urma componentului, cazul de mai jos verifica intai ca
// cipul adevarat de pe /setari poarta exact `CHIP_BASE` plus tonul lui.
//
// Cazurile acestea CITESC. Nu creeaza si nu modifica niciun rand.

const CHIP_PROBE = "data-chip-probe";

/** Randeaza cate un cip din fiecare ton, in pagina deschisa, din clasele
 *  aplicatiei. Elementele raman pana la urmatoarea navigare. */
async function renderEveryTone(page: Page) {
  await page.evaluate(
    ({ base, tones, attr }) => {
      document.querySelectorAll(`[${attr}]`).forEach((node) => node.remove());
      const host = document.createElement("div");
      host.setAttribute(attr, "host");
      document.body.appendChild(host);
      for (const [tone, toneClasses] of Object.entries(tones)) {
        const chip = document.createElement("span");
        chip.className = `${base} ${toneClasses}`;
        chip.setAttribute(attr, tone);
        chip.textContent = tone;
        host.appendChild(chip);
      }
    },
    { base: CHIP_BASE, tones: CHIP_TONES, attr: CHIP_PROBE },
  );
}

test.describe("Contrastul textului din cipuri", () => {
  test.describe.configure({ timeout: 90_000 });

  test.beforeEach(async ({ page }) => {
    await signIn(page, ownerAccount());
  });

  test("cipul portocaliu de pe /setari, așa cum îl randează aplicația, atinge 4.5:1", async ({
    page,
  }) => {
    await page.goto("/setari");
    const chip = page.getByText("Doar administrator", { exact: true });
    await expect(chip).toBeVisible({ timeout: 25_000 });

    const reading = await read(chip);
    expect(reading.opaque, `cip portocaliu: ${explain(reading)}`).toBe(true);
    expect(reading.ratio, `cip portocaliu: ${explain(reading)}`).toBeGreaterThanOrEqual(MIN_RATIO);
  });

  test("cipul chihlimbar de pe /memento, așa cum îl randează aplicația, atinge 4.5:1", async ({
    page,
  }) => {
    await page.goto("/memento");
    const chip = page.getByText(/^\d+ sub prag$/).first();
    await expect(chip).toBeVisible({ timeout: 25_000 });

    const reading = await read(chip);
    expect(reading.opaque, `cip chihlimbar: ${explain(reading)}`).toBe(true);
    expect(reading.ratio, `cip chihlimbar: ${explain(reading)}`).toBeGreaterThanOrEqual(MIN_RATIO);
  });

  test("fiecare ton de cip atinge 4.5:1, măsurat în pagină pe clasele aplicației", async ({
    page,
  }) => {
    await page.goto("/setari");

    // Puntea dintre cipul adevarat si cele randate mai jos: aceleasi clase, in
    // aceeasi ordine. Daca Chip ar inceta sa mai fie CHIP_BASE plus ton, cazul
    // acesta pica aici, inainte sa masoare ceva ce nu mai seamana cu ecranul.
    const real = page.getByText("Doar administrator", { exact: true });
    await expect(real).toBeVisible({ timeout: 25_000 });
    expect(
      await real.getAttribute("class"),
      "cipul adevărat nu mai poartă CHIP_BASE plus tonul lui",
    ).toBe(`${CHIP_BASE} ${CHIP_TONES.orange}`);

    await renderEveryTone(page);

    const failures: string[] = [];
    const measured: string[] = [];
    for (const tone of CHIP_TONE_NAMES) {
      const chip = page.locator(`[${CHIP_PROBE}="${tone}"]`);
      await expect(chip, `tonul ${tone} nu a fost randat`).toHaveCount(1);
      const reading = await read(chip);
      measured.push(`${tone}: ${explain(reading)}`);
      if (!reading.opaque) failures.push(`${tone} nu este opac: ${explain(reading)}`);
      if (reading.ratio < MIN_RATIO) failures.push(`${tone}: ${explain(reading)}`);
    }

    // Toate tonurile deodata, ca o rulare rosie sa spuna TOT ce este sub prag si
    // sa nu ceara o rulare noua pentru tonul urmator.
    expect(failures, `măsurat: ${measured.join(" | ")}`).toEqual([]);
  });
});
