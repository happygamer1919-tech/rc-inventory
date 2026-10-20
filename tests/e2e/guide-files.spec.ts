import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { loadGuide } from "../../lib/guide/parse.mjs";
import { managerAccount, ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// guide-files.spec - linia de acceptanta a cardului P3-328.
//
// Pozele si PDF-ul ghidului nu mai sunt in public/, deci nu le mai poate deschide oricine.
// Se ajunge la ele numai prin /api/guide/poza/<nume> si /api/guide/pdf, care cer sesiune si
// dau fiecarui rol numai lectiile lui. Spec-ul nu creeaza si nu modifica niciun rand.

const GUIDE_DIR = join(__dirname, "..", "..", "content/guide");
const guide = loadGuide(GUIDE_DIR);

const hasRole = (l: Record<string, unknown>, role: string) => (l.roles as string[]).includes(role);
const shotOf = (l: Record<string, unknown>) => (l.screenshots as string[])[0];

// O lectie numai pentru administrator si una pentru amandoi, amandoua cu poza de desktop.
const ownerOnly = guide.lessons.find((l) => hasRole(l, "owner") && !hasRole(l, "account_manager") && shotOf(l))!;
const shared = guide.lessons.find((l) => hasRole(l, "owner") && hasRole(l, "account_manager") && shotOf(l))!;

function pageCount(bytes: Buffer): number {
  const m = /\/Type \/Pages[\s\S]{0,200}?\/Count (\d+)/.exec(bytes.toString("latin1"));
  return m ? Number(m[1]) : 0;
}

test.describe("Pozele si PDF-ul ghidului sunt dupa autentificare", () => {
  test("0. exista o lectie numai pentru administrator si una comuna, cu poza", () => {
    expect(ownerOnly, "nicio lectie numai pentru administrator, cu poza").toBeTruthy();
    expect(shared, "nicio lectie comuna, cu poza").toBeTruthy();
  });

  test("1. fara sesiune, nici adresele vechi, nici cele noi nu dau poza sau PDF-ul", async ({ request }) => {
    const urls = [
      `/guide/${shotOf(shared)}-desktop.png`,
      `/guide/${shotOf(ownerOnly)}-desktop.png`,
      "/guide/ghid-rapid-construct.pdf",
      `/api/guide/poza/${shotOf(shared)}-desktop`,
      `/api/guide/poza/${shotOf(ownerOnly)}-desktop`,
      "/api/guide/pdf",
    ];
    for (const url of urls) {
      // maxRedirects 0: o redirectare catre autentificare urmata pana la capat ar raspunde 200 cu pagina de login.
      const response = await request.get(url, { maxRedirects: 0 });
      expect(response.status(), url).not.toBe(200);
      expect(response.headers()["content-type"] ?? "", url).not.toMatch(/^(image\/|application\/pdf)/);
    }
  });

  test("2. administratorul primeste poza unei lectii numai a lui si pe a uneia comune", async ({ page }) => {
    await signIn(page, ownerAccount());
    for (const l of [ownerOnly, shared]) {
      const response = await page.request.get(`/api/guide/poza/${shotOf(l)}-desktop`, { maxRedirects: 0 });
      expect(response.status(), l.id as string).toBe(200);
      expect(response.headers()["content-type"]).toBe("image/png");
      expect(response.headers()["cache-control"]).toMatch(/private/);
    }
  });

  test("3. operatorul primeste poza unei lectii comune, dar poza unei lectii numai pentru administrator nu exista pentru el", async ({
    page,
  }) => {
    await signIn(page, managerAccount());
    const ok = await page.request.get(`/api/guide/poza/${shotOf(shared)}-desktop`, { maxRedirects: 0 });
    expect(ok.status()).toBe(200);
    expect(ok.headers()["content-type"]).toBe("image/png");

    const refused = await page.request.get(`/api/guide/poza/${shotOf(ownerOnly)}-desktop`, { maxRedirects: 0 });
    expect(refused.status()).toBe(404);
    expect(refused.headers()["content-type"] ?? "").toMatch(/json/);
  });

  test("4. un nume care nu e <id>-desktop sau <id>-mobile, sau care iese din dosar, nu da nimic", async ({ page }) => {
    await signIn(page, ownerAccount());
    for (const name of ["nu-exista-desktop", "../package", "..%2Fpackage", `${shotOf(shared)}`, `${shotOf(shared)}-desktop.png`, "ghid-rapid-construct"]) {
      const response = await page.request.get(`/api/guide/poza/${name}`, { maxRedirects: 0 });
      expect(response.status(), name).toBe(404);
    }
  });

  test("5. PDF-ul operatorului nu are lectiile numai pentru administrator, cel al administratorului le are pe toate", async ({
    browser,
  }) => {
    const bytesFor = async (account: ReturnType<typeof ownerAccount>) => {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        await signIn(page, account);
        const response = await page.request.get("/api/guide/pdf", { maxRedirects: 0 });
        expect(response.status()).toBe(200);
        expect(response.headers()["content-type"]).toBe("application/pdf");
        expect(response.headers()["content-disposition"]).toMatch(/attachment; filename="ghid-rapid-construct\.pdf"/);
        const body = Buffer.from(await response.body());
        expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
        return body;
      } finally {
        await context.close();
      }
    };

    const owner = await bytesFor(ownerAccount());
    const manager = await bytesFor(managerAccount());
    const onlyOwner = guide.lessons.filter((l) => hasRole(l, "owner") && !hasRole(l, "account_manager")).length;
    const managerLessons = guide.lessons.filter((l) => hasRole(l, "account_manager")).length;
    expect(onlyOwner).toBeGreaterThan(0);

    // O pagina pe lectie: administratorul are cu cel putin atatea pagini in plus cate lectii sunt numai ale lui.
    expect(pageCount(owner) - pageCount(manager)).toBeGreaterThanOrEqual(onlyOwner);
    expect(pageCount(manager)).toBeGreaterThanOrEqual(2 + managerLessons + 1);
    // Fiecare PDF poarta amprenta rolului lui, deci nu sunt acelasi fisier.
    expect(owner.equals(manager)).toBe(false);
  });

  test("6. pagina unei lectii isi incarca poza de la ruta noua, cu sesiunea cititorului", async ({ page }) => {
    await signIn(page, managerAccount());
    await page.goto(`/ajutor/${shared.id}`);
    const img = page.getByTestId("lesson-picture").locator("img");
    await expect(img).toHaveCount(1);
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    expect(await img.evaluate((el: HTMLImageElement) => el.currentSrc)).toContain("/api/guide/poza/");
  });

  test("7. pagina /ajutor are legatura spre PDF, care duce la ruta noua", async ({ page }) => {
    await signIn(page, managerAccount());
    await page.goto("/ajutor");
    await expect(page.getByTestId("guide-pdf")).toHaveAttribute("href", "/api/guide/pdf");
  });
});
