import { test, expect } from "@playwright/test";
import { join } from "node:path";
import { NAV } from "../../lib/nav";
import { loadFaq, parseFaqEntry } from "../../lib/guide/faq.mjs";
import {
  GUIDE_ROLES,
  countWords,
  labelsOf,
  loadGuide,
  navGroupTitles,
  parseFrontMatter,
  readAppSourceText,
  validateFaq,
  validateGuide,
  type Guide,
  type GuideRecord,
} from "../../lib/guide/source.mjs";

// P3-319. Sursa unica a ghidului (content/guide) si regulile ei. Testul nu deschide
// niciun browser si nu atinge nicio baza de date: citeste fisiere.

const REPO = join(__dirname, "..", "..");
const GUIDE_DIR = join(REPO, "content/guide");
// Grupurile de meniu care au capitol in ghid: toate, mai putin cel care duce la ghidul insusi.
const MENU_GROUPS = NAV.filter((g) => !g.items.some((i) => i.href === "/ajutor"));

test("P3-319: the real guide source has no problem", () => {
  const guide = loadGuide(GUIDE_DIR);
  const problems = validateGuide(guide, {
    navGroups: navGroupTitles(REPO),
    sourceText: readAppSourceText(REPO),
  });
  expect(problems).toEqual([]);
  // Un test care citeste zero lectii gaseste zero greseli: numarul se afirma.
  expect(guide.lessons.length).toBeGreaterThanOrEqual(20);
  // 40 lectii din meniu plus 5 din "Primii pasi" (Max, 2026-10-19).
  expect(guide.lessons.length).toBeLessThanOrEqual(45);
  // Un capitol pe grup de meniu, plus "Primii pasi", care nu are grup.
  // Grupul "Suport" nu are capitol: intrarea "Ajutor" este chiar linkul spre ghid (P3-325).
  expect(guide.chapters.length).toBe(MENU_GROUPS.length + 1);
});

test("P3-319: chapters follow the main menu order and the reader finds the groups in lib/nav.ts", () => {
  expect(navGroupTitles(REPO)).toEqual(MENU_GROUPS.map((g) => g.title));
  // Singurul grup fara capitol este cel al ghidului: ultimul, cu o singura intrare, /ajutor.
  const guideGroups = NAV.filter((g) => !MENU_GROUPS.includes(g));
  expect(guideGroups.map((g) => g.items.map((i) => i.href))).toEqual([["/ajutor"]]);
  expect(NAV[NAV.length - 1]).toBe(guideGroups[0]);
  const guide = loadGuide(GUIDE_DIR);
  const sorted = [...guide.chapters].sort((a, b) => a.order - b.order);
  // "Primii pasi" nu are grup de meniu si vine primul.
  expect(sorted[0].id).toBe("primii-pasi");
  expect(sorted[0].menu).toBeNull();
  const menus = sorted.filter((c) => c.menu !== null).map((c) => c.menu);
  expect(menus).toEqual(MENU_GROUPS.map((g) => g.title));
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

test("P3-319: a chapter without a menu group is allowed first and refused after the menu chapters", () => {
  const intro = chapter({ dir: "primii-pasi", file: "primii-pasi/_chapter.md", id: "primii-pasi", order: 0, title: "Primii pași", menu: null });
  const introLesson = lesson({ id: "intra", dir: "primii-pasi", file: "primii-pasi/intra.md", chapter: "primii-pasi", see_also: ["prima-lectie"], screenshots: ["intra"] });
  const first = problemsOf([lesson(), second(), introLesson], [intro, chapter(), stocChapter()]);
  expect(first).toEqual([]);
  const last = problemsOf([lesson(), second(), introLesson], [{ ...intro, order: 3 }, chapter(), stocChapter()]);
  expect(last.join("\n")).toContain("fara grup de meniu trebuie sa vina inaintea");
});

test("P3-319: a lesson title may start with Ce, but not with another word", () => {
  expect(problemsOf([lesson({ title: "Ce înseamnă Acces interzis" }), second()])).toEqual([]);
  expect(problemsOf([lesson({ title: "Despre accesul interzis" }), second()]).join("\n")).toContain('title trebuie sa inceapa cu "Cum "');
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

// ---------------------------------------------------------------------------
// P3-323. Intrebarile frecvente (content/guide/faq.md).
// ---------------------------------------------------------------------------

test("P3-323: the real FAQ has no problem and has 7 to 10 questions", () => {
  const guide = loadGuide(GUIDE_DIR);
  const faq = loadFaq(join(GUIDE_DIR, "faq.md"));
  expect(faq.problems).toEqual([]);
  expect(validateFaq(faq, guide, { sourceText: readAppSourceText(REPO) })).toEqual([]);
  expect(faq.entries.length).toBeGreaterThanOrEqual(7);
  expect(faq.entries.length).toBeLessThanOrEqual(10);
});

const FAQ_GUIDE: Guide = {
  chapters: [],
  lessons: [lesson(), second(), ...["c", "d", "e", "f", "g", "h", "i", "j"].map((id) => lesson({ id: `lectia-${id}`, order: 3, steps: ["Apasă **Salvează**."] }))],
  problems: [],
};

function faqEntry(n: number, overrides: Partial<{ lesson: string; question: string; answer: string }> = {}) {
  return {
    lesson: n === 0 ? "prima-lectie" : n === 1 ? "a-doua-lectie" : `lectia-${"cdefghij"[n - 2]}`,
    question: `Întrebarea ${n}?`,
    answer: "Apasă **Salvează**.",
    ...overrides,
  };
}

function faqOf(entries: Array<{ lesson: string; question: string; answer: string }>, overrides: Record<string, unknown> = {}) {
  return { id: "intrebari-frecvente", title: "Întrebări frecvente", entries, problems: [], ...overrides } as Parameters<typeof validateFaq>[0];
}

const TEN = Array.from({ length: 10 }, (_, n) => faqEntry(n));

test("P3-323 control: the synthetic FAQ used by the failing cases is valid", () => {
  expect(validateFaq(faqOf(TEN), FAQ_GUIDE, { sourceText: SOURCE_TEXT })).toEqual([]);
  expect(validateFaq(faqOf(TEN.slice(0, 7)), FAQ_GUIDE, { sourceText: SOURCE_TEXT })).toEqual([]);
});

test("P3-323: fewer than 7 or more than 10 questions fail", () => {
  expect(validateFaq(faqOf(TEN.slice(0, 6)), FAQ_GUIDE, { sourceText: SOURCE_TEXT }).join("\n")).toContain("6 intrari");
  const eleven = [...TEN, faqEntry(0, { lesson: "prima-lectie", question: "Încă una?" })];
  expect(validateFaq(faqOf(eleven), FAQ_GUIDE, { sourceText: SOURCE_TEXT }).join("\n")).toContain("11 intrari");
});

test("P3-323: a question about a lesson that does not exist, a repeated lesson and a repeated question fail", () => {
  const missing = TEN.map((e, i) => (i === 0 ? { ...e, lesson: "nu-exista" } : e));
  expect(validateFaq(faqOf(missing), FAQ_GUIDE, { sourceText: SOURCE_TEXT }).join("\n")).toContain('lectia "nu-exista" nu exista');
  const twice = TEN.map((e, i) => (i === 1 ? { ...e, lesson: "prima-lectie" } : e));
  expect(validateFaq(faqOf(twice), FAQ_GUIDE, { sourceText: SOURCE_TEXT }).join("\n")).toContain("lectia apare de doua ori");
  const sameQuestion = TEN.map((e, i) => (i === 1 ? { ...e, question: TEN[0].question } : e));
  expect(validateFaq(faqOf(sameQuestion), FAQ_GUIDE, { sourceText: SOURCE_TEXT }).join("\n")).toContain("intrebare repetata");
});

test("P3-323: answer rules are enforced", () => {
  const filler = Array.from({ length: 46 }, () => "cuvânt").join(" ");
  const cases: Array<[Partial<{ question: string; answer: string }>, string]> = [
    [{ question: "Fără semn" }, "se termine cu ?"],
    [{ answer: filler }, "limita este 45"],
    [{ answer: "Apasă **Buton inventat**." }, 'eticheta "Buton inventat" nu apare exact nicaieri'],
    // O eticheta care exista in aplicatie, dar nu in pasii lectiei la care trimite intrarea.
    [{ answer: "Apasă **Adaugă produsul**." }, 'eticheta "Adaugă produsul" nu apare in pasii lectiei'],
    [{ answer: "Apasă **Salvează." }, "ramas deschis"],
    // Caracterele interzise se scriu cu escape: fisierul acesta nu are voie sa le contina.
    [{ answer: `Apasă **Salvează** ${String.fromCharCode(0x2014)} acum.` }, "linie lunga"],
    [{ answer: `Apasă **Salvează** ${String.fromCharCode(0x2013)} acum.` }, "linie lunga"],
    [{ answer: `Apasă **Salvează** la ${String.fromCharCode(0x15f)}antier.` }, "sedila"],
  ];
  for (const [override, expected] of cases) {
    // Intrarea 3 trimite la o lectie care are in pasi numai "Salvează".
    const entries = TEN.map((e, i) => (i === 2 ? { ...e, ...override } : e));
    expect(validateFaq(faqOf(entries), FAQ_GUIDE, { sourceText: SOURCE_TEXT }).join("\n"), JSON.stringify(override)).toContain(expected);
  }
});

test("P3-323: the file header and the entry shape are enforced", () => {
  expect(validateFaq(faqOf(TEN, { id: "altceva" }), FAQ_GUIDE, { sourceText: SOURCE_TEXT }).join("\n")).toContain("id trebuie sa fie");
  expect(validateFaq(faqOf(TEN, { title: "FAQ" }), FAQ_GUIDE, { sourceText: SOURCE_TEXT }).join("\n")).toContain("title trebuie sa fie");
  expect(parseFaqEntry("lectie | intrebare? | raspuns")).toEqual({ lesson: "lectie", question: "intrebare?", answer: "raspuns" });
  expect(parseFaqEntry("lectie | doar doua")).toBeNull();
  expect(parseFaqEntry("lectie |  | raspuns")).toBeNull();
});

test("P3-323: a missing faq.md is reported, not ignored", () => {
  const faq = loadFaq(join(GUIDE_DIR, "nu-exista.md"));
  expect(faq.entries).toEqual([]);
  expect(validateFaq(faq, FAQ_GUIDE, { sourceText: SOURCE_TEXT }).join("\n")).toContain("fisierul nu exista");
});

test("P3-319: the label reader and the word counter", () => {
  expect(labelsOf("Apasă **Salvează** sau **Renunță**.")).toEqual(["Salvează", "Renunță"]);
  expect(countWords("**Doi** cuvinte")).toBe(2);
  expect(countWords("   ")).toBe(0);
  expect(GUIDE_ROLES).toEqual(["owner", "account_manager"]);
});
