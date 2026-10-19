import { test, expect } from "@playwright/test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  checkPrivacy,
  contactShapeProblems,
  findNames,
  fold,
  parseDenyList,
  stripJsComments,
} from "../../lib/guide/privacy.mjs";

// P3-320. Nicio persoana, firma sau adresa reala in pozele ghidului. Testul citeste
// fisiere: nu deschide niciun browser si nu atinge nicio baza de date.

const REPO = join(__dirname, "..", "..");
const DENY = parseDenyList(readFileSync(join(REPO, "docs/guide/real-names.txt"), "utf8"));

test("P3-320: the committed fixtures, lessons and picture texts hold no name from the deny list", () => {
  // O verificare care citeste zero nume sau zero fisiere nu gaseste nimic: numerele se afirma.
  expect(DENY.length).toBeGreaterThan(0);
  const { problems, scanned } = checkPrivacy(REPO, DENY);
  expect(problems).toEqual([]);
  expect(scanned).toContain("scripts/guide/fixtures.mjs");
  expect(scanned).toContain("scripts/guide/seed.mjs");
  expect(scanned.filter((f) => f.startsWith("content/guide/")).length).toBeGreaterThanOrEqual(20);
});

// ---------------------------------------------------------------------------
// Fiecare regula poate pica. Un depozit mic, facut aici, cu un nume plantat.
// ---------------------------------------------------------------------------

const NAMES = ["Ștefan Popescu", "Firma Reală SRL", "Ivan"];

function fakeRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "guide-privacy-"));
  const all: Record<string, string> = {
    "scripts/guide/fixtures.mjs": 'export const CLIENT = "TEST Construct Nord SRL";\nexport const PHONE = "+373 00 000 101";\n',
    "content/guide/stoc/produs-nou.md": "---\nid: produs-nou\n---\n\nUn text.\n",
    ...files,
  };
  for (const [rel, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

test("P3-320 control: the clean synthetic repository passes", () => {
  expect(checkPrivacy(fakeRepo({}), NAMES).problems).toEqual([]);
});

test("P3-320: a planted real name in the fixtures fails", () => {
  const root = fakeRepo({ "scripts/guide/fixtures.mjs": 'export const CLIENT = "Firma Reală SRL";\n' });
  expect(checkPrivacy(root, NAMES).problems.join("\n")).toContain('scripts/guide/fixtures.mjs:1: apare "Firma Reală SRL"');
});

test("P3-320: a planted real name in the seed scripts fails", () => {
  const root = fakeRepo({ "scripts/seed-test-crm.mjs": 'const NAME = "ivan";\n' });
  expect(checkPrivacy(root, NAMES).problems.join("\n")).toContain('scripts/seed-test-crm.mjs:1: apare "Ivan"');
});

test("P3-320: a planted real name in a lesson fails", () => {
  const root = fakeRepo({ "content/guide/stoc/produs-nou.md": "---\nid: produs-nou\n---\n\nSună-l pe Ștefan Popescu.\n" });
  expect(checkPrivacy(root, NAMES).problems.join("\n")).toContain('content/guide/stoc/produs-nou.md:5: apare "Ștefan Popescu"');
});

test("P3-320: a real name in the text captured with a picture fails", () => {
  const manifest = JSON.stringify({ images: [{ id: "client-nou", text: "Clienți Firma Reala SRL Activ" }] }, null, 2);
  const root = fakeRepo({ "docs/guide/screenshots.json": manifest });
  expect(checkPrivacy(root, NAMES).problems.join("\n")).toContain('docs/guide/screenshots.json:5: apare "Firma Reală SRL"');
});

test("P3-320: case and diacritics are ignored, and only whole words match", () => {
  expect(fold("ȘTEFAN Popescu")).toBe("stefan popescu");
  expect(findNames("STEFAN   POPESCU a sunat", NAMES)).toEqual([{ name: "Ștefan Popescu", line: 1 }]);
  expect(findNames("o linie\nfirma reala srl", NAMES)).toEqual([{ name: "Firma Reală SRL", line: 2 }]);
  // Un nume scurt nu prinde bucati din alte cuvinte.
  expect(findNames("Ivanov si Ivanca", NAMES)).toEqual([]);
  expect(findNames("ivan.", NAMES)).toEqual([{ name: "Ivan", line: 1 }]);
});

test("P3-320: in code only the data counts, comments are skipped and line numbers kept", () => {
  const code = '// scris de Ivan\n/* si de\nIvan */\nconst a = "// nu este comentariu: Ivan";\n';
  const stripped = stripJsComments(code);
  expect(findNames(stripped, NAMES)).toEqual([{ name: "Ivan", line: 4 }]);
  const root = fakeRepo({ "scripts/guide/seed.mjs": "// Ivan a cerut asta\nexport const X = 1;\n" });
  expect(checkPrivacy(root, NAMES).problems).toEqual([]);
});

test("P3-320: a phone or an email in the fixtures that could belong to someone fails", () => {
  expect(contactShapeProblems('const p = "+373 00 000 101"; const e = "ana@nord.example";')).toEqual([]);
  expect(contactShapeProblems('const p = "+373 69 123 456";').join("\n")).toContain("nu are forma +373 00 000 NNN");
  expect(contactShapeProblems('const e = "ana@gmail.com";').join("\n")).toContain("nu se termina in .example");
  const root = fakeRepo({ "scripts/guide/fixtures.mjs": 'export const PHONE = "+37369123456";\n' });
  expect(checkPrivacy(root, NAMES).problems.join("\n")).toContain("telefonul");
});

test("P3-320: the deny list reader skips blank lines and notes", () => {
  expect(parseDenyList("# nota\n\n  Ivan  \n#Andre\nMihai\n")).toEqual(["Ivan", "Mihai"]);
});
