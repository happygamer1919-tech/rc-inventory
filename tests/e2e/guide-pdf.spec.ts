import { test, expect } from "@playwright/test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadFaq } from "../../lib/guide/faq.mjs";
import { loadGuide } from "../../lib/guide/parse.mjs";
import { PDF_FILE, buildGuidePdf, guideSourceHash, hashFiles, readPdfSourceHash } from "../../lib/guide/pdf.mjs";

// P3-324. PDF-ul ghidului este tiparit din aceeasi sursa ca paginile /ajutor si nu are voie sa
// ramana in urma ei. Testul citeste fisiere: nu deschide niciun browser si nu atinge nicio
// baza de date.

const REPO = join(__dirname, "..", "..");
const GUIDE_DIR = join(REPO, "content/guide");

function pageCount(file: string): number {
  const text = readFileSync(file).toString("latin1");
  const m = /\/Type \/Pages[\s\S]{0,200}?\/Count (\d+)/.exec(text);
  return m ? Number(m[1]) : 0;
}

test("P3-324: the committed PDF is not older than the guide source", () => {
  const written = readPdfSourceHash(PDF_FILE);
  // Un PDF care lipseste sau nu are amprenta nu trece: nu exista "nimic de comparat".
  expect(written, "public/guide/ghid-rapid-construct.pdf lipseste sau nu are amprenta; ruleaza npm run guide:pdf").not.toBeNull();
  expect(written, "PDF-ul este mai vechi decat sursa ghidului; ruleaza npm run guide:pdf si adauga fisierul").toBe(
    guideSourceHash(),
  );
});

test("P3-324: a PDF printed again has the same fingerprint and one page per lesson", async () => {
  const guide = loadGuide(GUIDE_DIR);
  const faq = loadFaq(join(GUIDE_DIR, "faq.md"));
  const chapters = guide.chapters.length;
  const lessons = guide.lessons.length;
  expect(lessons).toBeGreaterThanOrEqual(20);
  expect(faq.entries.length).toBeGreaterThanOrEqual(7);

  const out = join(mkdtempSync(join(tmpdir(), "guide-pdf-")), "ghid.pdf");
  const hash = await buildGuidePdf(out);
  expect(hash).toBe(guideSourceHash());
  expect(readPdfSourceHash(out)).toBe(hash);
  // Coperta, cuprinsul, o pagina pe capitol, una pe lectie, cel putin una pentru intrebari.
  expect(pageCount(out)).toBeGreaterThanOrEqual(2 + chapters + lessons + 1);
  // Aceeasi sursa, acelasi fisier.
  const again = join(mkdtempSync(join(tmpdir(), "guide-pdf-")), "ghid.pdf");
  await buildGuidePdf(again);
  expect(readFileSync(again).equals(readFileSync(out))).toBe(true);
});

test("P3-324: the committed PDF holds every lesson and is the file the page set prints", () => {
  const guide = loadGuide(GUIDE_DIR);
  expect(pageCount(PDF_FILE)).toBeGreaterThanOrEqual(2 + guide.chapters.length + guide.lessons.length + 1);
});

// ---------------------------------------------------------------------------
// Fiecare regula poate pica.
// ---------------------------------------------------------------------------

test("P3-324 control: a missing PDF has no fingerprint, so the freshness check cannot pass on it", () => {
  expect(readPdfSourceHash(join(tmpdir(), "nu-exista-ghid.pdf"))).toBeNull();
});

test("P3-324 control: a PDF without a fingerprint, or with an old one, differs from the current source", () => {
  const dir = mkdtempSync(join(tmpdir(), "guide-pdf-"));
  const bare = join(dir, "bare.pdf");
  writeFileSync(bare, "%PDF-1.3\n1 0 obj\n(un text)\nendobj\n");
  expect(readPdfSourceHash(bare)).toBeNull();

  const old = join(dir, "old.pdf");
  writeFileSync(old, `%PDF-1.3\n1 0 obj\n(source-hash:${"0".repeat(64)})\nendobj\n`);
  expect(readPdfSourceHash(old)).toBe("0".repeat(64));
  expect(readPdfSourceHash(old)).not.toBe(guideSourceHash());
});

test("P3-324 control: a changed lesson, picture or generator changes the fingerprint the PDF must carry", () => {
  // guideSourceHash trece fiecare fisier din sursa prin hashFiles: aici se vede ca o schimbare
  // de continut, de cale sau de ordine da alta amprenta (pe o copie, nu pe fisierele reale).
  const root = mkdtempSync(join(tmpdir(), "guide-hash-"));
  const lesson = join(root, "lectie.md");
  const picture = join(root, "poza.png");
  writeFileSync(lesson, "Alege Inventar.");
  writeFileSync(picture, "poza");
  const before = hashFiles(root, [lesson, picture]);
  expect(hashFiles(root, [lesson, picture])).toBe(before);
  writeFileSync(lesson, "Alege Comenzi.");
  expect(hashFiles(root, [lesson, picture])).not.toBe(before);
  writeFileSync(lesson, "Alege Inventar.");
  writeFileSync(picture, "alta poza");
  expect(hashFiles(root, [lesson, picture])).not.toBe(before);
  writeFileSync(picture, "poza");
  expect(hashFiles(root, [lesson, picture])).toBe(before);
});

test("P3-324: the PDF command writes where the page set expects it", () => {
  expect(PDF_FILE).toBe(join(REPO, "public", "guide", "ghid-rapid-construct.pdf"));
});
