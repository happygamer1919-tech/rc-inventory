// P3-321. Citirea sursei ghidului (content/guide): antetul fiecarui fisier si dosarul intreg.
//
// MUTAT DIN source.mjs, FARA SA SE SCHIMBE NIMIC DIN CE FACE, si source.mjs le reexporta cu
// aceleasi nume. Motivul: paginile /ajutor ruleaza pe server, iar Turbopack, cand vede
// source.mjs intr-un import de pagina, vede si readAppSourceText, care umbla prin app/,
// components/ si lib/ cu o cale calculata, si pune TOT proiectul in functia serverless.
// Aici sta numai ce citeste ghidul, deci pagina nu trage dupa ea cititorul de cod.
//
// Antetul admite numai trei forme, destule pentru lectii si capitole:
//   cheie: valoare
//   cheie: "valoare cu : in ea"
//   cheie: [a, b]          sau          cheie:
//                                         - a
//                                         - "b"

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function unquote(raw) {
  const v = raw.trim();
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    return v.slice(1, -1).replace(/\\"/g, '"');
  }
  return v;
}

function parseScalar(raw) {
  const v = unquote(raw);
  if (raw.trim().startsWith('"')) return v;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (v === "null" || v === "") return null;
  return v;
}

function parseInlineList(raw) {
  const inner = raw.trim().slice(1, -1).trim();
  if (inner === "") return [];
  return inner.split(",").map((part) => parseScalar(part));
}

/** Imparte un fisier in antet (obiect) si text. Arunca cu un mesaj clar daca antetul lipseste. */
export function parseFrontMatter(text, file = "?") {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    throw new Error(`${file}: fisierul nu incepe cu un antet (---)`);
  }
  const end = normalized.indexOf("\n---\n", 4);
  const endAtEof = normalized.endsWith("\n---") ? normalized.length - 4 : -1;
  const close = end !== -1 ? end : endAtEof;
  if (close === -1) throw new Error(`${file}: antetul nu este inchis cu ---`);
  const headerLines = normalized.slice(4, close).split("\n");
  const body = end !== -1 ? normalized.slice(end + 5) : "";

  const data = {};
  let listKey = null;
  for (const line of headerLines) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item) {
      if (listKey === null) throw new Error(`${file}: element de lista fara cheie: ${line}`);
      data[listKey].push(parseScalar(item[1]));
      continue;
    }
    const kv = /^([a-z_]+):(?:\s+(.*))?$/.exec(line);
    if (!kv) throw new Error(`${file}: rand de antet pe care nu il inteleg: ${line}`);
    const [, key, rest] = kv;
    if (key in data) throw new Error(`${file}: cheia ${key} apare de doua ori`);
    if (rest === undefined || rest.trim() === "") {
      data[key] = [];
      listKey = key;
    } else if (rest.trim().startsWith("[") && rest.trim().endsWith("]")) {
      data[key] = parseInlineList(rest);
      listKey = null;
    } else {
      data[key] = parseScalar(rest);
      listKey = null;
    }
  }
  // O cheie fara valoare si fara elemente este o lista goala, nu un null: asa o
  // vede si validarea din source.mjs.
  return { data, body: body.trim() };
}

/** Citeste tot ghidul din `root` (dosarul content/guide). Nu valideaza nimic. */
export function loadGuide(root) {
  const chapters = [];
  const lessons = [];
  const problems = [];
  if (!existsSync(root)) return { chapters, lessons, problems: [`${root}: dosarul nu exista`] };
  const dirs = readdirSync(root)
    .filter((name) => statSync(join(root, name)).isDirectory())
    .sort();
  for (const dir of dirs) {
    const chapterFile = join(root, dir, "_chapter.md");
    if (!existsSync(chapterFile)) {
      problems.push(`${dir}: lipseste _chapter.md`);
    } else {
      try {
        const { data } = parseFrontMatter(readFileSync(chapterFile, "utf8"), `${dir}/_chapter.md`);
        chapters.push({ dir, file: `${dir}/_chapter.md`, ...data });
      } catch (e) {
        problems.push(e.message);
      }
    }
    const files = readdirSync(join(root, dir))
      .filter((name) => name.endsWith(".md") && name !== "_chapter.md")
      .sort();
    for (const name of files) {
      const rel = `${dir}/${name}`;
      try {
        const { data, body } = parseFrontMatter(readFileSync(join(root, dir, name), "utf8"), rel);
        lessons.push({ dir, name, file: rel, body, ...data });
      } catch (e) {
        problems.push(e.message);
      }
    }
  }
  return { chapters, lessons, problems };
}
