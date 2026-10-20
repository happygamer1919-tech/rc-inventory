// P3-324. PDF-ul ghidului, tiparit din aceeasi sursa ca paginile /ajutor: content/guide
// (lectii, capitole, intrebari frecvente) si pozele de desktop din content/guide-images.
// Nimic nu se scrie de doua ori: aici nu exista niciun text de lectie.
//
// Aceeasi unealta ca factura (lib/pdf/invoice-pdf.ts, P3-272): pdfkit, JavaScript pur, cu
// fontul DejaVu Sans Condensed din repo, care are ș, ț, ă, â, î. Fara browser, fara retea.
//
// PROASPAT, NU "MAI NOU DUPA DATA". La checkout git pune aceeasi ora pe toate fisierele,
// deci o comparatie de date nu spune nimic in CI. In schimb PDF-ul poarta in metadate
// (campul Keywords) amprenta SHA-256 a tot ce intra in el: fisierele din content/guide,
// pozele de desktop, fonturile si acest fisier. Testul recalculeaza amprenta si cade
// daca PDF-ul din repo nu are exact amprenta de azi: orice lectie, poza sau regula de
// asezare schimbata cere un PDF nou (`npm run guide:pdf`).
//
// Fisier .mjs fara Next: il ruleaza `npm run guide:pdf` si il importa testul Playwright.

import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import PDFDocument from "pdfkit";
import { faqForRole, loadFaq } from "./faq.mjs";
import { loadGuide } from "./parse.mjs";
import { guideForRole, readPngSize, splitBold } from "./view.mjs";

// Din dosarul de lucru (radacina depozitului), ca lib/guide/read.ts: fara import.meta, ca sa
// poata fi incarcat si de testul Playwright, care transpileaza fisierele .mjs.
const ROOT = process.cwd();
const SELF = join(ROOT, "lib", "guide", "pdf.mjs");

// P3-328. PDF-ul nu mai e un fisier din repo si nu mai sta in public/: ruta /api/guide/pdf il
// tipareste la cerere, pentru rolul celui conectat. `npm run guide:pdf` scrie o copie locala
// in out/ (ignorat de git), pentru administrator.
export const PDF_FILE = join(ROOT, "out", "ghid-rapid-construct.pdf");
const GUIDE_DIR = join(ROOT, "content", "guide");
const PICTURES_DIR = join(ROOT, "content", "guide-images");
const FONT_REGULAR = join(ROOT, "lib", "pdf", "fonts", "DejaVuSansCondensed.ttf");
const FONT_BOLD = join(ROOT, "lib", "pdf", "fonts", "DejaVuSansCondensed-Bold.ttf");

const HASH_PREFIX = "source-hash:";

// Aceleasi culori ca factura PDF: negru, gri, portocaliul platformei.
const INK = "#1a1a1a";
const MUTED = "#666666";
const LINE = "#d6d6d6";
const SOFT = "#f3f3f3";
const ORANGE = "#f47c1f";

const MARGIN = 50;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const BODY_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const MAX_PICTURE_HEIGHT = 300;

/** Fisierele .md dintr-un dosar si subdosarele lui, in ordine alfabetica, cu cai relative. */
function mdFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...mdFiles(full));
    else if (name.endsWith(".md")) out.push(full);
  }
  return out;
}

/** Pozele de desktop pe care le pune PDF-ul: prima poza a fiecarei lectii, daca exista pe disc. */
function pictureFiles(guide) {
  const files = [];
  for (const lesson of guide.lessons) {
    const id = Array.isArray(lesson.screenshots) ? lesson.screenshots[0] : undefined;
    if (typeof id !== "string" || id === "") continue;
    const file = join(PICTURES_DIR, `${id}-desktop.png`);
    if (existsSync(file)) files.push(file);
  }
  return files;
}

/**
 * Amprenta a tot ce intra in PDF. Cale + continut pentru fiecare fisier, in ordine fixa,
 * deci aceeasi sursa da mereu aceeasi amprenta, pe orice masina.
 */
export function guideSourceHash(role = "owner") {
  const guide = loadGuide(GUIDE_DIR);
  const { flat } = guideForRole(guide, role);
  const files = [
    ...mdFiles(GUIDE_DIR),
    ...pictureFiles({ lessons: flat.map((e) => e.lesson) }),
    FONT_REGULAR,
    FONT_BOLD,
    SELF,
  ];
  // Rolul intra in amprenta: PDF-ul operatorului nu are voie sa poarte amprenta celui al administratorului.
  return createHash("sha256").update(`role:${role}\0`).update(hashFiles(ROOT, files)).digest("hex");
}

/** Amprenta unei liste de fisiere: calea relativa la `root` si continutul fiecaruia, in ordinea data. */
export function hashFiles(root, files) {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(relative(root, file).split("\\").join("/"));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

/**
 * Amprenta scrisa in PDF-ul de pe disc, sau null daca fisierul lipseste ori nu are una.
 * pdfkit pune Keywords intr-un obiect propriu, ca sir simplu: (source-hash:<64 hex>).
 */
export function readPdfSourceHash(file = PDF_FILE) {
  if (!existsSync(file)) return null;
  const text = readFileSync(file).toString("latin1");
  const m = new RegExp(`\\(${HASH_PREFIX}([0-9a-f]{64})\\)`).exec(text);
  return m ? m[1] : null;
}

/** Textul unui pas, cu ce e intre ** scris ingrosat. Pozitia (x, y) o da primul bucata. */
function writeRich(doc, text, x, y, width, size, color) {
  const parts = splitBold(text);
  if (parts.length === 0) return;
  parts.forEach((part, i) => {
    doc.font(part.bold ? "bold" : "regular").fontSize(size).fillColor(color);
    const options = { continued: i < parts.length - 1, width };
    if (i === 0) doc.text(part.text, x, y, options);
    else doc.text(part.text, options);
  });
}

/** Cat ocupa un text cu bucati ingrosate, fara sa-l scrie. */
function richHeight(doc, text, width, size) {
  doc.font("regular").fontSize(size);
  return doc.heightOfString(text.replace(/\*\*/g, ""), { width });
}

function ensureRoom(doc, needed) {
  if (doc.y + needed > PAGE_HEIGHT - MARGIN - 20) doc.addPage();
}

function drawPicture(doc, lesson) {
  const id = Array.isArray(lesson.screenshots) ? lesson.screenshots[0] : undefined;
  const file = typeof id === "string" && id !== "" ? join(PICTURES_DIR, `${id}-desktop.png`) : null;
  const size = file ? readPngSize(file) : null;
  if (!file || !size) {
    // Ca pe pagina: un card mic, niciodata o imagine rupta.
    ensureRoom(doc, 44);
    const y = doc.y + 6;
    doc.roundedRect(MARGIN, y, BODY_WIDTH, 34, 4).fillAndStroke(SOFT, LINE);
    doc.font("regular").fontSize(9.5).fillColor(MUTED).text("fără imagine", MARGIN, y + 11, {
      width: BODY_WIDTH,
      align: "center",
    });
    doc.y = y + 44;
    return;
  }
  let width = BODY_WIDTH;
  let height = (size.height * width) / size.width;
  if (height > MAX_PICTURE_HEIGHT) {
    height = MAX_PICTURE_HEIGHT;
    width = (size.width * height) / size.height;
  }
  ensureRoom(doc, height + 14);
  const y = doc.y + 6;
  doc.image(file, MARGIN, y, { width, height });
  doc.rect(MARGIN, y, width, height).lineWidth(0.5).stroke(LINE);
  doc.y = y + height + 10;
}

function drawLesson(doc, entry, lessonsById) {
  const { lesson, chapterTitle } = entry;
  doc.addPage();
  doc.font("regular").fontSize(8.5).fillColor(ORANGE).text(chapterTitle.toUpperCase(), MARGIN, MARGIN, {
    width: BODY_WIDTH,
  });
  doc.moveDown(0.3);
  doc.font("bold").fontSize(18).fillColor(INK).text(lesson.title, MARGIN, doc.y, { width: BODY_WIDTH });
  doc.moveDown(0.4);
  if (lesson.body) {
    doc.font("regular").fontSize(10).fillColor(MUTED).text(lesson.body, MARGIN, doc.y, { width: BODY_WIDTH });
    doc.moveDown(0.6);
  }
  const steps = Array.isArray(lesson.steps) ? lesson.steps : [];
  steps.forEach((step, i) => {
    const textWidth = BODY_WIDTH - 24;
    ensureRoom(doc, richHeight(doc, String(step), textWidth, 10.5) + 8);
    const y = doc.y;
    doc.font("bold").fontSize(10.5).fillColor(ORANGE).text(`${i + 1}.`, MARGIN, y, { width: 20 });
    writeRich(doc, String(step), MARGIN + 24, y, textWidth, 10.5, INK);
    doc.y = Math.max(doc.y, y) + 5;
  });
  drawPicture(doc, lesson);
  const related = (Array.isArray(lesson.see_also) ? lesson.see_also : [])
    .map((id) => lessonsById.get(id))
    .filter(Boolean);
  if (related.length > 0) {
    ensureRoom(doc, 30);
    doc.moveDown(0.3);
    doc.font("bold").fontSize(9.5).fillColor(INK).text("Vezi și: ", MARGIN, doc.y, {
      continued: true,
      width: BODY_WIDTH,
    });
    doc.font("regular").fillColor(MUTED).text(related.map((l) => l.title).join("; "), { width: BODY_WIDTH });
  }
}

/**
 * Lectiile unui rol: PDF-ul are exact ce vede rolul pe paginile /ajutor (guideForRole, aceeasi
 * functie), deci o lectie numai pentru administrator nu ajunge in PDF-ul operatorului.
 */
export function lessonIdsForRole(role) {
  const guide = loadGuide(GUIDE_DIR);
  return guideForRole(guide, role).flat.map((e) => e.lesson.id);
}

/** Pregateste documentul PDF al ghidului pentru `role`: scris complet, dar neinchis (`doc.end()` il cheama apelantul). */
function startGuidePdf(role) {
  const guide = loadGuide(GUIDE_DIR);
  if (guide.problems.length > 0) throw new Error(`ghidul nu se poate citi: ${guide.problems.join("; ")}`);
  const faqAll = loadFaq(join(GUIDE_DIR, "faq.md"));
  if (faqAll.problems.length > 0) throw new Error(`faq.md nu se poate citi: ${faqAll.problems.join("; ")}`);
  const { chapters, flat } = guideForRole(guide, role);
  if (flat.length === 0) throw new Error("nicio lectie de tiparit");
  const faq = { title: faqAll.title, entries: faqForRole(faqAll, flat) };
  const lessonsById = new Map(flat.map((e) => [e.lesson.id, e.lesson]));
  const hash = guideSourceHash(role);

  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    bufferPages: true,
    info: {
      Title: "Ghidul platformei Rapid Construct",
      Author: "Rapid Construct",
      Keywords: `${HASH_PREFIX}${hash}`,
      // Data fixa: acelasi continut da acelasi fisier.
      CreationDate: new Date(0),
      ModDate: new Date(0),
    },
  });
  doc.registerFont("regular", readFileSync(FONT_REGULAR));
  doc.registerFont("bold", readFileSync(FONT_BOLD));

  // Coperta.
  doc.font("bold").fontSize(28).fillColor(INK).text("Ghidul platformei", MARGIN, 240, { width: BODY_WIDTH });
  doc.fillColor(ORANGE).text("Rapid Construct", MARGIN, doc.y, { width: BODY_WIDTH });
  doc.moveDown(0.8);
  doc.font("regular").fontSize(12).fillColor(MUTED).text(
    `${flat.length} lecții în ${chapters.length} capitole, urmate de întrebările frecvente. Fiecare lecție are o singură sarcină, pași numerotați și o imagine.`,
    MARGIN,
    doc.y,
    { width: BODY_WIDTH },
  );

  // Cuprins.
  doc.addPage();
  doc.font("bold").fontSize(18).fillColor(INK).text("Cuprins", MARGIN, MARGIN, { width: BODY_WIDTH });
  doc.moveDown(0.6);
  for (const chapter of chapters) {
    ensureRoom(doc, 40);
    doc.font("bold").fontSize(11.5).fillColor(ORANGE).text(chapter.title, MARGIN, doc.y, { width: BODY_WIDTH });
    doc.moveDown(0.2);
    for (const lesson of chapter.lessons) {
      ensureRoom(doc, 16);
      doc.font("regular").fontSize(9.5).fillColor(INK).text(lesson.title, MARGIN + 12, doc.y, {
        width: BODY_WIDTH - 12,
      });
    }
    doc.moveDown(0.6);
  }
  ensureRoom(doc, 20);
  doc.font("bold").fontSize(11.5).fillColor(ORANGE).text("Întrebări frecvente", MARGIN, doc.y, { width: BODY_WIDTH });

  // Capitole si lectii.
  for (const chapter of chapters) {
    doc.addPage();
    doc.font("bold").fontSize(24).fillColor(INK).text(chapter.title, MARGIN, 220, { width: BODY_WIDTH });
    if (chapter.summary) {
      doc.moveDown(0.6);
      doc.font("regular").fontSize(12).fillColor(MUTED).text(chapter.summary, MARGIN, doc.y, { width: BODY_WIDTH });
    }
    for (const lesson of chapter.lessons) {
      drawLesson(doc, { lesson, chapterTitle: chapter.title }, lessonsById);
    }
  }

  // Intrebari frecvente, cu titlul lectiei la care trimit.
  doc.addPage();
  doc.font("bold").fontSize(24).fillColor(INK).text(faq.title ?? "Întrebări frecvente", MARGIN, MARGIN, {
    width: BODY_WIDTH,
  });
  doc.moveDown(0.8);
  for (const entry of faq.entries) {
    const lesson = lessonsById.get(entry.lesson);
    ensureRoom(doc, 90);
    doc.font("bold").fontSize(11.5).fillColor(INK).text(entry.question, MARGIN, doc.y, { width: BODY_WIDTH });
    doc.moveDown(0.25);
    writeRich(doc, entry.answer, MARGIN, doc.y, BODY_WIDTH, 10, INK);
    if (lesson) {
      doc.moveDown(0.2);
      doc.font("regular").fontSize(9).fillColor(MUTED).text(`Lecția: ${lesson.title}`, MARGIN, doc.y, {
        width: BODY_WIDTH,
      });
    }
    doc.moveDown(0.9);
  }

  // Numarul paginii, jos. Marginea de jos se coboara la 0 cat se scrie, ca textul din ea
  // sa nu deschida o pagina noua.
  const range = doc.bufferedPageRange();
  for (let i = 1; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("regular").fontSize(8.5).fillColor(MUTED).text(`${i + 1}`, MARGIN, PAGE_HEIGHT - 32, {
      width: BODY_WIDTH,
      align: "center",
      lineBreak: false,
    });
    doc.page.margins.bottom = bottom;
  }

  return { doc, hash };
}

/** PDF-ul ghidului pentru `role`, in memorie. Ruta /api/guide/pdf il cheama cu rolul din sesiune. */
export function renderGuidePdf(role) {
  const chunks = [];
  return new Promise((resolvePromise, reject) => {
    // In executor: o eroare la citirea ghidului devine o promisiune respinsa, nu o exceptie in apelant.
    const { doc, hash } = startGuidePdf(role);
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolvePromise({ pdf: Buffer.concat(chunks), hash }));
    doc.on("error", reject);
    doc.end();
  });
}

/** Scrie PDF-ul ghidului pentru `role` in `outFile`. Intoarce amprenta scrisa in el. */
export function buildGuidePdf(outFile = PDF_FILE, role = "owner") {
  const { doc, hash } = startGuidePdf(role);
  mkdirSync(dirname(outFile), { recursive: true });
  const stream = createWriteStream(outFile);
  doc.pipe(stream);
  doc.end();
  return new Promise((resolvePromise, reject) => {
    stream.on("finish", () => resolvePromise(hash));
    stream.on("error", reject);
  });
}
