import { expect, test, type Page } from "@playwright/test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALL_ROUTES } from "@/lib/nav";
import { faqForRole, loadFaq } from "../../lib/guide/faq.mjs";
import { labelsOf, loadGuide, parseFrontMatter } from "../../lib/guide/source.mjs";
import { findInFlat, guideForRole, lessonPictures, pictureView, readPngSize, splitBold } from "../../lib/guide/view.mjs";
import { managerAccount, ownerAccount } from "./support/accounts";
import { LOGIN_PATH, signIn } from "./support/auth";

// ajutor.spec - linia de acceptanta a cardului P3-321 (PR 3 din 6 al ghidului din platforma).
//
// Paginile /ajutor se randeaza din content/guide si din content/guide-images, filtrate pe rolul
// contului. Spec-ul are trei feluri de cazuri:
//   1. fara browser: functiile care aleg ce se vede (guideForRole, findInFlat, lessonPictures),
//      componenta poza, si testul de DIVERGENTA, care are cazuri care il strica;
//   2. cu browser, administrator si operator: paginile arata EXACT ce spune sursa, ca numar de
//      lectii, titluri si ordine, pentru fiecare rol;
//   3. cu browser, la 390px si la 1440px: nimic nu deruleaza lateral, tintele sunt de 44px.
//
// ASTEPTARILE SE CALCULEAZA AICI, DIN FISIERE, NU CU FUNCTIA PE CARE O PROBEAZA: expectedFor
// citeste content/guide si sorteaza singura. Un test care ar cere paginii sa se compare cu ea
// insasi n-ar putea cadea niciodata.
//
// Nu se creeaza si nu se modifica niciun rand: ghidul se citeste, nu se scrie.

const REPO = join(__dirname, "..", "..");
const GUIDE_DIR = join(REPO, "content/guide");
const PUBLIC_GUIDE = join(REPO, "content/guide-images");

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const MIN_TAP = 44;

type Role = "owner" | "account_manager";
type Shown = Array<{ chapter: string; lessons: Array<{ id: string; title: string }> }>;

const guide = loadGuide(GUIDE_DIR);
const lessonById = new Map(guide.lessons.map((l) => [l.id as string, l]));

/** Ce trebuie sa arate ghidul unui rol, citit direct din fisiere. */
function expectedFor(role: Role): Shown {
  const chapterOrder = new Map(guide.chapters.map((c) => [c.id as string, c.order as number]));
  const visible = guide.lessons
    .filter((l) => (l.roles as string[]).includes(role))
    .sort(
      (a, b) =>
        chapterOrder.get(a.chapter as string)! - chapterOrder.get(b.chapter as string)! ||
        (a.order as number) - (b.order as number),
    );
  const out: Shown = [];
  for (const l of visible) {
    let last = out[out.length - 1];
    if (!last || last.chapter !== l.chapter) {
      last = { chapter: l.chapter as string, lessons: [] };
      out.push(last);
    }
    last.lessons.push({ id: l.id as string, title: l.title as string });
  }
  return out;
}

const flatIds = (shown: Shown) => shown.flatMap((c) => c.lessons.map((l) => l.id));

/**
 * Testul de divergenta: ce arata pagina fata de ce spune sursa. Intoarce problemele; goala
 * inseamna ca se potrivesc. Compara numarul de lectii, capitolele si ordinea lor, ordinea
 * lectiilor si titlul fiecareia.
 */
function divergence(shown: Shown, expected: Shown): string[] {
  const problems: string[] = [];
  const count = (s: Shown) => s.reduce((n, c) => n + c.lessons.length, 0);
  if (count(shown) !== count(expected)) {
    problems.push(`numar de lectii: pagina ${count(shown)}, sursa ${count(expected)}`);
  }
  const shownChapters = shown.map((c) => c.chapter).join(",");
  const expectedChapters = expected.map((c) => c.chapter).join(",");
  if (shownChapters !== expectedChapters) {
    problems.push(`capitole sau ordinea lor: pagina ${shownChapters}, sursa ${expectedChapters}`);
  }
  for (const want of expected) {
    const got = shown.find((c) => c.chapter === want.chapter);
    if (!got) continue;
    const gotIds = got.lessons.map((l) => l.id).join(",");
    const wantIds = want.lessons.map((l) => l.id).join(",");
    if (gotIds !== wantIds) problems.push(`lectiile din ${want.chapter}: pagina ${gotIds}, sursa ${wantIds}`);
    for (const w of want.lessons) {
      const g = got.lessons.find((l) => l.id === w.id);
      if (g && g.title !== w.title) problems.push(`titlul lui ${w.id}: pagina "${g.title}", sursa "${w.title}"`);
    }
  }
  return problems;
}

// P3-323. Intrebarile frecvente. Asteptarea se citeste aici direct din content/guide/faq.md
// (nu cu functia din lib/guide/faq.mjs, pe care o probeaza testul): un rand pe intrare,
// "lectie | intrebare | raspuns", pastrate numai cele pe care rolul le poate deschide.
type ShownFaq = Array<{ lesson: string; question: string; answer: string; href: string | null; linkText: string }>;

function expectedFaqFor(role: Role): ShownFaq {
  const { data } = parseFrontMatter(readFileSync(join(GUIDE_DIR, "faq.md"), "utf8"), "faq.md");
  return (data.entries as string[])
    .map((raw) => raw.split(" | ").map((p) => p.trim()))
    .filter(([lesson]) => (lessonById.get(lesson)?.roles as string[] | undefined)?.includes(role))
    .map(([lesson, question, answer]) => ({
      lesson,
      question,
      answer: answer.replaceAll("**", ""),
      href: `/ajutor/${lesson}`,
      linkText: `Vezi lecția: ${lessonById.get(lesson)!.title}`,
    }));
}

/** Testul de divergenta al FAQ-ului: ce arata pagina fata de faq.md. Goala inseamna ca se potrivesc. */
function faqDivergence(shown: ShownFaq, expected: ShownFaq): string[] {
  const problems: string[] = [];
  if (shown.length !== expected.length) problems.push(`numar de intrebari: pagina ${shown.length}, sursa ${expected.length}`);
  const ids = (s: ShownFaq) => s.map((e) => e.lesson).join(",");
  if (ids(shown) !== ids(expected)) problems.push(`lectiile intrebarilor: pagina ${ids(shown)}, sursa ${ids(expected)}`);
  for (const want of expected) {
    const got = shown.find((e) => e.lesson === want.lesson);
    if (!got) continue;
    if (got.question !== want.question) problems.push(`intrebarea ${want.lesson}: pagina "${got.question}", sursa "${want.question}"`);
    if (got.answer !== want.answer) problems.push(`raspunsul ${want.lesson}: pagina "${got.answer}", sursa "${want.answer}"`);
    if (got.href !== want.href) problems.push(`legatura ${want.lesson}: pagina ${got.href}, sursa ${want.href}`);
    if (got.linkText !== want.linkText) problems.push(`textul legaturii ${want.lesson}: pagina "${got.linkText}", sursa "${want.linkText}"`);
  }
  return problems;
}

async function shownFaq(page: Page): Promise<ShownFaq> {
  return page.getByTestId("faq-item").evaluateAll((items) =>
    items.map((li) => {
      const link = li.querySelector('[data-testid="faq-lesson-link"]');
      return {
        lesson: li.getAttribute("data-lesson") ?? "",
        question: (li.querySelector('[data-testid="faq-question"]')?.textContent ?? "").trim(),
        answer: (li.querySelector('[data-testid="faq-answer"]')?.textContent ?? "").trim(),
        href: link?.getAttribute("href") ?? null,
        linkText: (link?.textContent ?? "").trim(),
      };
    }),
  );
}

// ---------------------------------------------------------------------------
// 1. Fara browser.
// ---------------------------------------------------------------------------

test("P3-321: the guide has lessons for both roles and owner-only lessons exist, so the filter has work to do", () => {
  const owner = expectedFor("owner");
  const operator = expectedFor("account_manager");
  expect(flatIds(owner).length).toBe(guide.lessons.length);
  expect(guide.lessons.length).toBeGreaterThanOrEqual(20);
  expect(flatIds(operator).length).toBeGreaterThan(0);
  expect(flatIds(operator).length).toBeLessThan(flatIds(owner).length);
});

test("P3-321: guideForRole returns the same lessons, in the same order, as the files say, for each role", () => {
  for (const role of ["owner", "account_manager"] as const) {
    const view = guideForRole(guide, role);
    const shown: Shown = view.chapters.map((c) => ({
      chapter: c.id,
      lessons: c.lessons.map((l) => ({ id: l.id as string, title: l.title as string })),
    }));
    expect(divergence(shown, expectedFor(role)), role).toEqual([]);
    expect(view.flat.map((e) => e.lesson.id)).toEqual(flatIds(expectedFor(role)));
  }
  // Un rol necunoscut sau lipsa nu vede nimic.
  expect(guideForRole(guide, "").flat).toEqual([]);
  expect(guideForRole(guide, "client").flat).toEqual([]);
});

test("P3-321: the divergence test fails when a page and the source disagree", () => {
  const source = expectedFor("owner");
  expect(divergence(structuredClone(source), source)).toEqual([]);

  const dropped = structuredClone(source);
  dropped[1].lessons.pop();
  expect(divergence(dropped, source).join("\n")).toContain("numar de lectii");

  const swapped = structuredClone(source);
  expect(swapped.find((c) => c.lessons.length >= 2)).toBeDefined();
  const chapterWithTwo = swapped.find((c) => c.lessons.length >= 2)!;
  chapterWithTwo.lessons.reverse();
  expect(divergence(swapped, source).join("\n")).toContain(`lectiile din ${chapterWithTwo.chapter}`);

  const retitled = structuredClone(source);
  retitled[0].lessons[0].title += " (altfel)";
  expect(divergence(retitled, source).join("\n")).toContain(`titlul lui ${retitled[0].lessons[0].id}`);

  const chaptersSwapped = structuredClone(source);
  [chaptersSwapped[0], chaptersSwapped[1]] = [chaptersSwapped[1], chaptersSwapped[0]];
  expect(divergence(chaptersSwapped, source).join("\n")).toContain("capitole sau ordinea lor");

  // Operatorul care ar vedea toate lectiile administratorului.
  expect(divergence(source, expectedFor("account_manager")).join("\n")).toContain("numar de lectii");
});

test("P3-323: the FAQ has 7 to 10 questions for the administrator, fewer for the operator, and every link opens for its role", () => {
  const owner = expectedFaqFor("owner");
  const operator = expectedFaqFor("account_manager");
  expect(owner.length).toBeGreaterThanOrEqual(7);
  expect(owner.length).toBeLessThanOrEqual(10);
  expect(operator.length).toBeGreaterThanOrEqual(5);
  expect(operator.length).toBeLessThan(owner.length);
  for (const role of ["owner", "account_manager"] as const) {
    const flat = flatIds(expectedFor(role));
    for (const e of expectedFaqFor(role)) expect(flat, `${role}: ${e.lesson}`).toContain(e.lesson);
  }
});

test("P3-323: faqForRole returns the questions of faq.md that the role can open, in file order", () => {
  const faq = loadFaq(join(GUIDE_DIR, "faq.md"));
  expect(faq.problems).toEqual([]);
  for (const role of ["owner", "account_manager"] as const) {
    const view = faqForRole(faq, guideForRole(guide, role).flat);
    const shown: ShownFaq = view.map((e) => ({
      lesson: e.lesson,
      question: e.question,
      answer: e.answer.replaceAll("**", ""),
      href: `/ajutor/${e.lesson}`,
      linkText: `Vezi lecția: ${e.lessonTitle}`,
    }));
    expect(faqDivergence(shown, expectedFaqFor(role)), role).toEqual([]);
    expect(shown.length, role).toBeGreaterThan(0);
  }
  // Un rol necunoscut nu vede nicio intrebare.
  expect(faqForRole(faq, guideForRole(guide, "client").flat)).toEqual([]);
});

test("P3-323: the FAQ divergence test fails when the page and faq.md disagree", () => {
  const source = expectedFaqFor("owner");
  expect(faqDivergence(structuredClone(source), source)).toEqual([]);

  const dropped = structuredClone(source);
  dropped.pop();
  expect(faqDivergence(dropped, source).join("\n")).toContain("numar de intrebari");

  const reordered = structuredClone(source);
  reordered.reverse();
  expect(faqDivergence(reordered, source).join("\n")).toContain("lectiile intrebarilor");

  const reworded = structuredClone(source);
  reworded[0].answer += " Altfel.";
  expect(faqDivergence(reworded, source).join("\n")).toContain(`raspunsul ${reworded[0].lesson}`);

  const asked = structuredClone(source);
  asked[1].question = "Altă întrebare?";
  expect(faqDivergence(asked, source).join("\n")).toContain(`intrebarea ${asked[1].lesson}`);

  const relinked = structuredClone(source);
  relinked[2].href = "/ajutor/alta-lectie";
  expect(faqDivergence(relinked, source).join("\n")).toContain(`legatura ${relinked[2].lesson}`);

  // Operatorul care ar vedea intrebarile administratorului.
  expect(faqDivergence(source, expectedFaqFor("account_manager")).join("\n")).toContain("numar de intrebari");
});

test("P3-321: next lesson crosses chapters, the last lesson has none, and a hidden lesson is not found", () => {
  const owner = guideForRole(guide, "owner").flat;
  const ids = owner.map((e) => e.lesson.id as string);
  for (const [i, id] of ids.entries()) {
    const found = findInFlat(owner, id)!;
    expect(found.next?.lesson.id ?? null, id).toBe(ids[i + 1] ?? null);
    expect(found.previous?.lesson.id ?? null, id).toBe(ids[i - 1] ?? null);
  }
  const crossing = owner.findIndex((e, i) => owner[i + 1] && owner[i + 1].chapterId !== e.chapterId);
  expect(crossing).toBeGreaterThanOrEqual(0);
  expect(findInFlat(owner, ids[crossing])!.next!.chapterId).not.toBe(owner[crossing].chapterId);
  // Operatorul nu gaseste o lectie numai a administratorului, nici pe una care nu exista.
  const operator = guideForRole(guide, "account_manager").flat;
  const ownerOnly = guide.lessons.find((l) => !(l.roles as string[]).includes("account_manager"))!;
  expect(findInFlat(operator, ownerOnly.id as string)).toBeNull();
  expect(findInFlat(operator, "nu-exista")).toBeNull();
  // Pentru operator urmatoarea lectie nu este niciodata una pe care nu o vede.
  for (const e of operator) {
    const next = findInFlat(operator, e.lesson.id as string)!.next;
    if (next) expect(next.lesson.roles as string[]).toContain("account_manager");
  }
});

test("P3-321: the Vezi si links of every lesson stay inside what the same role can open", () => {
  for (const role of ["owner", "account_manager"] as const) {
    const flat = guideForRole(guide, role).flat;
    for (const e of flat) {
      for (const id of e.lesson.see_also as string[]) {
        expect(findInFlat(flat, id), `${role}: ${e.lesson.id} -> ${id}`).not.toBeNull();
      }
    }
  }
});

test("P3-321: a label between ** is written bold and the rest is plain text", () => {
  expect(splitBold("În **Inventar** apasă **Adaugă produs**.")).toEqual([
    { text: "În ", bold: false },
    { text: "Inventar", bold: true },
    { text: " apasă ", bold: false },
    { text: "Adaugă produs", bold: true },
    { text: ".", bold: false },
  ]);
  expect(splitBold("Fără etichete.")).toEqual([{ text: "Fără etichete.", bold: false }]);
  // Nicio lectie nu are un ** lasat deschis, care s-ar vedea ca stele pe pagina.
  for (const l of guide.lessons) {
    for (const step of l.steps as string[]) {
      expect(splitBold(step).some((p) => p.text.includes("**")), `${l.id}: ${step}`).toBe(false);
    }
  }
});

/** Un PNG minim: semnatura, un antet IHDR cu latimea si inaltimea, nimic altceva. */
function fakePng(width: number, height: number): Buffer {
  const head = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head, 0);
  head.writeUInt32BE(13, 8);
  head.write("IHDR", 12, "ascii");
  head.writeUInt32BE(width, 16);
  head.writeUInt32BE(height, 20);
  return head;
}

test("P3-321: a picture that is missing, empty or not a PNG is reported as missing, never as a broken image", () => {
  const dir = mkdtempSync(join(tmpdir(), "guide-pictures-"));
  try {
    const lesson = { id: "lectie", screenshots: ["lectie"] };
    expect(lessonPictures(lesson, dir)).toEqual({ desktop: null, mobile: null });

    writeFileSync(join(dir, "lectie-desktop.png"), fakePng(1440, 900));
    writeFileSync(join(dir, "lectie-mobile.png"), "<html>not a picture</html>");
    const both = lessonPictures(lesson, dir);
    expect(both.desktop).toEqual({ src: "/api/guide/poza/lectie-desktop", width: 1440, height: 900 });
    expect(both.mobile).toBeNull();

    writeFileSync(join(dir, "lectie-mobile.png"), "");
    expect(lessonPictures(lesson, dir).mobile).toBeNull();

    writeFileSync(join(dir, "lectie-mobile.png"), fakePng(780, 1688));
    expect(lessonPictures(lesson, dir).mobile).toEqual({ src: "/api/guide/poza/lectie-mobile", width: 780, height: 1688 });

    // O lectie fara id de poza nu are poza.
    expect(lessonPictures({ id: "x" }, dir)).toEqual({ desktop: null, mobile: null });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("P3-321: every committed picture is a real PNG, so no lesson can show a broken image", () => {
  const files = readdirSync(PUBLIC_GUIDE).filter((f) => f.endsWith(".png"));
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) {
    const size = readPngSize(join(PUBLIC_GUIDE, f));
    expect(size, f).not.toBeNull();
    expect(size!.width, f).toBeGreaterThanOrEqual(300);
  }
  // Fiecare lectie cu `screen` are cel putin o poza sau este o lectie fara poza declarata.
  for (const l of guide.lessons) {
    const pics = lessonPictures(l, PUBLIC_GUIDE);
    const onDisk = ["desktop", "mobile"].filter((s) => existsSync(join(PUBLIC_GUIDE, `${l.screenshots[0]}-${s}.png`)));
    expect([pics.desktop, pics.mobile].filter(Boolean).length, l.id).toBe(onDisk.length);
  }
});

test("P3-321: what goes in the place of the picture follows the pictures that exist: none, phone only, desktop only, both", () => {
  const desktop = { src: "/api/guide/poza/a-desktop", width: 1440, height: 900 };
  const mobile = { src: "/api/guide/poza/a-mobile", width: 780, height: 1688 };
  expect(pictureView({ desktop: null, mobile: null })).toEqual({ kind: "none" });
  expect(pictureView({ desktop: null, mobile })).toEqual({ kind: "phone", mobile });
  expect(pictureView({ desktop, mobile: null })).toEqual({ kind: "desktop", desktop });
  expect(pictureView({ desktop, mobile })).toEqual({ kind: "both", desktop, mobile });
  // Fiecare lectie reala da una din cele patru stari si niciodata o poza fara adresa.
  for (const l of guide.lessons) {
    const view = pictureView(lessonPictures(l, PUBLIC_GUIDE));
    expect(["none", "phone", "desktop", "both"], l.id).toContain(view.kind);
    for (const pic of [(view as any).desktop, (view as any).mobile]) {
      if (pic) expect(pic.src, l.id).toMatch(/^\/api\/guide\/poza\/[a-z0-9-]+-(desktop|mobile)$/);
    }
  }
});

// ---------------------------------------------------------------------------
// 2. Cu browser: ce arata paginile fata de sursa.
// ---------------------------------------------------------------------------

async function shownOnIndex(page: Page): Promise<Array<{ chapter: string; lessons: Array<{ id: string; title: string; href: string | null }> }>> {
  return page.locator('[data-testid="guide-chapter"]').evaluateAll((chapters) =>
    chapters.map((ch) => ({
      chapter: ch.getAttribute("data-chapter") ?? "",
      lessons: Array.from(ch.querySelectorAll('[data-testid="guide-lesson-link"]')).map((a) => ({
        id: a.getAttribute("data-lesson") ?? "",
        title: (a.querySelector('[data-testid="guide-lesson-title"]')?.textContent ?? "").trim(),
        href: a.getAttribute("href"),
      })),
    })),
  );
}

/** Un singur loc pentru ce are o lectie pe pagina ei, pentru un rol si o latime de ecran. */
async function expectLessonPage(page: Page, id: string, role: Role, phone: boolean): Promise<void> {
  const lesson = lessonById.get(id)!;
  const flat = flatIds(expectedFor(role));
  const at = flat.indexOf(id);
  const response = await page.goto(`/ajutor/${id}`);
  expect(response?.status(), id).toBe(200);

  await expect(page.getByRole("heading", { level: 1 }), id).toHaveText(lesson.title);
  await expect(page.getByTestId("lesson-page")).toHaveAttribute("data-lesson", id);

  // Pasii: acelasi numar, acelasi text, etichetele ingrosate.
  const steps = lesson.steps as string[];
  await expect(page.getByTestId("lesson-step"), id).toHaveCount(steps.length);
  const stepTexts = await page
    .getByTestId("lesson-step")
    .evaluateAll((items) => items.map((li) => (li.lastElementChild?.textContent ?? "").trim()));
  expect(stepTexts, id).toEqual(steps.map((s) => s.replaceAll("**", "")));
  const boldLabels = await page.getByTestId("lesson-step").locator("strong").allTextContents();
  expect(boldLabels, id).toEqual(steps.flatMap((s) => labelsOf(s)));

  // Poza, sau cardul "fără imagine". Niciodata o imagine stricata.
  const hasDesktop = existsSync(join(PUBLIC_GUIDE, `${lesson.screenshots[0]}-desktop.png`));
  const hasMobile = existsSync(join(PUBLIC_GUIDE, `${lesson.screenshots[0]}-mobile.png`));
  if (!hasDesktop && !hasMobile) {
    await expect(page.getByTestId("lesson-no-picture"), id).toHaveText("fără imagine");
    await expect(page.locator("main img"), id).toHaveCount(0);
  } else {
    await expect(page.getByTestId("lesson-no-picture"), id).toHaveCount(0);
    const img = page.getByTestId("lesson-picture").locator("img");
    await expect(img, id).toHaveCount(1);
    await img.scrollIntoViewIfNeeded();
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { message: `${id}: poza nu s-a incarcat` })
      .toBe(true);
    const shown = await img.evaluate((el: HTMLImageElement) => el.currentSrc);
    const wanted = phone ? (hasMobile ? "mobile" : "desktop") : hasDesktop ? "desktop" : "mobile";
    expect(shown, id).toContain(`/api/guide/poza/${lesson.screenshots[0]}-${wanted}`);
    await expect(img, id).toHaveAttribute("alt", /.+/);
  }

  // Vezi si: aceleasi lectii, in aceeasi ordine, doar cele pe care rolul le vede.
  const seeAlso = (lesson.see_also as string[]).filter((other) => flat.includes(other));
  const links = await page.locator('[data-testid="lesson-see-also"] a').evaluateAll((as) => as.map((a) => a.getAttribute("data-see-also")));
  expect(links, id).toEqual(seeAlso);

  // Urmatoarea lectie, la sfarsit.
  const next = flat[at + 1];
  if (next) {
    const link = page.getByTestId("lesson-next");
    await expect(link, id).toHaveAttribute("data-next", next);
    await expect(link, id).toHaveAttribute("href", `/ajutor/${next}`);
    await expect(link, id).toContainText("Următoarea lecție");
    await expect(link, id).toContainText(lessonById.get(next)!.title as string);
    await expect(page.getByTestId("lesson-end"), id).toHaveCount(0);
  } else {
    await expect(page.getByTestId("lesson-next"), id).toHaveCount(0);
    await expect(page.getByTestId("lesson-end"), id).toBeVisible();
  }
}

test.describe("Administratorul vede tot ghidul", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ownerAccount());
  });

  test("1. /ajutor arata toate lectiile, in ordinea sursei, cu titlul din bara de sus", async ({ page }) => {
    await page.goto("/ajutor");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Suport și Ghid");
    await expect(page.getByRole("heading", { level: 2, name: "Ghidul platformei" })).toBeVisible();
    await expect(page.locator("header span").first()).toHaveText("Suport și Ghid");

    const shown = await shownOnIndex(page);
    const expected = expectedFor("owner");
    // Un test care citeste zero lectii gaseste zero diferente: numarul se afirma.
    expect(shown.flatMap((c) => c.lessons).length).toBe(guide.lessons.length);
    expect(divergence(shown, expected)).toEqual([]);
    for (const c of shown) for (const l of c.lessons) expect(l.href).toBe(`/ajutor/${l.id}`);

    const chapterTitles = await page.locator('[data-testid="guide-chapter"] h2').allTextContents();
    expect(chapterTitles).toEqual(expected.map((c) => guide.chapters.find((x) => x.id === c.chapter)!.title));

    // Numaratoarea de sub titlu spune cate lectii si cate capitole, cu regula romaneasca cu trei forme.
    await expect(page.getByTestId("guide-count")).toHaveText(
      new RegExp(`^${guide.lessons.length} (de )?lecții în ${guide.chapters.length} (de )?capitole`),
    );
  });

  test("1b. P3-323: Întrebări frecvente arata exact intrebarile din faq.md, cu legatura spre lectia fiecareia", async ({ page }) => {
    await page.goto("/ajutor");
    await expect(page.getByRole("heading", { level: 2, name: "Întrebări frecvente" })).toBeVisible();
    const shown = await shownFaq(page);
    const expected = expectedFaqFor("owner");
    // Un test care citeste zero intrebari gaseste zero diferente: numarul se afirma.
    expect(shown.length).toBeGreaterThanOrEqual(7);
    expect(shown.length).toBeLessThanOrEqual(10);
    expect(faqDivergence(shown, expected)).toEqual([]);
    // Etichetele din raspuns sunt scrise ingrosat, exact cum sunt in faq.md.
    const bold = await page.getByTestId("faq-answer").locator("strong").allTextContents();
    const boldExpected = (parseFrontMatter(readFileSync(join(GUIDE_DIR, "faq.md"), "utf8"), "faq.md").data.entries as string[]).flatMap((raw) =>
      labelsOf(raw.split(" | ")[2]),
    );
    expect(bold).toEqual(boldExpected);
    // Legatura duce la lectia ei, care se deschide.
    const first = shown[0];
    await page.getByTestId("faq-lesson-link").first().click();
    await expect(page).toHaveURL(new RegExp(`/ajutor/${first.lesson}$`));
    await expect(page.getByTestId("lesson-page")).toHaveAttribute("data-lesson", first.lesson);
  });

  test("2. lectiile numai ale administratorului au eticheta Administrator, celelalte nu", async ({ page }) => {
    await page.goto("/ajutor");
    const tagged = await page
      .getByTestId("guide-lesson-link")
      .evaluateAll((as) =>
        as.filter((a) => (a.lastElementChild?.textContent ?? "").trim() === "Administrator").map((a) => a.getAttribute("data-lesson")),
      );
    const ownerOnly = guide.lessons.filter((l) => (l.roles as string[]).join() === "owner").map((l) => l.id);
    expect(ownerOnly.length).toBeGreaterThan(0);
    expect(tagged.sort()).toEqual([...ownerOnly].sort());
  });

  test("3. fiecare lectie are titlul, pasii, poza, Vezi si si urmatoarea lectie din sursa", async ({ page }) => {
    test.setTimeout(300_000);
    for (const id of flatIds(expectedFor("owner"))) await expectLessonPage(page, id, "owner", false);
  });

  test("4. o adresa de lectie care nu exista da pagina 'nu există'", async ({ page }) => {
    const response = await page.goto("/ajutor/nu-exista");
    expect(response?.status()).toBe(404);
    await expect(page.getByTestId("not-found")).toHaveText("Pagina nu există");
  });

  test("5. o lectie fara poze arata cardul 'fără imagine' si niciun <img>, apoi poza revine cand fisierele revin", async ({ page }) => {
    // Citirea de pe disc se face la fiecare cerere, deci mutarea fisierelor se vede imediat.
    // Fisierele se pun inapoi in `finally`, orice s-ar intampla in test.
    const lesson = guide.lessons.find((l) => existsSync(join(PUBLIC_GUIDE, `${l.screenshots[0]}-desktop.png`)) && existsSync(join(PUBLIC_GUIDE, `${l.screenshots[0]}-mobile.png`)))!;
    const id = lesson.id as string;
    const files = ["desktop", "mobile"].map((s) => join(PUBLIC_GUIDE, `${lesson.screenshots[0]}-${s}.png`));
    try {
      for (const f of files) renameSync(f, `${f}.hidden`);
      await page.goto(`/ajutor/${id}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(lesson.title as string);
      await expect(page.getByTestId("lesson-no-picture")).toHaveText("fără imagine");
      await expect(page.getByTestId("lesson-picture")).toHaveCount(0);
      await expect(page.locator("main img")).toHaveCount(0);
      // Pasii, Vezi si si urmatoarea lectie raman la locul lor.
      await expect(page.getByTestId("lesson-step")).toHaveCount((lesson.steps as string[]).length);
    } finally {
      for (const f of files) if (existsSync(`${f}.hidden`)) renameSync(`${f}.hidden`, f);
    }
    await page.goto(`/ajutor/${id}`);
    await expect(page.getByTestId("lesson-no-picture")).toHaveCount(0);
    await expect(page.getByTestId("lesson-picture").locator("img")).toHaveCount(1);
  });

  test("6. ghidul nu pune cookie, nu scrie in stocarea browserului si nu retine ce s-a citit", async ({ page }) => {
    await page.goto("/ajutor");
    const names = async () => (await page.context().cookies()).map((c) => c.name).sort();
    const storage = () =>
      page.evaluate(() => ({
        local: Object.keys(localStorage).sort(),
        session: Object.keys(sessionStorage).sort(),
      }));
    const cookiesBefore = await names();
    const storageBefore = await storage();
    for (const id of flatIds(expectedFor("owner")).slice(0, 4)) await page.goto(`/ajutor/${id}`);
    await page.goto("/ajutor");
    expect(await names()).toEqual(cookiesBefore);
    expect(await storage()).toEqual(storageBefore);
  });

  test("7. meniul are intrarea Ajutor, ultima, spre /ajutor, si titlul din bara de sus ramane Suport și Ghid (task 325)", async ({ page }) => {
    expect(ALL_ROUTES).toContain("/ajutor");
    await page.goto("/");
    const links = page.locator("aside nav a");
    await expect(links.first()).toBeVisible();
    const entry = links.filter({ hasText: /^Ajutor$/ });
    await expect(entry).toHaveCount(1);
    await expect(entry).toHaveAttribute("href", "/ajutor");
    // Ultima intrare din meniu.
    await expect(links.last()).toHaveText("Ajutor");
    await entry.click();
    await expect(page).toHaveURL(/\/ajutor$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Suport și Ghid");
    await expect(page.locator("header span").first()).toHaveText("Suport și Ghid");
    await expect(page.locator("aside nav a[href='/ajutor']")).toHaveAttribute("aria-current", "page");
  });

  test("8. la 390 px intrarea Ajutor este in sertarul meniului si il duce la /ajutor", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/");
    await page.getByTestId("sidebar-open").click();
    const entry = page.locator("aside nav a[href='/ajutor']");
    await expect(entry).toBeVisible();
    await expect(entry).toHaveText("Ajutor");
    await entry.click();
    await expect(page).toHaveURL(/\/ajutor$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Suport și Ghid");
  });
});

test.describe("Operatorul vede numai lectiile lui", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, managerAccount());
  });

  test("1. /ajutor arata exact lectiile operatorului, in ordinea sursei", async ({ page }) => {
    await page.goto("/ajutor");
    const shown = await shownOnIndex(page);
    const expected = expectedFor("account_manager");
    expect(shown.flatMap((c) => c.lessons).length).toBeGreaterThan(0);
    expect(shown.flatMap((c) => c.lessons).length).toBeLessThan(guide.lessons.length);
    expect(divergence(shown, expected)).toEqual([]);
    // Niciun capitol nu ramane gol, nicio lectie a administratorului nu se vede, nicio eticheta Administrator.
    for (const c of shown) expect(c.lessons.length).toBeGreaterThan(0);
    for (const l of guide.lessons.filter((x) => !(x.roles as string[]).includes("account_manager"))) {
      await expect(page.locator(`[data-lesson="${l.id}"]`)).toHaveCount(0);
    }
    await expect(page.getByTestId("guide-lesson-link").filter({ hasText: /Administrator$/ })).toHaveCount(0);
  });

  test("1b. P3-323: Întrebări frecvente arata numai intrebarile ale caror lectii le vede operatorul", async ({ page }) => {
    await page.goto("/ajutor");
    const shown = await shownFaq(page);
    const expected = expectedFaqFor("account_manager");
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(expectedFaqFor("owner").length);
    expect(faqDivergence(shown, expected)).toEqual([]);
    // Nicio intrebare nu trimite la o lectie pe care operatorul nu o poate deschide.
    const visible = new Set(flatIds(expectedFor("account_manager")));
    for (const e of shown) expect(visible.has(e.lesson), e.lesson).toBe(true);
  });

  test("2. fiecare lectie a operatorului are pasii, poza, Vezi si si urmatoarea lectie din sursa", async ({ page }) => {
    test.setTimeout(300_000);
    for (const id of flatIds(expectedFor("account_manager"))) await expectLessonPage(page, id, "account_manager", false);
  });

  test("3. o lectie numai a administratorului da operatorului pagina 'nu există', nu un refuz care ar arata ca exista", async ({ page }) => {
    const ownerOnly = guide.lessons.filter((l) => !(l.roles as string[]).includes("account_manager"));
    expect(ownerOnly.length).toBeGreaterThan(0);
    for (const l of ownerOnly) {
      const response = await page.goto(`/ajutor/${l.id}`);
      expect(response?.status(), l.id).toBe(404);
      await expect(page.getByTestId("not-found"), l.id).toHaveText("Pagina nu există");
      await expect(page.getByTestId("lesson-page")).toHaveCount(0);
    }
  });

  test("4. de la prima lectie la ultima, doar cu 'Următoarea lecție', operatorul trece prin toate lectiile lui, in ordine", async ({ page }) => {
    test.setTimeout(300_000);
    const expected = flatIds(expectedFor("account_manager"));
    await page.goto("/ajutor");
    await page.getByTestId("guide-start").click();
    const visited: string[] = [];
    for (let guard = 0; guard <= expected.length; guard++) {
      const here = await page.getByTestId("lesson-page").getAttribute("data-lesson");
      visited.push(here!);
      if ((await page.getByTestId("lesson-next").count()) === 0) break;
      await page.getByTestId("lesson-next").click();
      await expect(page.getByTestId("lesson-page")).not.toHaveAttribute("data-lesson", here!);
    }
    expect(visited).toEqual(expected);
    await expect(page.getByTestId("lesson-end")).toBeVisible();
    await page.getByRole("link", { name: "Înapoi la Suport și Ghid" }).click();
    await expect(page).toHaveURL(/\/ajutor$/);
  });
});

test("P3-321: a visitor who is not signed in is sent to the sign-in page, for the guide and for a lesson", async ({ page }) => {
  for (const path of ["/ajutor", `/ajutor/${guide.lessons[0].id}`]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${LOGIN_PATH}$`));
  }
});

// ---------------------------------------------------------------------------
// 3. Cu browser, la 390px si la 1440px: nimic nu deruleaza lateral.
// ---------------------------------------------------------------------------

/** Ce iese din ecran: pagina, zona principala, sau orice element din zona principala. */
async function sidewaysProblems(page: Page, viewportWidth: number): Promise<string[]> {
  return page.evaluate((vw) => {
    const out: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth) out.push(`pagina deruleaza lateral: ${doc.scrollWidth} > ${doc.clientWidth}`);
    const main = document.querySelector("main");
    if (main && main.scrollWidth > main.clientWidth) out.push(`zona principala deruleaza lateral: ${main.scrollWidth} > ${main.clientWidth}`);
    for (const el of Array.from(document.querySelectorAll("main *"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const what = `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 30)}"`;
      if (r.left < -1) out.push(`${what} iese spre stanga: ${Math.round(r.left)}`);
      if (r.right > vw + 1) out.push(`${what} iese spre dreapta: ${Math.round(r.right)} > ${vw}`);
    }
    return out;
  }, viewportWidth);
}

/** Ce e mai mic de 44px si poate fi atins: legaturile din zona principala. */
async function smallTapTargets(page: Page): Promise<string[]> {
  return page.evaluate((min) => {
    const out: string[] = [];
    for (const a of Array.from(document.querySelectorAll("main a"))) {
      const r = a.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.height < min - 0.5) out.push(`${(a.textContent ?? "").trim().slice(0, 30)}: ${Math.round(r.height)}px`);
    }
    return out;
  }, MIN_TAP);
}

/** Lectii alese pentru felul lor: cea cu cei mai multi pasi, doar telefon, doar desktop, prima, ultima. */
function sampleLessons(): string[] {
  const owner = flatIds(expectedFor("owner"));
  const longest = [...guide.lessons].sort((a, b) => (b.steps as string[]).length - (a.steps as string[]).length)[0].id as string;
  const mobileOnly = guide.lessons.find((l) => !existsSync(join(PUBLIC_GUIDE, `${l.screenshots[0]}-desktop.png`)))?.id as string | undefined;
  const desktopOnly = guide.lessons.find((l) => !existsSync(join(PUBLIC_GUIDE, `${l.screenshots[0]}-mobile.png`)))?.id as string | undefined;
  return [...new Set([owner[0], longest, mobileOnly, desktopOnly, owner[owner.length - 1]].filter((x): x is string => !!x))];
}

for (const [name, viewport] of [
  ["390 px", PHONE],
  ["1440 px", DESKTOP],
] as const) {
  test.describe(`Ghidul la ${name}`, () => {
    test.use({ viewport });

    test("nimic nu deruleaza lateral pe /ajutor si pe lectiile alese, pozele incap, lectiile se citesc", async ({ page }) => {
      test.setTimeout(180_000);
      await signIn(page, ownerAccount());
      const phone = viewport.width === PHONE.width;
      expect(sampleLessons().length).toBeGreaterThanOrEqual(3);

      await page.goto("/ajutor");
      await expect(page.getByTestId("guide-chapter").first()).toBeVisible();
      expect(await sidewaysProblems(page, viewport.width), `/ajutor la ${name}`).toEqual([]);
      if (phone) expect(await smallTapTargets(page), `/ajutor la ${name}`).toEqual([]);

      for (const id of sampleLessons()) {
        await expectLessonPage(page, id, "owner", phone);
        // Poza este incarcata (expectLessonPage a derulat pana la ea); acum se masoara pagina intreaga.
        expect(await sidewaysProblems(page, viewport.width), `${id} la ${name}`).toEqual([]);
        if (phone) expect(await smallTapTargets(page), `${id} la ${name}`).toEqual([]);
        // Pasii sunt cititi pe lungime, nu taiati: nicio linie de pas nu iese din cutia ei.
        const clipped = await page
          .getByTestId("lesson-step")
          .evaluateAll((items) => items.filter((li) => li.scrollWidth > li.clientWidth + 1).length);
        expect(clipped, `${id} la ${name}`).toBe(0);
      }
    });
  });
}
