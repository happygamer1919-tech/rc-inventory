#!/usr/bin/env node
// check-guide-ocr.mjs
// Card P3-339. Pozele ghidului sunt citite din pixeli, nu din textul raportat de script.
//
// Fiecare PNG din content/guide-images/ trece prin OCR (tesseract.js, romana + engleza).
// Pica (exit 1) daca textul citit contine un nume din docs/guide/real-names.txt. Un cuvant
// care arata a nume si nu este nici in datele inventate, nici in etichetele aplicatiei
// ajunge ca avertisment in rezumatul job-ului (nu pica). Rezultatul se tine pe amprenta
// sha256 a pozei in .cache/guide-ocr/ (job-ul pastreaza directorul intre rulari), deci o
// poza neschimbata nu se mai citeste. Regulile stau in lib/guide/ocr.mjs.
//
// Nu citeste nicio baza de date. Singura retea: descarcarea o singura data a datelor de
// limba tesseract (apoi sunt in .cache/guide-ocr/lang).

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { globalAllowedWords, judgePicture, sha256Of } from "../../lib/guide/ocr.mjs";
import { parseDenyList } from "../../lib/guide/privacy.mjs";

// GUIDE_OCR_ROOT lets tests/e2e/guide-privacy.spec.ts point the check at a small repo it builds.
const ROOT = process.env.GUIDE_OCR_ROOT
  ? resolve(process.env.GUIDE_OCR_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const IMAGES = join(ROOT, "content/guide-images");
const CACHE = process.env.GUIDE_OCR_CACHE ? resolve(process.env.GUIDE_OCR_CACHE) : join(ROOT, ".cache/guide-ocr");

console.log("check-guide-ocr");
const listPath = join(ROOT, "docs/guide/real-names.txt");
if (!existsSync(listPath)) {
  console.error("check-guide-ocr: docs/guide/real-names.txt lipseste. Fara lista nu se poate verifica nimic.");
  process.exit(2);
}
const denyNames = parseDenyList(readFileSync(listPath, "utf8"));
if (denyNames.length === 0) {
  console.error("check-guide-ocr: lista docs/guide/real-names.txt nu are niciun nume.");
  process.exit(2);
}
const pictures = existsSync(IMAGES) ? readdirSync(IMAGES).filter((n) => n.toLowerCase().endsWith(".png")).sort() : [];
if (pictures.length === 0) {
  console.error("check-guide-ocr: niciun PNG in content/guide-images/. O verificare care citeste zero poze nu gaseste nimic.");
  process.exit(2);
}

const screenTexts = new Map();
try {
  const manifest = JSON.parse(readFileSync(join(ROOT, "docs/guide/screenshots.json"), "utf8"));
  for (const e of manifest.images ?? []) if (typeof e?.file === "string") screenTexts.set(e.file, String(e.text ?? ""));
} catch {
  console.log("  docs/guide/screenshots.json nu a putut fi citit: etichetele de pe ecran nu se folosesc");
}

mkdirSync(CACHE, { recursive: true });
let worker = null;
async function readPicture(buffer, sha) {
  const file = join(CACHE, `${sha}.txt`);
  if (existsSync(file)) return { text: readFileSync(file, "utf8"), cached: true };
  if (!worker) {
    const { createWorker } = await import("tesseract.js");
    const langDir = join(CACHE, "lang");
    mkdirSync(langDir, { recursive: true });
    worker = await createWorker(["ron", "eng"], 1, { cachePath: langDir });
  }
  const { data } = await worker.recognize(buffer);
  writeFileSync(file, data.text);
  return { text: data.text, cached: false };
}

const allowed = globalAllowedWords(ROOT);
const errors = [];
const warnings = [];
let reread = 0;
let fromCache = 0;
for (const name of pictures) {
  const rel = `content/guide-images/${name}`;
  const buffer = readFileSync(join(IMAGES, name));
  let result;
  try {
    result = await readPicture(buffer, sha256Of(buffer));
  } catch (e) {
    errors.push(`${rel}: OCR a esuat (${e instanceof Error ? e.message : e}); poza nu a putut fi verificata`);
    continue;
  }
  if (result.cached) fromCache++;
  else reread++;
  const verdict = judgePicture({
    ocrText: result.text,
    denyNames,
    allowedWords: allowed,
    screenText: screenTexts.get(rel) ?? "",
  });
  for (const n of verdict.denied) errors.push(`${rel}: in poza apare "${n}", care este pe lista docs/guide/real-names.txt`);
  if (verdict.unknown.length > 0) warnings.push(`${rel}: nume necunoscute in poza: ${verdict.unknown.join(", ")}`);
}
if (worker) await worker.terminate();

console.log(`  poze ${pictures.length}, citite acum ${reread}, din memorie ${fromCache}, nume pe lista ${denyNames.length}`);
for (const w of warnings) console.log(`::warning::${w}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    "### Pozele ghidului citite prin OCR",
    "",
    `Poze: ${pictures.length} (citite acum ${reread}, din memorie ${fromCache}). Erori: ${errors.length}. Avertismente: ${warnings.length}.`,
    "",
  ];
  if (errors.length > 0) lines.push("**Erori (nume de pe lista):**", "", ...errors.map((e) => `- ${e}`), "");
  if (warnings.length > 0) {
    lines.push(
      "**Nume necunoscute** (cuvinte cu litera mare care nu sunt in datele inventate sau in etichetele aplicatiei; verificati poza, apoi adaugati cuvantul in docs/guide/ocr-allow.txt sau numele real in docs/guide/real-names.txt):",
      "",
      ...warnings.map((w) => `- ${w}`),
      "",
    );
  }
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
}

if (errors.length > 0) {
  for (const e of errors) console.error(`  ${e}`);
  console.error(`check-guide-ocr: ${errors.length} probleme`);
  process.exit(1);
}
console.log(`check-guide-ocr: ok (${warnings.length} avertismente)`);
