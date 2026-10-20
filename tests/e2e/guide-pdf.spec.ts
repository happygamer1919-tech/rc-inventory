import { test, expect } from "@playwright/test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadFaq } from "../../lib/guide/faq.mjs";
import { loadGuide } from "../../lib/guide/parse.mjs";
import { PDF_FILE, buildGuidePdf, guideSourceHash, hashFiles, lessonIdsForRole, readPdfSourceHash, renderGuidePdf } from "../../lib/guide/pdf.mjs";
import { guideForRole } from "../../lib/guide/view.mjs";

// P3-324, P3-328. PDF-ul ghidului este tiparit la cerere din aceeasi sursa ca paginile /ajutor,
// pentru rolul celui conectat. Testul citeste fisiere: nu deschide niciun browser si nu atinge
// nicio baza de date. Ruta /api/guide/pdf si refuzul fara sesiune sunt in guide-files.spec.ts.

const REPO = join(__dirname, "..", "..");
const GUIDE_DIR = join(REPO, "content/guide");

function pageCount(file: string): number {
  const text = readFileSync(file).toString("latin1");
  const m = /\/Type \/Pages[\s\S]{0,200}?\/Count (\d+)/.exec(text);
  return m ? Number(m[1]) : 0;
}

function tmpPdf(): string {
  return join(mkdtempSync(join(tmpdir(), "guide-pdf-")), "ghid.pdf");
}

/** Lectiile unui rol, citite direct din fisiere (nu cu functia pe care o probeaza testul). */
function lessonsOf(role: string) {
  const guide = loadGuide(GUIDE_DIR);
  return guide.lessons.filter((l) => (l.roles as string[]).includes(role));
}

function chaptersOf(role: string): number {
  return new Set(lessonsOf(role).map((l) => l.chapter)).size;
}

test("P3-328: the PDF is no longer a file anyone can fetch from public/", () => {
  expect(existsSync(join(REPO, "public", "guide"))).toBe(false);
  expect(PDF_FILE).toBe(join(REPO, "out", "ghid-rapid-construct.pdf"));
});

test("P3-324: the owner's PDF has the same fingerprint when printed again and one page per lesson", async () => {
  const guide = loadGuide(GUIDE_DIR);
  const faq = loadFaq(join(GUIDE_DIR, "faq.md"));
  expect(guide.lessons.length).toBeGreaterThanOrEqual(20);
  expect(faq.entries.length).toBeGreaterThanOrEqual(7);

  const out = tmpPdf();
  const hash = await buildGuidePdf(out, "owner");
  expect(hash).toBe(guideSourceHash("owner"));
  expect(readPdfSourceHash(out)).toBe(hash);
  // Coperta, cuprinsul, o pagina pe capitol, una pe lectie, cel putin una pentru intrebari.
  expect(pageCount(out)).toBeGreaterThanOrEqual(2 + chaptersOf("owner") + lessonsOf("owner").length + 1);
  // Aceeasi sursa, acelasi fisier.
  const again = tmpPdf();
  await buildGuidePdf(again, "owner");
  expect(readFileSync(again).equals(readFileSync(out))).toBe(true);
});

test("P3-328: the account manager's PDF holds only the lessons that role sees, the owner's holds all", async () => {
  const owner = lessonsOf("owner");
  const manager = lessonsOf("account_manager");
  const ownerOnly = owner.filter((l) => !(l.roles as string[]).includes("account_manager"));
  // Fara o lectie numai pentru administrator testul n-ar proba nimic.
  expect(ownerOnly.length).toBeGreaterThan(0);

  // Lectiile din PDF sunt exact cele de pe paginile /ajutor ale rolului.
  const managerIds = lessonIdsForRole("account_manager");
  expect(managerIds.sort()).toEqual(manager.map((l) => l.id as string).sort());
  for (const l of ownerOnly) expect(managerIds, `${l.id} nu are ce cauta in PDF-ul operatorului`).not.toContain(l.id);
  expect(lessonIdsForRole("owner").sort()).toEqual(owner.map((l) => l.id as string).sort());

  const asManager = await renderGuidePdf("account_manager");
  const asOwner = await renderGuidePdf("owner");
  expect(asManager.pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");

  const managerFile = tmpPdf();
  const ownerFile = tmpPdf();
  writeFileSync(managerFile, asManager.pdf);
  writeFileSync(ownerFile, asOwner.pdf);
  expect(pageCount(managerFile)).toBeGreaterThanOrEqual(2 + chaptersOf("account_manager") + manager.length + 1);
  // O pagina pe lectie: PDF-ul administratorului are cel putin tot atatea pagini in plus cat lectii numai ale lui.
  expect(pageCount(ownerFile) - pageCount(managerFile)).toBeGreaterThanOrEqual(ownerOnly.length);
  // Amprente diferite si fiecare pe rolul ei.
  expect(asManager.hash).toBe(guideSourceHash("account_manager"));
  expect(asOwner.hash).toBe(guideSourceHash("owner"));
  expect(asManager.hash).not.toBe(asOwner.hash);
  expect(readPdfSourceHash(managerFile)).toBe(asManager.hash);
});

test("P3-328 control: a role the guide does not know gets no lessons and no PDF", async () => {
  expect(lessonIdsForRole("necunoscut")).toEqual([]);
  expect(guideForRole(loadGuide(GUIDE_DIR), "necunoscut").flat).toEqual([]);
  await expect(renderGuidePdf("necunoscut")).rejects.toThrow("nicio lectie de tiparit");
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
  expect(readPdfSourceHash(old)).not.toBe(guideSourceHash("owner"));
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
