import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BOX_PAD, MARKER_RADIUS, layoutMarks, overlaySvg, readAccent } from "../../lib/guide/annotate.mjs";
import { SHOT_PLACEHOLDERS, loadGuide, parseAction, parseMark, shotProblems, shotSpec, type GuideRecord } from "../../lib/guide/source.mjs";
import { PLACEHOLDER_IDS, resolvePlaceholders } from "../../scripts/guide/fixtures.mjs";

// P3-320. Desenul de pe pozele ghidului si cheile de poza din lectii. Testul nu
// deschide niciun browser si nu atinge nicio baza de date; pozele le face
// .github/workflows/guide-screenshots.yml.

const REPO = join(__dirname, "..", "..");
const VIEWPORT = { width: 1440, height: 900 };

test("P3-320: the accent colour is read from the design tokens, and a missing token throws", () => {
  const css = readFileSync(join(REPO, "app/globals.css"), "utf8");
  const accent = readAccent(css);
  expect(accent).toMatch(/^#[0-9a-f]{3,8}$/);
  expect(css.toLowerCase()).toContain(`--color-rc-orange: ${accent}`);
  expect(() => readAccent(":root { --color-rc-black: #000; }")).toThrow("--color-rc-orange");
});

test("P3-320: one box, one arrow and one numbered marker per mark, all in the accent colour", () => {
  const layout = layoutMarks(
    [
      { step: 1, rect: { x: 400, y: 200, width: 120, height: 40 } },
      { step: 2, rect: { x: 400, y: 300, width: 120, height: 40 } },
    ],
    VIEWPORT,
  );
  expect(layout.map((m) => m.step)).toEqual([1, 2]);
  // Chenarul inconjoara elementul cu BOX_PAD pe fiecare latura.
  expect(layout[0].box).toEqual({ x: 400 - BOX_PAD, y: 200 - BOX_PAD, w: 120 + 2 * BOX_PAD, h: 40 + 2 * BOX_PAD });
  for (const m of layout) {
    expect(m.arrow).not.toBeNull();
    // Cercul nu calca chenarul pe care il arata.
    const insideBox = m.marker.cx > m.box.x && m.marker.cx < m.box.x + m.box.w && m.marker.cy > m.box.y && m.marker.cy < m.box.y + m.box.h;
    expect(insideBox).toBe(false);
  }
  const svg = overlaySvg(layout, "#f47c1f", VIEWPORT);
  expect(svg.match(/<circle /g)?.length).toBe(2);
  expect(svg.match(/marker-end="url\(#guide-arrow\)"/g)?.length).toBe(2);
  expect(svg).toContain('stroke="#f47c1f" stroke-width="3"');
  expect(svg).toContain(">1</text>");
  expect(svg).toContain(">2</text>");
  // Nicio alta culoare decat accentul si albul.
  const colours = new Set(svg.match(/#[0-9a-fA-F]{6}\b/g));
  expect([...colours].sort()).toEqual(["#f47c1f", "#ffffff"]);
});

test("P3-320: markers stay inside the picture and never sit on top of each other", () => {
  const items = [
    { step: 1, rect: { x: 0, y: 0, width: 200, height: 30 } },
    { step: 2, rect: { x: 0, y: 34, width: 200, height: 30 } },
    { step: 3, rect: { x: 0, y: 68, width: 200, height: 30 } },
    { step: 4, rect: { x: 1380, y: 860, width: 60, height: 40 } },
  ];
  const layout = layoutMarks(items, VIEWPORT);
  for (const m of layout) {
    expect(m.marker.cx - MARKER_RADIUS).toBeGreaterThanOrEqual(0);
    expect(m.marker.cy - MARKER_RADIUS).toBeGreaterThanOrEqual(0);
    expect(m.marker.cx + MARKER_RADIUS).toBeLessThanOrEqual(VIEWPORT.width);
    expect(m.marker.cy + MARKER_RADIUS).toBeLessThanOrEqual(VIEWPORT.height);
  }
  for (let i = 0; i < layout.length; i++) {
    for (let j = i + 1; j < layout.length; j++) {
      const d = Math.hypot(layout[i].marker.cx - layout[j].marker.cx, layout[i].marker.cy - layout[j].marker.cy);
      expect(d, `${layout[i].step} vs ${layout[j].step}`).toBeGreaterThanOrEqual(2 * MARKER_RADIUS);
    }
  }
});

test("P3-320: a box as large as the screen gets its marker in its corner and no arrow", () => {
  const [m] = layoutMarks([{ step: 1, rect: { x: 0, y: 0, width: 1440, height: 900 } }], VIEWPORT);
  expect(m.arrow).toBeNull();
});

test("P3-320: every lesson names a screen, and its picture keys are valid", () => {
  const guide = loadGuide(join(REPO, "content/guide"));
  expect(guide.problems).toEqual([]);
  expect(guide.lessons.length).toBeGreaterThanOrEqual(20);
  for (const l of guide.lessons) {
    expect(shotProblems(l), l.id).toEqual([]);
    const spec = shotSpec(l);
    expect(spec, `${l.id} has no screen`).not.toBeNull();
    // Numerele marcajelor sunt numere de pasi ai lectiei.
    for (const m of spec!.marks) expect(m!.step, l.id).toBeLessThanOrEqual((l.steps as string[]).length);
    // Fiecare acolada are un rand inventat.
    expect(() => resolvePlaceholders(spec!.screen), l.id).not.toThrow();
  }
});

test("P3-320: every placeholder key has an invented row, and nothing else does", () => {
  expect(Object.keys(PLACEHOLDER_IDS).sort()).toEqual([...SHOT_PLACEHOLDERS].sort());
  expect(resolvePlaceholders("/clienti/{client}?fila=contacte")).toBe(`/clienti/${PLACEHOLDER_IDS.client}?fila=contacte`);
  expect(() => resolvePlaceholders("/clienti/{necunoscut}")).toThrow("{necunoscut}");
});

test("P3-320: picture keys are refused when malformed", () => {
  const base: GuideRecord = {
    file: "principal/x.md",
    dir: "principal",
    id: "x",
    steps: ["Unu.", "Doi."],
    screen: "/clienti",
    marks: ["1 [data-testid='client-new']"],
  };
  expect(shotProblems(base)).toEqual([]);
  const cases: Array<[Partial<GuideRecord>, string]> = [
    [{ screen: "clienti" }, "trebuie sa fie o adresa care incepe cu /"],
    [{ screen: "/clienti/{nimic}" }, "{nimic} nu este o cheie cunoscuta"],
    [{ account: "client" }, "account trebuie sa fie unul din"],
    [{ marks: [] }, "marks lipseste"],
    [{ marks: ["fara numar"] }, 'nu are forma "<numarul pasului> <selector>"'],
    [{ marks: ["3 #email"] }, "pasul 3 nu exista (lectia are 2 pasi)"],
    [{ before: ["apasa #email"] }, "nu este click X, wait X, fill X => text"],
    [{ sizes: ["tableta"] }, "sizes trebuie sa fie o lista nevida"],
    [{ screen: undefined }, "marks fara screen"],
  ];
  for (const [override, expected] of cases) {
    expect(shotProblems({ ...base, ...override }).join("\n"), JSON.stringify(override)).toContain(expected);
  }
  expect(parseMark("2 #rc-sidebar >> role=link[name='Setări']")).toEqual({ step: 2, selector: "#rc-sidebar >> role=link[name='Setări']" });
  expect(parseAction("fill #email => ana@nord.example")).toEqual({ verb: "fill", selector: "#email", value: "ana@nord.example" });
  expect(parseAction("click [data-testid='client-new']")).toEqual({ verb: "click", selector: "[data-testid='client-new']", value: null });
});

test("P3-320: the screenshot script refuses any address that is not localhost before it starts", () => {
  const src = readFileSync(join(REPO, "scripts/guide/screenshots.mjs"), "utf8");
  expect(src).toContain('assertLocal("GUIDE_BASE_URL", BASE_URL, true)');
  expect(src).toContain('assertLocal("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL, true)');
  expect(src).toContain("scripts/assert-not-prod.mjs");
  const seed = readFileSync(join(REPO, "scripts/guide/seed.mjs"), "utf8");
  expect(seed).toContain("scripts/assert-not-prod.mjs");
  expect(seed).not.toMatch(/method:\s*"DELETE"/);
});

test("P3-320: a picture that exists is listed in the manifest, and the manifest lists only pictures that exist", () => {
  const manifestFile = join(REPO, "docs/guide/screenshots.json");
  test.skip(!existsSync(manifestFile), "no pictures generated yet");
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  const guide = loadGuide(join(REPO, "content/guide"));
  const lessonIds = new Set(guide.lessons.map((l) => l.id));
  for (const img of manifest.images) {
    expect(lessonIds.has(img.lesson), img.lesson).toBe(true);
    expect(existsSync(join(REPO, img.file)), img.file).toBe(true);
    expect(img.file).toMatch(/^public\/guide\/[a-z0-9-]+-(desktop|mobile)\.png$/);
  }
  // Fiecare lectie cu screen apare o data pe fiecare marime: cu poza sau ca "fara poza".
  for (const l of guide.lessons) {
    const spec = shotSpec(l);
    if (!spec) continue;
    for (const size of ["desktop", "mobile"]) {
      const hits = [...manifest.images, ...manifest.skipped].filter((r: { lesson: string; size: string }) => r.lesson === l.id && r.size === size);
      expect(hits.length, `${l.id} ${size}`).toBe(1);
    }
  }
});
