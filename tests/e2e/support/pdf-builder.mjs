// EXT-28. PDF-uri construite in memorie, cu un numar de pagini ales.
//
// DE CE CONSTRUITE SI NU COMMITUITE. Un fisier de o suta de pagini commituit
// este un fisier binar pe care nimeni nu il poate citi intr-un diff, iar
// intrebarea pe care o pune cazul ("are exact o suta de pagini?") ar ramane o
// afirmatie despre un fisier. Aici numarul este un argument.
//
// DOUA FORME, FIINDCA NUMARATORUL ARE DOUA CAI. `classic` pune fiecare obiect in
// clar, cu un tabel xref text. `objectStreams` pune catalogul si arborele de
// pagini intr-un flux de obiecte arhivat cu FlateDecode, cu un flux xref: acolo
// `/Count` nu apare deloc in bytes-ii fisierului, deci o cautare de text nu il
// poate gasi, si exact acela este cazul pe care cardul cere sa fie dovedit.
//
// Importat si de scripts/poc-free/check-page-count.mjs, sub node 20, deci este
// .mjs si nu importa nimic in afara de node.

import { deflateSync } from "node:zlib";

/**
 * @param {number} pageCount paginile documentului
 * @param {{ objectStreams?: boolean, tree?: number[], incrementalTo?: number }} [options]
 *   tree: marimile subarborilor de sub radacina, de exemplu [4, 3]; suma lor este
 *   numarul de pagini. incrementalTo: o actualizare incrementala adaugata la coada
 *   care redefineste radacina cu acest numar de pagini, primele din document.
 */
export function buildPdf(pageCount, options = {}) {
  const objectStreams = options.objectStreams === true;
  const tree = options.tree ?? [pageCount];
  if (tree.reduce((a, b) => a + b, 0) !== pageCount) {
    throw new Error("tree trebuie sa insumeze pageCount");
  }
  const nested = tree.length > 1;

  // Numerotarea: 1 catalog, 2 radacina, apoi nodurile intermediare, apoi paginile.
  const objects = new Map();
  const ROOT = 2;
  let next = 3;
  const kidsOfRoot = [];
  const pageNums = [];
  for (const size of tree) {
    const parent = nested ? next++ : ROOT;
    if (nested) kidsOfRoot.push(parent);
    const kids = [];
    for (let i = 0; i < size; i++) {
      const num = next++;
      kids.push(num);
      pageNums.push(num);
      objects.set(num, `<< /Type /Page /Parent ${parent} 0 R /MediaBox [0 0 595 842] >>`);
    }
    if (nested) {
      objects.set(parent, `<< /Type /Pages /Parent ${ROOT} 0 R /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${size} >>`);
    } else {
      kidsOfRoot.push(...kids);
    }
  }
  objects.set(1, `<< /Type /Catalog /Pages ${ROOT} 0 R >>`);
  objects.set(ROOT, `<< /Type /Pages /Kids [${kidsOfRoot.map((k) => `${k} 0 R`).join(" ")}] /Count ${pageCount} >>`);

  const size = next;
  const chunks = [];
  let length = 0;
  const write = (text) => {
    const b = Buffer.isBuffer(text) ? text : Buffer.from(text, "latin1");
    chunks.push(b);
    length += b.length;
  };
  write("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n");

  const offsets = new Map();
  if (!objectStreams) {
    for (let num = 1; num < size; num++) {
      offsets.set(num, length);
      write(`${num} 0 obj\n${objects.get(num)}\nendobj\n`);
    }
    const xref = length;
    write(`xref\n0 ${size}\n0000000000 65535 f \n`);
    for (let num = 1; num < size; num++) write(`${String(offsets.get(num)).padStart(10, "0")} 00000 n \n`);
    write(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  } else {
    // Catalogul, radacina si nodurile intermediare intra in fluxul de obiecte;
    // paginile raman in clar. Asa singurul `/Count` al radacinii este arhivat.
    //
    // packIntermediates: false lasa nodurile intermediare IN CLAR si arhiveaza
    // numai radacina. Aceasta este exact forma pe care sonda din 2026-09-12 a
    // numarat-o gresit: cel mai mare `/Count` vizibil in bytes este al unui
    // subarbore, iar al radacinii nu se vede deloc.
    const packed = [1, ROOT, ...(nested && options.packIntermediates !== false ? kidsOfRoot : [])];
    const STREAM = size;
    const XREF = size + 1;
    for (let num = 1; num < size; num++) {
      if (packed.includes(num)) continue;
      offsets.set(num, length);
      write(`${num} 0 obj\n${objects.get(num)}\nendobj\n`);
    }
    let body = "";
    const header = [];
    for (const num of packed) {
      header.push(`${num} ${body.length}`);
      body += `${objects.get(num)}\n`;
    }
    const head = `${header.join(" ")}\n`;
    const data = deflateSync(Buffer.from(head + body, "latin1"));
    offsets.set(STREAM, length);
    write(`${STREAM} 0 obj\n<< /Type /ObjStm /N ${packed.length} /First ${head.length} /Filter /FlateDecode /Length ${data.length} >>\nstream\n`);
    write(data);
    write("\nendstream\nendobj\n");

    // Fluxul xref: tip 1 = obiect in clar la un offset, tip 2 = membru al unui
    // flux de obiecte la un index. /W [1 4 2].
    const rows = [];
    const row = (type, a, b) => {
      const r = Buffer.alloc(7);
      r.writeUInt8(type, 0);
      r.writeUInt32BE(a, 1);
      r.writeUInt16BE(b, 5);
      rows.push(r);
    };
    const xrefOffset = length;
    for (let num = 0; num < XREF + 1; num++) {
      if (num === 0) row(0, 0, 65535);
      else if (packed.includes(num)) row(2, STREAM, packed.indexOf(num));
      else if (num === XREF) row(1, xrefOffset, 0);
      else row(1, offsets.get(num), 0);
    }
    const xrefData = deflateSync(Buffer.concat(rows));
    write(`${XREF} 0 obj\n<< /Type /XRef /Size ${XREF + 1} /W [1 4 2] /Root 1 0 R /Filter /FlateDecode /Length ${xrefData.length} >>\nstream\n`);
    write(xrefData);
    write(`\nendstream\nendobj\nstartxref\n${xrefOffset}\n%%EOF\n`);
  }

  if (options.incrementalTo !== undefined) {
    // O actualizare incrementala: radacina redefinita la coada, cu mai putine
    // pagini, si un trailer nou. Un cititor corect vede numai versiunea noua.
    if (objectStreams) throw new Error("incrementalTo este construit numai pe forma classic");
    const keep = options.incrementalTo;
    const prevXref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(Buffer.concat(chunks).toString("latin1"))[1]);
    const rootOffset = length;
    write(`${ROOT} 0 obj\n<< /Type /Pages /Kids [${pageNums.slice(0, keep).map((k) => `${k} 0 R`).join(" ")}] /Count ${keep} >>\nendobj\n`);
    const xref = length;
    write(`xref\n${ROOT} 1\n${String(rootOffset).padStart(10, "0")} 00000 n \n`);
    write(`trailer\n<< /Size ${size} /Root 1 0 R /Prev ${prevXref} >>\nstartxref\n${xref}\n%%EOF\n`);
  }

  return Buffer.concat(chunks);
}
