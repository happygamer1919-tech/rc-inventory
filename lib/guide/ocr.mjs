// P3-339. Citirea pixelilor pozelor din ghid.
//
// checkPrivacy (privacy.mjs) compara lista de nume cu textul pe care scriptul de poze l-a
// raportat singur. Nimic nu citea poza. Aici, textul scos din poza prin OCR (tesseract.js,
// romana si engleza, in scripts/poc-free/check-guide-ocr.mjs) trece prin doua verificari:
//   - un nume din docs/guide/real-names.txt in poza = EROARE (verificarea pica);
//   - un cuvant care arata a nume (litera mare, apoi litere mici) si nu este nici in datele
//     inventate, nici in etichetele aplicatiei = AVERTISMENT (apare in rezumatul job-ului).
//
// Functiile de aici nu ating reteaua si nu pornesc OCR: primesc textul deja citit, ca testul
// sa le poata proba fara tesseract.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { findNames, fold, stringLiterals, stripJsComments } from "./privacy.mjs";

const NAME_LIKE = /(?<![\p{L}\p{N}])\p{Lu}\p{Ll}{3,}(?![\p{L}\p{N}])/gu;

/** Amprenta sha256 a unui fisier (cheia memoriei OCR: poza neschimbata nu se citeste din nou). */
export function sha256Of(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/** Cuvintele care arata a nume, fara diacritice si fara dubluri. */
export function nameLikeWords(text) {
  return [...new Set([...String(text).matchAll(NAME_LIKE)].map((m) => fold(m[0])))];
}

/** Toate cuvintele unui text (litere), fara diacritice, ca multime. */
function wordSet(text) {
  return new Set(fold(text).match(/[\p{L}\p{N}]+/gu) ?? []);
}

function walk(dir, files) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

/**
 * Cuvintele permise in orice poza: datele inventate din scripts/guide/fixtures.mjs, lectiile
 * din content/guide/ si lista docs/guide/ocr-allow.txt (etichete ale aplicatiei, un cuvant sau
 * mai multe pe rand). Etichetele de pe ecran ale fiecarei poze se adauga separat, din manifest.
 */
export function globalAllowedWords(root) {
  const words = new Set();
  const fixtures = join(root, "scripts/guide/fixtures.mjs");
  if (existsSync(fixtures)) {
    for (const lit of stringLiterals(stripJsComments(readFileSync(fixtures, "utf8")))) {
      for (const w of wordSet(lit)) words.add(w);
    }
  }
  const content = join(root, "content/guide");
  if (existsSync(content)) {
    for (const f of walk(content, [])) {
      if (f.endsWith(".md")) for (const w of wordSet(readFileSync(f, "utf8"))) words.add(w);
    }
  }
  const allow = join(root, "docs/guide/ocr-allow.txt");
  if (existsSync(allow)) {
    const lines = readFileSync(allow, "utf8").split(/\r?\n/).filter((l) => l.trim() !== "" && !l.trim().startsWith("#"));
    for (const w of wordSet(lines.join("\n"))) words.add(w);
  }
  return words;
}

/**
 * Verdictul pentru o poza.
 *   ocrText      textul citit din pixeli
 *   denyNames    liniile din docs/guide/real-names.txt
 *   allowedWords multimea globala (globalAllowedWords)
 *   screenText   textul de pe ecran raportat de scriptul de poze pentru aceasta poza
 * Intoarce { denied: [nume], unknown: [cuvant] }.
 */
export function judgePicture({ ocrText, denyNames, allowedWords, screenText = "" }) {
  const denied = [...new Set(findNames(ocrText, denyNames).map((h) => h.name))];
  const screen = wordSet(screenText);
  const unknown = nameLikeWords(ocrText).filter((w) => !allowedWords.has(w) && !screen.has(w));
  return { denied, unknown };
}
