// P3-319. Sursa unica a ghidului din platforma: lectiile din content/guide.
//
// Un dosar pe capitol, un fisier pe lectie, antet in stil YAML (un subset mic,
// descris mai jos) si, dupa antet, un text scurt. Paginile /ajutor (task 322), FAQ
// (323) si PDF-ul (324) citesc de aici si de nicaieri altundeva: nimic nu se scrie
// de doua ori.
//
// Fisier .mjs, nu .ts, din acelasi motiv ca lib/data/callback-keys.mjs: il citesc
// si scripturile de verificare, care ruleaza cu node simplu, si testul Playwright.
// Fara dependinte noi: antetul se citeste cu parserul de mai jos.
//
// Antetul admite numai trei forme, destule pentru lectii si capitole:
//   cheie: valoare
//   cheie: "valoare cu : in ea"
//   cheie: [a, b]          sau          cheie:
//                                         - a
//                                         - "b"

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

export const GUIDE_ROLES = ["owner", "account_manager"];
export const MAX_WORDS = 199;
export const MAX_STEPS = 8;
export const MAX_SEE_ALSO = 4;

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Linia lunga (em) si linia de lungime medie (en), scrise cu escape: regula repo-ului
// le interzice peste tot, deci nici fisierul care le cauta nu le contine.
const EM_EN_DASH = /[\u2013\u2014]/;
// Sedila in loc de virgula dedesubt (s si t cu sedila, mici si mari): litere gresite in romana.
const CEDILLA = /[\u015F\u0163\u015E\u0162]/;

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
  // vede si validarea de mai jos.
  return { data, body: body.trim() };
}

/** Cuvintele unui text, numarate cum le numara cititorul: separate prin spatii. */
export function countWords(text) {
  const t = text.replace(/\*\*/g, "").trim();
  return t === "" ? 0 : t.split(/\s+/).length;
}

/** Etichetele din pasi: textul dintre **...**, adica exact ce scrie pe ecran. */
export function labelsOf(step) {
  return [...String(step).matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1]);
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

/** Textul vizibil al unei lectii, cel pe care il numara limita de cuvinte. */
export function visibleText(lesson, titleOf) {
  const seeAlso = (lesson.see_also ?? []).map((id) => titleOf(id) ?? "").join(" ");
  return [lesson.title, lesson.body, ...(lesson.steps ?? []), "Vezi și", seeAlso]
    .filter((p) => typeof p === "string" && p !== "")
    .join(" ");
}

/**
 * Toate verificarile. `ctx.navGroups` = titlurile grupurilor din meniu, in ordinea
 * din lib/nav.ts. `ctx.sourceText` = tot textul din app, components si lib, ca
 * fiecare eticheta dintre ** sa fie gasita exact acolo.
 */
export function validateGuide(guide, ctx) {
  const problems = [...guide.problems];
  const { chapters, lessons } = guide;
  const navGroups = ctx.navGroups;

  // Capitole.
  const chapterIds = new Set();
  const chapterOrders = new Set();
  for (const c of chapters) {
    if (c.id !== c.dir) problems.push(`${c.file}: id "${c.id}" trebuie sa fie numele dosarului "${c.dir}"`);
    if (!KEBAB.test(String(c.id))) problems.push(`${c.file}: id invalid`);
    if (chapterIds.has(c.id)) problems.push(`${c.file}: capitol cu id repetat ${c.id}`);
    chapterIds.add(c.id);
    if (!Number.isInteger(c.order) || c.order < 1) problems.push(`${c.file}: order trebuie sa fie un intreg >= 1`);
    if (chapterOrders.has(c.order)) problems.push(`${c.file}: order ${c.order} folosit de doua capitole`);
    chapterOrders.add(c.order);
    if (typeof c.title !== "string" || c.title.trim() === "") problems.push(`${c.file}: lipseste title`);
    if (typeof c.summary !== "string" || c.summary.trim() === "") problems.push(`${c.file}: lipseste summary`);
    if (!navGroups.includes(c.menu)) {
      problems.push(`${c.file}: menu "${c.menu}" nu este un grup din meniul principal (${navGroups.join(", ")})`);
    }
  }
  // Ordinea capitolelor = ordinea grupurilor din meniu, si fiecare grup are capitol.
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  const menuSeq = sorted.map((c) => c.menu);
  const expected = navGroups.filter((g) => menuSeq.includes(g));
  if (JSON.stringify(menuSeq) !== JSON.stringify(expected)) {
    problems.push(`capitolele nu urmeaza ordinea meniului: ${menuSeq.join(" > ")} (meniul: ${navGroups.join(" > ")})`);
  }
  for (const g of navGroups) {
    if (!menuSeq.includes(g)) problems.push(`grupul de meniu "${g}" nu are capitol`);
  }

  // Lectii.
  const byId = new Map();
  for (const l of lessons) {
    if (byId.has(l.id)) problems.push(`${l.file}: id repetat ${l.id} (si in ${byId.get(l.id).file})`);
    else byId.set(l.id, l);
  }
  const titleOf = (id) => byId.get(id)?.title;
  const screenshotOwner = new Map();
  const ordersByChapter = new Map();
  for (const l of lessons) {
    const where = l.file;
    const need = (cond, msg) => {
      if (!cond) problems.push(`${where}: ${msg}`);
    };
    need(typeof l.id === "string" && KEBAB.test(l.id), "id lipseste sau nu este in forma kebab-case");
    need(l.id === basename(l.name, ".md"), `id "${l.id}" trebuie sa fie numele fisierului "${basename(l.name, ".md")}"`);
    need(l.chapter === l.dir, `chapter "${l.chapter}" trebuie sa fie dosarul "${l.dir}"`);
    need(chapterIds.has(l.chapter), `capitolul "${l.chapter}" nu exista`);
    need(Number.isInteger(l.order) && l.order >= 1, "order trebuie sa fie un intreg >= 1");
    if (Number.isInteger(l.order)) {
      const seen = ordersByChapter.get(l.chapter) ?? [];
      seen.push(l.order);
      ordersByChapter.set(l.chapter, seen);
    }
    need(
      Array.isArray(l.roles) && l.roles.length > 0 && l.roles.every((r) => GUIDE_ROLES.includes(r)),
      `roles trebuie sa fie o lista nevida din ${GUIDE_ROLES.join(", ")}`,
    );
    need(typeof l.title === "string" && /^Cum [a-zăâîșț]/.test(l.title), 'title trebuie sa inceapa cu "Cum " si un verb');
    need(typeof l.title === "string" && l.title.length <= 90, "title are peste 90 de caractere");
    need(
      Array.isArray(l.steps) && l.steps.length >= 1 && l.steps.length <= MAX_STEPS,
      `steps trebuie sa aiba intre 1 si ${MAX_STEPS} pasi`,
    );
    for (const [i, s] of (Array.isArray(l.steps) ? l.steps : []).entries()) {
      need(typeof s === "string" && s.trim() !== "", `pasul ${i + 1} este gol`);
      need(typeof s === "string" && !/^\s*\d+[.)]/.test(s), `pasul ${i + 1} are numar scris de mana; il pune pagina`);
      if (typeof s === "string" && ctx.sourceText) {
        for (const label of labelsOf(s)) {
          need(ctx.sourceText.includes(label), `pasul ${i + 1}: eticheta "${label}" nu apare exact nicaieri in aplicatie`);
        }
      }
    }
    need(
      Array.isArray(l.screenshots) && l.screenshots.length === 1 && KEBAB.test(String(l.screenshots[0])),
      "screenshots trebuie sa aiba exact un id kebab-case",
    );
    if (Array.isArray(l.screenshots) && l.screenshots.length === 1) {
      const sid = l.screenshots[0];
      if (screenshotOwner.has(sid)) problems.push(`${where}: screenshot "${sid}" folosit si de ${screenshotOwner.get(sid)}`);
      else screenshotOwner.set(sid, where);
    }
    // Vezi si.
    need(
      Array.isArray(l.see_also) && l.see_also.length >= 1 && l.see_also.length <= MAX_SEE_ALSO,
      `see_also trebuie sa aiba intre 1 si ${MAX_SEE_ALSO} lectii`,
    );
    for (const id of Array.isArray(l.see_also) ? l.see_also : []) {
      const target = byId.get(id);
      need(target !== undefined, `Vezi și: lectia "${id}" nu exista`);
      need(id !== l.id, "Vezi și trimite la lectia insasi");
      if (target && Array.isArray(l.roles) && Array.isArray(target.roles)) {
        // Un operator nu trebuie trimis la o lectie pe care nu o vede.
        const hidden = l.roles.filter((r) => !target.roles.includes(r));
        need(hidden.length === 0, `Vezi și: "${id}" nu este vizibila rolului ${hidden.join(", ")}`);
      }
    }
    // Text.
    const text = visibleText(l, titleOf);
    const words = countWords(text);
    need(words <= MAX_WORDS, `${words} cuvinte, limita este sub 200`);
    need(!EM_EN_DASH.test(JSON.stringify(l)), "contine linie lunga (em sau en dash)");
    need(!CEDILLA.test(JSON.stringify(l)), "contine s sau t cu sedila; in romana se scriu cu virgula dedesubt");
  }
  for (const [chapter, orders] of ordersByChapter) {
    const sortedOrders = [...orders].sort((a, b) => a - b);
    if (sortedOrders.some((o, i) => o !== i + 1)) {
      problems.push(`${chapter}: order-urile lectiilor trebuie sa fie 1..${orders.length} fara goluri si fara repetari (sunt ${sortedOrders.join(",")})`);
    }
  }
  for (const c of chapters) {
    if (!lessons.some((l) => l.chapter === c.id)) problems.push(`${c.file}: capitolul nu are nicio lectie`);
    if (EM_EN_DASH.test(JSON.stringify(c)) || CEDILLA.test(JSON.stringify(c))) {
      problems.push(`${c.file}: contine linie lunga sau s/t cu sedila`);
    }
  }
  return problems;
}

/** Titlurile grupurilor din meniu, in ordinea din lib/nav.ts, citite fara a compila TypeScript. */
export function navGroupTitles(repoRoot) {
  const src = readFileSync(join(repoRoot, "lib/nav.ts"), "utf8");
  const start = src.indexOf("export const NAV: NavGroup[]");
  if (start === -1) throw new Error("lib/nav.ts: nu gasesc export const NAV");
  return [...src.slice(start).matchAll(/^ {4}title: "([^"]+)",$/gm)].map((m) => m[1]);
}

/** Textul din app, components si lib, intr-un singur sir, pentru verificarea etichetelor. */
export function readAppSourceText(repoRoot) {
  const parts = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (/\.(tsx?|mjs)$/.test(name)) parts.push(readFileSync(full, "utf8"));
    }
  };
  for (const d of ["app", "components", "lib"]) {
    const p = join(repoRoot, d);
    if (existsSync(p)) walk(p);
  }
  return parts.join("\n");
}
