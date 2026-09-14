// EXT-28. Numarul de pagini al documentului, NUMARAT DE NOI, la incarcare.
//
// DE CE .mjs SI NU .ts. Acelasi motiv ca la document-url-contract.mjs:
// scripts/poc-free/check-page-count.mjs il importa sub node 20 in `quality`, iar
// node 20 nu dezbraca adnotarile de tip. Tipurile stau in page-count.d.mts.
//
// FARA NICIO DEPENDINTA, SI ASTA ESTE MASURAT, NU PRESUPUS. Numarul de pagini al
// unui PDF este `/Count` de pe RADACINA arborelui de pagini. Pe un fisier modern
// obiectul acela sta intr-un flux de obiecte comprimat cu FlateDecode, pe care
// `node:zlib` il dezarhiveaza fara niciun pachet. Masuratoarea fata de pdfinfo
// este in raportul cardului.
//
// RADACINA SE REZOLVA, NU SE GHICESTE. Sonda din 2026-09-12 lua cel mai mare
// `/Count` pe care il vedea si a gresit sapte fisiere din 1535, toate in jos: pe
// un arbore imbricat, cel mai mare numar vizibil era al unui subarbore, iar
// radacina statea intr-un flux pe care sonda nu il deschidea. Aici se urmeaza
// lantul real: /Root din trailer, /Pages din catalog, /Count de pe acel obiect.
//
// UN NUMAR GRESIT ESTE MAI RAU DECAT NICIUN NUMAR. Orice citire de care nu
// suntem siguri intoarce null, iar null NU este o eroare si NU refuza nimic: un
// numar de pagini necunoscut nu este un document mare.
//
// NU ARUNCA NICIODATA, NU CITESTE RETEAUA SI NU CITESTE MEDIUL.

import { inflateSync, constants as zlibConstants } from "node:zlib";

/** Plafonul de pagini. 100 este plafonul celeilalte parti si este ACELASI numar
 *  la noi, deliberat: al lor ramane plasa de siguranta, al nostru este verificarea
 *  ieftina, fiindca nu costa decat bytes pe care ii tinem deja in memorie. */
export const DOCUMENT_PAGE_LIMIT = 100;

/** 100 sau mai mult se refuza. null nu se refuza niciodata. */
export function isTooManyPages(pageCount) {
  return typeof pageCount === "number" && pageCount >= DOCUMENT_PAGE_LIMIT;
}

/**
 * Cate pagini are documentul, sau null cand nu putem fi siguri.
 *
 * O IMAGINE ESTE O PAGINA. Aplicatia accepta PNG si JPG pe langa PDF, iar o
 * fotografie a unui document este o singura pagina, oricat de mult ar cuprinde.
 */
export function countPages(bytes, mimeType) {
  if (mimeType === "image/png" || mimeType === "image/jpeg") return 1;
  if (mimeType !== "application/pdf") return null;
  try {
    return countPdfPages(toBuffer(bytes));
  } catch {
    return null;
  }
}

function toBuffer(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof ArrayBuffer) return Buffer.from(bytes);
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/* ------------------------------------------------------------- lexer PDF -- */

const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMITERS = new Set([...'()<>[]{}/%'].map((c) => c.charCodeAt(0)));
const MAX_DEPTH = 64;

function isSpace(s, p) {
  return WHITESPACE.has(s.charCodeAt(p));
}

function skipSpace(s, p) {
  for (;;) {
    while (p < s.length && isSpace(s, p)) p++;
    if (s[p] !== "%") return p;
    while (p < s.length && s[p] !== "\n" && s[p] !== "\r") p++;
  }
}

function regularEnd(s, p) {
  while (p < s.length) {
    const c = s.charCodeAt(p);
    if (WHITESPACE.has(c) || DELIMITERS.has(c)) break;
    p++;
  }
  return p;
}

function decodeName(raw) {
  return raw.replace(/#([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function isRef(v) {
  return v !== null && typeof v === "object" && typeof v.ref === "number";
}

function nameOf(v) {
  return v !== null && typeof v === "object" && typeof v.name === "string" ? v.name : undefined;
}

/**
 * O valoare PDF de la pozitia p: [valoare, pozitia de dupa ea]. Arunca pe o forma
 * pe care nu o recunoaste, iar apelantul trateaza aruncarea ca "nu stim".
 *
 * Dictionarele devin Map, numele {name}, referintele {ref, gen}. Sirurile NU se
 * citesc: niciun raspuns de aici nu depinde de ele, iar pe un fisier criptat ele
 * sunt singurul lucru criptat dintr-un dictionar.
 */
function parseValue(s, p, depth = 0) {
  if (depth > MAX_DEPTH) throw new Error("prea adanc");
  p = skipSpace(s, p);
  if (p >= s.length) throw new Error("sfarsit");
  const c = s[p];

  if (c === "<" && s[p + 1] === "<") {
    const dict = new Map();
    p += 2;
    for (;;) {
      p = skipSpace(s, p);
      if (s[p] === ">" && s[p + 1] === ">") return [dict, p + 2];
      if (s[p] !== "/") throw new Error("cheie");
      const end = regularEnd(s, p + 1);
      const key = decodeName(s.slice(p + 1, end));
      const [value, next] = parseValue(s, end, depth + 1);
      dict.set(key, value);
      p = next;
    }
  }
  if (c === "[") {
    const arr = [];
    p += 1;
    for (;;) {
      p = skipSpace(s, p);
      if (s[p] === "]") return [arr, p + 1];
      const [value, next] = parseValue(s, p, depth + 1);
      arr.push(value);
      p = next;
    }
  }
  if (c === "(") {
    let level = 1;
    p += 1;
    while (p < s.length && level > 0) {
      if (s[p] === "\\") p += 2;
      else {
        if (s[p] === "(") level++;
        else if (s[p] === ")") level--;
        p++;
      }
    }
    if (level !== 0) throw new Error("sir");
    return [{ string: true }, p];
  }
  if (c === "<") {
    const end = s.indexOf(">", p + 1);
    if (end < 0) throw new Error("sir hex");
    return [{ string: true }, end + 1];
  }
  if (c === "/") {
    const end = regularEnd(s, p + 1);
    return [{ name: decodeName(s.slice(p + 1, end)) }, end];
  }
  if (DELIMITERS.has(s.charCodeAt(p))) throw new Error("delimitator");

  const end = regularEnd(s, p);
  const token = s.slice(p, end);
  if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(token)) {
    // `12 0 R` este o referinta, nu doua numere si un cuvant.
    if (/^\d+$/.test(token)) {
      const q = skipSpace(s, end);
      const genEnd = regularEnd(s, q);
      if (genEnd > q && /^\d+$/.test(s.slice(q, genEnd))) {
        const r = skipSpace(s, genEnd);
        const afterR = s.charCodeAt(r + 1);
        if (s[r] === "R" && (r + 1 >= s.length || WHITESPACE.has(afterR) || DELIMITERS.has(afterR))) {
          return [{ ref: Number(token), gen: Number(s.slice(q, genEnd)) }, r + 1];
        }
      }
    }
    return [Number(token), end];
  }
  return [{ keyword: token }, end];
}

/* --------------------------------------------------- obiecte si trailer -- */

// Antetul unui obiect indirect. Lookbehind-ul opreste o potrivire in mijlocul
// unui numar, iar lookahead-ul cere un separator dupa `obj`.
const OBJECT_HEADER = /(?<![0-9])(\d+)[\x00\t\n\f\r ]+(\d+)[\x00\t\n\f\r ]+obj(?=[\x00\t\n\f\r ()<>[\]{}/%])/g;

/** Datele unui flux, dezarhivate, sau null cand filtrul nu este unul pe care il
 *  stim citi exact. Un flux citit pe jumatate nu este un flux citit. */
function decodeStream(dict, raw) {
  const filter = dict.get("Filter");
  const filters = filter === undefined ? [] : Array.isArray(filter) ? filter : [filter];
  if (filters.length === 0) return raw;
  if (filters.length !== 1 || nameOf(filters[0]) !== "FlateDecode") return null;
  const parms = dict.get("DecodeParms");
  if (parms instanceof Map) {
    const predictor = parms.get("Predictor");
    if (predictor !== undefined && predictor !== 1) return null;
  }
  try {
    return inflateSync(raw, { finishFlush: zlibConstants.Z_SYNC_FLUSH });
  } catch {
    return null;
  }
}

/** Obiectele dintr-un flux de obiecte (/Type /ObjStm), ca perechi [numar, valoare]. */
function objectStreamMembers(s, dict, stream) {
  const n = dict.get("N");
  const first = dict.get("First");
  if (!Number.isInteger(n) || !Number.isInteger(first) || n < 0 || first < 0) return [];
  const data = decodeStream(dict, Buffer.from(s.slice(stream.start, stream.end), "latin1"));
  if (data === null) return [];
  const text = data.toString("latin1");
  const header = text.slice(0, first).trim().split(/[\x00\t\n\f\r ]+/).map(Number);
  if (header.length < 2 * n) return [];

  const members = [];
  for (let i = 0; i < n; i++) {
    const num = header[2 * i];
    const offset = header[2 * i + 1];
    // Un antet stricat face tot fluxul necitibil. A citi o parte din el ar
    // insemna sa asezam obiecte la numere pe care nu le putem garanta.
    if (!Number.isInteger(num) || !Number.isInteger(offset)) return [];
    try {
      members.push([num, parseValue(text, first + offset)[0]]);
    } catch {
      // Un membru pe care nu il putem citi lipseste, si nimic nu il inlocuieste.
    }
  }
  return members;
}

/**
 * Fiecare obiect din fisier, si fiecare trailer care numeste un /Root.
 *
 * CEL MAI TARZIU IN FISIER CASTIGA. O actualizare incrementala adauga la coada
 * versiunea noua a unui obiect si un trailer nou; un obiect dintr-un flux de
 * obiecte ia pozitia fluxului care il contine. Asta este ordinea in care un
 * cititor care urmeaza tabelele xref ajunge la acelasi raspuns.
 */
function scanObjects(s) {
  const defs = new Map();
  const roots = [];
  // Pe un fisier criptat fluxurile sunt criptate inaintea arhivarii, deci o
  // dezarhivare care "reuseste" ar produce gunoi. Nu se incearca deloc.
  const encrypted = /\/Encrypt[\x00\t\n\f\r /<\d]/.test(s);

  const put = (num, def) => {
    const prev = defs.get(num);
    if (!prev || prev.pos <= def.pos) defs.set(num, def);
  };

  OBJECT_HEADER.lastIndex = 0;
  let match;
  while ((match = OBJECT_HEADER.exec(s)) !== null) {
    const pos = match.index;
    const num = Number(match[1]);
    const headerEnd = OBJECT_HEADER.lastIndex;

    let value;
    let after;
    try {
      [value, after] = parseValue(s, headerEnd);
    } catch {
      continue;
    }
    OBJECT_HEADER.lastIndex = after;

    let stream = null;
    if (value instanceof Map) {
      let k = after;
      while (k < s.length && isSpace(s, k)) k++;
      if (s.startsWith("stream", k)) {
        let start = k + 6;
        if (s[start] === "\r" && s[start + 1] === "\n") start += 2;
        else if (s[start] === "\n" || s[start] === "\r") start += 1;

        let end = -1;
        const length = value.get("Length");
        if (Number.isInteger(length) && length >= 0 && start + length <= s.length
            && /^[\x00\t\n\f\r ]*endstream/.test(s.slice(start + length, start + length + 40))) {
          end = start + length;
        }
        if (end < 0) {
          const marker = s.indexOf("endstream", start);
          if (marker < 0) break;
          end = marker;
          if (s[end - 1] === "\n") end--;
          if (s[end - 1] === "\r") end--;
        }
        stream = { start, end };
        const marker = s.indexOf("endstream", end);
        OBJECT_HEADER.lastIndex = marker < 0 ? s.length : marker + 9;
      }
    }

    put(num, { pos, value });

    if (value instanceof Map) {
      const type = nameOf(value.get("Type"));
      if (type === "XRef" && isRef(value.get("Root"))) roots.push({ pos, ref: value.get("Root") });
      if (type === "ObjStm" && stream && !encrypted) {
        for (const [member, memberValue] of objectStreamMembers(s, value, stream)) {
          put(member, { pos, value: memberValue });
        }
      }
    }
  }

  for (let t = s.indexOf("trailer"); t >= 0; t = s.indexOf("trailer", t + 7)) {
    try {
      const [dict] = parseValue(s, t + 7);
      if (dict instanceof Map && isRef(dict.get("Root"))) roots.push({ pos: t, ref: dict.get("Root") });
    } catch {
      // Cuvantul "trailer" in afara unui trailer. Nu spune nimic.
    }
  }

  return { defs, roots };
}

function resolve(defs, value) {
  for (let hops = 0; isRef(value); hops++) {
    if (hops > 32) return undefined;
    const def = defs.get(value.ref);
    if (!def) return undefined;
    value = def.value;
  }
  return value;
}

function countPdfPages(buf) {
  const s = buf.toString("latin1");
  const header = s.indexOf("%PDF-");
  if (header < 0 || header > 1024) return null;

  const { defs, roots } = scanObjects(s);
  if (roots.length === 0) return null;

  // NUMAI CEL MAI RECENT /Root. Daca el nu se poate rezolva, un /Root mai vechi
  // ar da numarul de pagini al unei versiuni anterioare a documentului, adica
  // exact numarul gresit pe care acest fisier refuza sa il dea.
  roots.sort((a, b) => a.pos - b.pos);
  const catalog = resolve(defs, roots[roots.length - 1].ref);
  if (!(catalog instanceof Map)) return null;
  const catalogType = catalog.get("Type");
  if (catalogType !== undefined && nameOf(catalogType) !== "Catalog") return null;

  const pages = resolve(defs, catalog.get("Pages"));
  if (!(pages instanceof Map)) return null;
  const pagesType = pages.get("Type");
  if (pagesType !== undefined && nameOf(pagesType) !== "Pages") return null;
  // Un nod cu parinte nu este radacina, iar /Count al lui numara un subarbore.
  if (pages.has("Parent")) return null;

  const count = resolve(defs, pages.get("Count"));
  return Number.isInteger(count) && count >= 1 ? count : null;
}
