import { expect, test, type Locator, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// client-project-tabs.spec - linia de acceptanta a cardului P3-47.
//
// Banda de file de pe fisa clientului si de pe fisa proiectului sta direct pe
// fundalul negru al paginii, in afara oricarui card alb. Pana la P3-47 fila
// activa era rc-black pe rc-black (contrast 1:1, invizibila) iar celelalte
// rc-muted pe rc-black (3.72:1, abia vizibile). Pragul cerut este 4.5:1, cel al
// WCAG 2.1 AA pentru text normal.
//
// CUM SE MASOARA CONTRASTUL, in pagina si nu dintr-o lista de clase CSS:
//   1. culoarea textului este getComputedStyle(element).color;
//   2. fundalul este primul backgroundColor netransparent (alfa peste zero)
//      gasit urcand de la element, parinte cu parinte, pana la elementul html;
//   3. ambele culori sunt aduse la sRGB pe 8 biti printr-un canvas de 1x1, ca
//      orice format pe care il intoarce browserul sa fie citit la fel;
//   4. luminanta relativa WCAG 2.1: fiecare canal c = v / 255 se liniarizeaza
//      cu c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ^ 2.4, apoi
//      L = 0.2126 R + 0.7152 G + 0.0722 B;
//   5. contrastul este (Lmare + 0.05) / (Lmic + 0.05).
// Un text cu alfa sub 1 se compune peste fundalul gasit inainte de pasul 4.
//
// MOUSE-UL SE MUTA IN COLTUL PAGINII inaintea fiecarei masuratori, ca sa se
// masoare starea de repaus a filei si nu starea hover.
//
// CE NU SE SCHIMBA ESTE TOT AICI. Filtrul de pe fila Cost sta intr-un card alb,
// deci textul negru este corect acolo; al patrulea test il tine asa.
//
// DATELE DE TEST NU SE STERG NICIODATA, conform conventiei P2-07.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

const MIN_CONTRAST = 4.5;

// P3-99 a scos fila Note din banda clientului si a mutat panoul deasupra ei.
const CLIENT_TABS = ["contacte", "proiecte", "consum", "documente"] as const;
const PROJECT_TABS = ["consum", "cost", "deviz", "comparatie", "documente", "istoric"] as const;

type Measure = { color: string; background: string; ratio: number };

async function measureContrast(target: Locator): Promise<Measure> {
  return target.evaluate((el) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas 2d indisponibil");

    const toRgba = (css: string): [number, number, number, number] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, (d[3] ?? 0) / 255];
    };

    const colorCss = getComputedStyle(el).color;
    const text = toRgba(colorCss);

    let background: [number, number, number, number] | null = null;
    let backgroundCss = "";
    for (let node: Element | null = el; node; node = node.parentElement) {
      const css = getComputedStyle(node).backgroundColor;
      const rgba = toRgba(css);
      if (rgba[3] > 0) {
        background = rgba;
        backgroundCss = css;
        break;
      }
    }
    if (!background) throw new Error("niciun fundal netransparent pana la elementul html");
    const bg = background;

    const alpha = text[3];
    const fg = [0, 1, 2].map((i) => text[i]! * alpha + bg[i]! * (1 - alpha));

    const luminance = (rgb: number[]) => {
      const lin = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * lin(rgb[0]!) + 0.7152 * lin(rgb[1]!) + 0.0722 * lin(rgb[2]!);
    };

    const l1 = luminance(fg);
    const l2 = luminance(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    return { color: colorCss, background: backgroundCss, ratio };
  });
}

async function expectReadable(page: Page, target: Locator, what: string): Promise<Measure> {
  await page.mouse.move(0, 0);
  const m = await measureContrast(target);
  expect(
    m.ratio,
    `${what}: ${m.color} pe ${m.background}, contrast ${m.ratio.toFixed(2)}:1`,
  ).toBeGreaterThanOrEqual(MIN_CONTRAST);
  return m;
}

// Fila activa si fiecare fila inactiva din banda, fiecare la cel putin 4.5:1.
async function expectRowReadable(page: Page, rowTestId: string) {
  const row = page.getByTestId(rowTestId);
  const active = row.locator('[data-active="true"]');
  await expect(active).toHaveCount(1);
  await expectReadable(page, active, `${rowTestId}, fila activa "${await active.textContent()}"`);

  const inactive = row.locator('[data-active="false"]');
  const count = await inactive.count();
  expect(count, `${rowTestId} are file inactive`).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    const tab = inactive.nth(i);
    await expectReadable(page, tab, `${rowTestId}, fila inactiva "${await tab.textContent()}"`);
  }
}

// Clic pe fiecare fila pe rand; fila tocmai activata ramane lizibila, si la fel
// restul benzii.
async function clickEachTab(page: Page, rowTestId: string, tabs: readonly string[]) {
  const row = page.getByTestId(rowTestId);
  for (const tab of tabs) {
    const button = row.getByTestId(`tab-${tab}`);
    await button.click();
    await expect(button).toHaveAttribute("data-active", "true", { timeout: 15_000 });
    await expectReadable(page, button, `${rowTestId}, fila "${tab}" dupa clic`);
    await expectRowReadable(page, rowTestId);
  }
}

function idFromUrl(page: Page): string {
  const path = new URL(page.url()).pathname;
  return path.slice(path.lastIndexOf("/") + 1);
}

async function createClient(page: Page, name: string): Promise<string> {
  await page.goto("/clienti");
  await page.getByTestId("client-new").click();
  await expect(page.getByTestId("client-form")).toBeVisible();
  await page.getByTestId("field-client-name").fill(name);
  await page.getByTestId("client-submit").click();
  await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });
  return idFromUrl(page);
}

async function createProject(page: Page, client: string, name: string): Promise<string> {
  await page.goto("/proiecte");
  await page.getByTestId("project-new").click();
  await expect(page.getByTestId("project-form")).toBeVisible();
  await page.getByTestId("field-project-client").selectOption({ label: client });
  await page.getByTestId("field-project-name").fill(name);
  await page.getByTestId("project-submit").click();
  await expect(page.getByTestId("project-detail")).toBeVisible({ timeout: 25_000 });
  return idFromUrl(page);
}

test.describe("Filele de pe fișa clientului și a proiectului se citesc pe fundalul negru", () => {
  test.describe.configure({ timeout: 120_000 });

  test("fișa clientului: fila activă și celelalte file au contrast de cel puțin 4.5:1", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const id = await createClient(page, `TEST Beneficiar File ${RUN}`);

    await page.goto(`/clienti/${id}`);
    await expect(page.getByTestId("client-tabs")).toBeVisible({ timeout: 20_000 });
    await expectRowReadable(page, "client-tabs");

    await clickEachTab(page, "client-tabs", CLIENT_TABS);
  });

  test("fișa proiectului: fila activă și celelalte file au contrast de cel puțin 4.5:1", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const client = `TEST Beneficiar File Proiect ${RUN}`;
    await createClient(page, client);
    const id = await createProject(page, client, `TEST Șantier File ${RUN}`);

    await page.goto(`/proiecte/${id}`);
    await expect(page.getByTestId("project-tabs")).toBeVisible({ timeout: 20_000 });
    await expectRowReadable(page, "project-tabs");

    await clickEachTab(page, "project-tabs", PROJECT_TABS);
  });

  test("filtrul din cardul alb de pe fila Cost rămâne negru pe alb", async ({ page }) => {
    await signIn(page, ownerAccount());
    const client = `TEST Beneficiar File Cost ${RUN}`;
    await createClient(page, client);
    const id = await createProject(page, client, `TEST Șantier File Cost ${RUN}`);

    await page.goto(`/proiecte/${id}?fila=cost`);
    const toate = page.getByTestId("cost-filter-toate");
    await expect(toate).toHaveAttribute("data-active", "true", { timeout: 20_000 });

    const m = await expectReadable(page, toate, "filtrul Toate ieșirile din cardul Cost");
    // Negru rc-black, masurat fata de cardul lui, care este alb.
    expect(m.color).toBe("rgb(11, 11, 12)");
    expect(m.background).toBe("rgb(255, 255, 255)");
  });
});
