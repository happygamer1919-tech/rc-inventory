import { test, expect } from "@playwright/test";
import { join } from "node:path";
import { NAV } from "../../lib/nav";
import {
  GUIDE_ROLES,
  countWords,
  labelsOf,
  loadGuide,
  navGroupTitles,
  parseFrontMatter,
  readAppSourceText,
  validateGuide,
  type Guide,
  type GuideRecord,
} from "../../lib/guide/source.mjs";

// P3-319. Sursa unica a ghidului (content/guide) si regulile ei. Testul nu deschide
// niciun browser si nu atinge nicio baza de date: citeste fisiere.

const REPO = join(__dirname, "..", "..");
const GUIDE_DIR = join(REPO, "content/guide");

test("P3-319: the real guide source has no problem", () => {
  const guide = loadGuide(GUIDE_DIR);
  const problems = validateGuide(guide, {
    navGroups: navGroupTitles(REPO),
    sourceText: readAppSourceText(REPO),
  });
  expect(problems).toEqual([]);
  // Un test care citeste zero lectii gaseste zero greseli: numarul se afirma.
  expect(guide.lessons.length).toBeGreaterThanOrEqual(20);
  expect(guide.lessons.length).toBeLessThanOrEqual(40);
  expect(guide.chapters.length).toBe(NAV.length);
});

test("P3-319: chapters follow the main menu order and the reader finds the groups in lib/nav.ts", () => {
  expect(navGroupTitles(REPO)).toEqual(NAV.map((g) => g.title));
  const guide = loadGuide(GUIDE_DIR);
  const menus = [...guide.chapters].sort((a, b) => a.order - b.order).map((c) => c.menu);
  expect(menus).toEqual(NAV.map((g) => g.title));
});

test("P3-319: every Vezi și link points at a lesson that exists and that the same roles can see", () => {
  const guide = loadGuide(GUIDE_DIR);
  const byId = new Map(guide.lessons.map((l) => [l.id, l]));
  expect(byId.size).toBe(guide.lessons.length);
  for (const l of guide.lessons) {
    expect(l.see_also.length, `${l.id} has no Vezi și`).toBeGreaterThan(0);
    for (const id of l.see_also as string[]) {
      const target = byId.get(id);
      expect(target, `${l.id} -> ${id}`).toBeDefined();
      for (const role of l.roles as string[]) {
        expect(target!.roles, `${l.id} -> ${id} for ${role}`).toContain(role);
      }
    }
  }
});

test("P3-319: every lesson stays under 200 words, with the title, the steps and the Vezi și line counted", () => {
  const guide = loadGuide(GUIDE_DIR);
  const titleOf = (id: string) => guide.lessons.find((l) => l.id === id)?.title as string | undefined;
  for (const l of guide.lessons) {
    // visibleText este in sursa; aici se recalculeaza ca testul sa nu depinda de el.
    const text = [l.title, l.body, ...l.steps, "Vezi și", ...l.see_also.map((id: string) => titleOf(id) ?? "")].join(" ");
    expect(countWords(text), l.id).toBeLessThan(200);
  }
});

// ---------------------------------------------------------------------------
// Fiecare regula poate pica. O regula fara un caz care o strica nu dovedeste nimic.
// ---------------------------------------------------------------------------

const NAV_GROUPS = ["Principal", "Stoc"];
const SOURCE_TEXT = "Salvează Adaugă produsul Alege fișierul";

function chapter(overrides: Partial<GuideRecord> = {}): GuideRecord {
  return {
    dir: "principal",
    file: "principal/_chapter.md",
    id: "principal",
    order: 1,
    title: "Principal",
    menu: "Principal",
    summary: "Un rezumat.",
    ...overrides,
  };
}

function stocChapter(): GuideRecord {
  return chapter({ dir: "stoc", file: "stoc/_chapter.md", id: "stoc", order: 2, title: "Stoc", menu: "Stoc" });
}

function lesson(overrides: Partial<GuideRecord> = {}): GuideRecord {
  const id = (overrides.id as string | undefined) ?? "prima-lectie";
  return {
    dir: "principal",
    name: `${id}.md`,
    file: `principal/${id}.md`,
    body: "O singură frază.",
    id,
    chapter: "principal",
    order: 1,
    roles: ["owner", "account_manager"],
    title: "Cum adaugi un produs",
    steps: ["Apasă **Adaugă produsul**.", "Apasă **Salvează**."],
    screenshots: [id],
    see_also: ["a-doua-lectie"],
    ...overrides,
  };
}

function second(overrides: Partial<GuideRecord> = {}): GuideRecord {
  return lesson({ id: "a-doua-lectie", order: 2, title: "Cum salvezi", see_also: ["prima-lectie"], ...overrides });
}

function problemsOf(lessons: GuideRecord[], chapters: GuideRecord[] = [chapter(), stocChapter()]) {
  const withStoc = chapters.some((c) => c.id === "stoc")
    ? [...lessons, lesson({ id: "din-stoc", dir: "stoc", file: "stoc/din-stoc.md", chapter: "stoc", order: 1, see_also: ["prima-lectie"], screenshots: ["din-stoc"] })]
    : lessons;
  const guide: Guide = { chapters, lessons: withStoc, problems: [] };
  return validateGuide(guide, { navGroups: NAV_GROUPS, sourceText: SOURCE_TEXT });
}

test("P3-319 control: the synthetic guide used by the failing cases is valid", () => {
  expect(problemsOf([lesson(), second()])).toEqual([]);
});

test("P3-319: a Vezi și link to a lesson that does not exist fails", () => {
  const problems = problemsOf([lesson({ see_also: ["nu-exista"] }), second()]);
  expect(problems.join("\n")).toContain('lectia "nu-exista" nu exista');
});

test("P3-319: a Vezi și link to a lesson hidden from the reader's role fails", () => {
  const problems = problemsOf([lesson(), second({ roles: ["owner"] })]);
  expect(problems.join("\n")).toContain("nu este vizibila rolului account_manager");
});

test("P3-319: a lesson of 200 words fails, 199 passes", () => {
  const filler = (n: number) => Array.from({ length: n }, () => "cuvânt").join(" ");
  // Fara corp: titlul 4 + pasii 5 + "Vezi și" 2 + titlul celeilalte lectii 2 = 13 cuvinte.
  const over = problemsOf([lesson({ body: filler(187) }), second()]);
  expect(over.join("\n")).toContain("200 cuvinte");
  const ok = problemsOf([lesson({ body: filler(186) }), second()]);
  expect(ok.filter((p) => p.includes("cuvinte"))).toEqual([]);
});

test("P3-319: a label between ** that is nowhere in the app fails", () => {
  const problems = problemsOf([lesson({ steps: ["Apasă **Buton inventat**."] }), second()]);
  expect(problems.join("\n")).toContain('eticheta "Buton inventat"');
});

test("P3-319: front matter keys are enforced", () => {
  const cases: Array<[Partial<GuideRecord>, string]> = [
    [{ title: "Adaugă un produs" }, 'title trebuie sa inceapa cu "Cum "'],
    [{ roles: [] }, "roles trebuie sa fie o lista nevida"],
    [{ roles: ["client"] }, "roles trebuie sa fie o lista nevida"],
    [{ steps: [] }, "steps trebuie sa aiba intre 1 si 8 pasi"],
    [{ steps: ["1. Apasă **Salvează**."] }, "are numar scris de mana"],
    [{ screenshots: [] }, "screenshots trebuie sa aiba exact un id"],
    [{ screenshots: ["doua", "ids"] }, "screenshots trebuie sa aiba exact un id"],
    [{ see_also: [] }, "see_also trebuie sa aiba intre 1 si 4"],
    [{ order: 3 }, "fara goluri si fara repetari"],
    [{ chapter: "inexistent" }, 'capitolul "inexistent" nu exista'],
    [{ id: "Prima Lectie" }, "id lipseste sau nu este in forma kebab-case"],
    // Caracterele interzise se scriu cu escape: fisierul acesta nu are voie sa le contina.
    [{ steps: ["Apasă **Salvează** \u2014 acum."] }, "linie lunga"],
    [{ steps: ["Apasă **Salvează** \u2013 acum."] }, "linie lunga"],
    [{ title: "Cum închizi \u015Fantierul" }, "sedila"],
  ];
  for (const [override, expected] of cases) {
    const problems = problemsOf([lesson(override), second()]);
    expect(problems.join("\n"), JSON.stringify(override)).toContain(expected);
  }
});

test("P3-319: duplicate ids and duplicate screenshot ids fail", () => {
  const dupId = problemsOf([lesson(), lesson({ order: 2 })]);
  expect(dupId.join("\n")).toContain("id repetat");
  const dupShot = problemsOf([lesson(), second({ screenshots: ["prima-lectie"] })]);
  expect(dupShot.join("\n")).toContain('screenshot "prima-lectie" folosit si de');
});

test("P3-319: chapters out of menu order, unknown menu groups and uncovered groups fail", () => {
  const swapped = problemsOf([lesson(), second()], [chapter({ order: 2 }), { ...stocChapter(), order: 1 }]);
  expect(swapped.join("\n")).toContain("capitolele nu urmeaza ordinea meniului");
  const unknown = problemsOf([lesson(), second()], [chapter({ menu: "Nicăieri" })]);
  expect(unknown.join("\n")).toContain("nu este un grup din meniul principal");
  const uncovered = problemsOf([lesson(), second()], [chapter()]);
  expect(uncovered.join("\n")).toContain('grupul de meniu "Stoc" nu are capitol');
});

test("P3-319: the front matter reader accepts the three forms and refuses a file without a header", () => {
  const { data, body } = parseFrontMatter(
    ['---', 'id: x', 'order: 2', 'roles: [owner, account_manager]', 'steps:', '  - "Apasă **A**: da."', '  - Altceva', '---', '', 'Corp.'].join("\n"),
    "x.md",
  );
  expect(data).toEqual({ id: "x", order: 2, roles: ["owner", "account_manager"], steps: ["Apasă **A**: da.", "Altceva"] });
  expect(body).toBe("Corp.");
  expect(() => parseFrontMatter("fără antet", "y.md")).toThrow("nu incepe cu un antet");
  expect(() => parseFrontMatter("---\nid: x\n", "z.md")).toThrow("nu este inchis");
  expect(() => parseFrontMatter("---\nid: x\nid: y\n---\n", "w.md")).toThrow("apare de doua ori");
});

test("P3-319: the label reader and the word counter", () => {
  expect(labelsOf("Apasă **Salvează** sau **Renunță**.")).toEqual(["Salvează", "Renunță"]);
  expect(countWords("**Doi** cuvinte")).toBe(2);
  expect(countWords("   ")).toBe(0);
  expect(GUIDE_ROLES).toEqual(["owner", "account_manager"]);
});
