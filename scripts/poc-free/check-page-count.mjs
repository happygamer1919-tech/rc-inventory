#!/usr/bin/env node
// check-page-count.mjs
// Card EXT-28. NUMARATORUL DE PAGINI, PE FISIERE AL CAROR RASPUNS IL STIM.
//
// CE DOVEDESTE, IN ORDINEA CARDULUI:
//
//   1. cele doua fisiere commituite din tests/fixtures/ au numarul pe care il da
//      pdfinfo, citit la autorare (2026-09-14): o pagina fiecare
//   2. un PDF al carui catalog si arbore de pagini stau INTR-UN FLUX DE OBIECTE
//      ARHIVAT este numarat corect, si cazul arata ca `/Count` nu apare deloc in
//      bytes-ii lui, deci o cautare de text nu l-ar fi putut numara
//   3. forma pe care sonda din 2026-09-12 a gresit-o: radacina arhivata,
//      subarborii in clar. Cel mai mare `/Count` vizibil este al unui subarbore,
//      iar cazul arata si numarul gresit pe care l-ar fi dat sonda, si numarul
//      corect pe care il da numaratorul
//   4. o actualizare incrementala: versiunea noua a radacinii castiga
//   5. PE FIECARE FISIER PE CARE NU IL POATE CITI CU SIGURANTA, null SI NU UN
//      INTREG GRESIT. Aceasta este clauza 4 a cardului, controlul: fiecare caz de
//      aici este o forma pe care o implementare mai lenesa ar numara-o gresit.
//   6. o imagine este o pagina; alt tip de fisier nu are numar
//   7. pragul: 99 trece, 100 este refuzat, null nu este refuzat niciodata
//
// PDF-URILE DE LA 2 LA 5 SUNT CONSTRUITE IN MEMORIE de
// tests/e2e/support/pdf-builder.mjs, acelasi constructor pe care il folosesc
// cazurile end to end. Fiecare forma a fost verificata cu pdfinfo cand a fost
// scrisa; pdfinfo nu ruleaza aici, fiindca nu este in imaginea de CI si nu
// trebuie sa devina o dependinta.
//
// Nu atinge nicio retea, nicio baza de date si niciun secret.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DOCUMENT_PAGE_LIMIT,
  countPages,
  isTooManyPages,
} from "../../lib/data/page-count.mjs";
import { buildPdf } from "../../tests/e2e/support/pdf-builder.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PDF = "application/pdf";

let failures = 0;
let total = 0;
function check(label, got, expected) {
  total += 1;
  const ok = Object.is(got, expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok   " : "FAIL "} ${label}: asteptat ${expected}, primit ${got}`);
}

/** Metoda sondei din 2026-09-12: cel mai mare `/Count N` vizibil in bytes.
 *  Aici numai ca martor, ca sa se vada ce ar fi dat. */
function largestVisibleCount(buf) {
  const all = [...buf.toString("latin1").matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  return all.length === 0 ? null : Math.max(...all);
}

/** Aceeasi lungime, alt continut: offseturile din xref raman valabile. */
function replaceSameLength(buf, from, to) {
  if (from.length !== to.length) throw new Error("inlocuirea trebuie sa pastreze lungimea");
  const s = buf.toString("latin1");
  const at = s.indexOf(from);
  if (at < 0) throw new Error(`"${from}" nu apare in fisier`);
  return Buffer.from(s.slice(0, at) + to + s.slice(at + from.length), "latin1");
}

console.log("check-page-count: numaratorul de pagini pe fisiere cunoscute\n");

console.log("1. fisierele commituite");
for (const name of [
  "confirmare-comanda-bilka-BLK-2026-14507.pdf",
  "confirmare-comanda-roben-RK-2026-88134.pdf",
]) {
  check(name, countPages(readFileSync(join(ROOT, "tests/fixtures", name)), PDF), 1);
}

console.log("\n2. flux de obiecte arhivat");
const objstm = buildPdf(5, { objectStreams: true });
check("catalog si radacina in ObjStm, 5 pagini", countPages(objstm, PDF), 5);
check("`/Count` nu apare deloc in bytes, deci textul nu il poate numara", largestVisibleCount(objstm), null);
check("arbore imbricat [4, 3] cu totul arhivat", countPages(buildPdf(7, { objectStreams: true, tree: [4, 3] }), PDF), 7);

console.log("\n3. forma pe care sonda a numarat-o gresit");
const subtreesVisible = buildPdf(7, { objectStreams: true, tree: [4, 3], packIntermediates: false });
check("sonda, cel mai mare /Count vizibil (numarul GRESIT, martor)", largestVisibleCount(subtreesVisible), 4);
check("numaratorul, radacina rezolvata", countPages(subtreesVisible, PDF), 7);
check("acelasi arbore, totul in clar", countPages(buildPdf(7, { tree: [4, 3] }), PDF), 7);
check("clasic, 3 pagini", countPages(buildPdf(3), PDF), 3);

console.log("\n4. actualizare incrementala");
check("10 pagini, apoi radacina redefinita la 4", countPages(buildPdf(10, { incrementalTo: 4 }), PDF), 4);

console.log("\n5. ce nu se poate citi cu siguranta este null, niciodata un intreg gresit");
check(
  "catalog fara /Pages (fixtura end to end)",
  countPages(Buffer.from("%PDF-1.4\n% RC test\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"), PDF),
  null,
);
check("fara antet %PDF", countPages(Buffer.from("nu este un pdf, doar text cu /Count 12 in el"), PDF), null);
check("/Count 0", countPages(replaceSameLength(buildPdf(3), "/Count 3", "/Count 0"), PDF), null);
check("/Count fractionar", countPages(replaceSameLength(buildPdf(30), "/Count 30 >>", "/Count 2.5>>"), PDF), null);
check("taiat inainte de trailer", countPages(objstm.subarray(0, Math.floor(objstm.length * 0.6)), PDF), null);
check(
  "radacina numeste un subarbore cu /Parent (subarborele ar spune 4)",
  countPages(replaceSameLength(buildPdf(7, { tree: [4, 3] }), "/Pages 2 0 R", "/Pages 3 0 R"), PDF),
  null,
);
{
  const s = objstm.toString("latin1");
  const start = s.indexOf("stream\n", s.indexOf("/ObjStm")) + 7;
  const broken = Buffer.from(objstm);
  for (let i = 0; i < 12; i++) broken[start + i] = 0xff;
  check("flux de obiecte cu datele arhivate stricate", countPages(broken, PDF), null);
}
check(
  "fisier criptat cu flux de obiecte (forma singurului null din masuratoarea pe 1735 de fisiere)",
  countPages(
    Buffer.from(objstm.toString("latin1").replace("/Type /XRef", "/Type /XRef /Encrypt 9 0 R"), "latin1"),
    PDF,
  ),
  null,
);

console.log("\n6. imagini si alte tipuri");
check("PNG este o pagina", countPages(Buffer.from([0x89, 0x50, 0x4e, 0x47]), "image/png"), 1);
check("JPG este o pagina", countPages(Buffer.from([0xff, 0xd8, 0xff]), "image/jpeg"), 1);
check("alt tip nu are numar", countPages(buildPdf(3), "application/zip"), null);

console.log("\n7. pragul");
check("DOCUMENT_PAGE_LIMIT este 100", DOCUMENT_PAGE_LIMIT, 100);
check("100 de pagini numarate", countPages(buildPdf(100), PDF), 100);
check("99 de pagini numarate", countPages(buildPdf(99), PDF), 99);
check("99 nu este refuzat", isTooManyPages(99), false);
check("100 este refuzat", isTooManyPages(100), true);
check("101 este refuzat", isTooManyPages(101), true);
check("null NU este refuzat: un numar necunoscut nu este un document mare", isTooManyPages(null), false);

console.log("");
if (failures > 0) {
  console.error(`check-page-count: ${failures} din ${total} cazuri au cazut.`);
  process.exit(1);
}
console.log(`check-page-count: ${total} cazuri, toate trec.`);
