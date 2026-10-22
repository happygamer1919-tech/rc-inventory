import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const PIC = "content/guide-images/a-desktop.png";
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

/** Manifestul unei poze a carei intrare se potriveste cu fisierul. */
function manifestJson(over: Record<string, unknown> = {}): string {
  return JSON.stringify({ images: [{ id: "a", file: PIC, sha256: sha("PNG-A"), text: "Autentificare Email Parolă", ...over }] }, null, 2);
}

function fakeRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "guide-privacy-"));
  const all: Record<string, string> = {
    "scripts/guide/fixtures.mjs": 'export const CLIENT = "TEST Construct Nord SRL";\nexport const PHONE = "+373 00 000 101";\n',
    "content/guide/stoc/produs-nou.md": "---\nid: produs-nou\n---\n\nUn text.\n",
    [PIC]: "PNG-A",
    "docs/guide/screenshots.json": manifestJson(),
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
  const root = fakeRepo({ "docs/guide/screenshots.json": manifestJson({ text: "Clienți Firma Reala SRL Activ" }) });
  expect(checkPrivacy(root, NAMES).problems.join("\n")).toMatch(/docs\/guide\/screenshots\.json:\d+: apare "Firma Reală SRL"/);
});

test("P3-333: a missing manifest fails", () => {
  const root = fakeRepo({});
  rmSync(join(root, "docs/guide/screenshots.json"));
  expect(checkPrivacy(root, NAMES).problems.join("\n")).toContain("docs/guide/screenshots.json lipseste");
});

test("P3-333: a manifest that is not valid JSON fails", () => {
  const root = fakeRepo({ "docs/guide/screenshots.json": "{ nu e json" });
  expect(checkPrivacy(root, NAMES).problems.join("\n")).toContain("nu este JSON valid");
});

test("P3-333: a picture with no manifest entry fails", () => {
  const root = fakeRepo({ "content/guide-images/b-mobile.png": "PNG-B" });
  expect(checkPrivacy(root, NAMES).problems.join("\n")).toContain("content/guide-images/b-mobile.png: poza nu are intrare");
});

test("P3-333: a picture changed after its entry was written fails", () => {
  const root = fakeRepo({ [PIC]: "PNG-A-RETUSAT" });
  expect(checkPrivacy(root, NAMES).problems.join("\n")).toContain(`${PIC}: poza este mai noua decat intrarea`);
});

test("P3-333: an entry with no captured text fails", () => {
  const root = fakeRepo({ "docs/guide/screenshots.json": manifestJson({ text: "  " }) });
  expect(checkPrivacy(root, NAMES).problems.join("\n")).toContain("nu are textul de pe ecran");
});

test("P3-333: an entry whose picture file is gone fails", () => {
  const root = fakeRepo({});
  rmSync(join(root, PIC));
  expect(checkPrivacy(root, NAMES).problems.join("\n")).toContain("nu are fisier");
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
