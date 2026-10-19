// P3-320. Verificarea de confidentialitate a pozelor din ghid.
//
// Pozele se fac pe o copie de test a platformei, umpluta numai cu date inventate.
// Verificarea de aici pica daca un nume de pe lista docs/guide/real-names.txt apare:
//   - in datele inventate (scripts/guide/, plus scripturile scripts/seed-test-*.mjs),
//   - in lectii (content/guide/),
//   - in textul care era pe ecran cand s-a facut fiecare poza (docs/guide/screenshots.json).
// In plus, telefoanele si adresele de email din datele inventate trebuie sa aiba o
// forma care nu poate fi a nimanui (vezi INVENTED_PHONE si INVENTED_EMAIL).
//
// Compararea ignora literele mari si diacriticele ("Ștefan" = "stefan") si cere
// cuvinte intregi, ca un nume scurt sa nu prinda bucati din alte cuvinte.
// In fisierele de cod se citesc numai datele, nu si comentariile.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Prefixul 00 nu este al niciunui operator din Moldova: un astfel de numar nu poate suna la nimeni.
export const INVENTED_PHONE = /^\+373 00 000 \d{3}$/;
// .example este rezervat (RFC 2606): nicio cutie postala reala nu are acest domeniu.
export const INVENTED_EMAIL = /^[a-z0-9._-]+@[a-z0-9.-]+\.example$/;

/** Fara diacritice, cu litere mici. */
export function fold(text) {
  return String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Liniile listei: fara randuri goale si fara comentarii (#). */
export function parseDenyList(text) {
  return String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"));
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Expresia care gaseste un nume ca cuvinte intregi, in text deja trecut prin fold(). */
export function nameRegExp(name) {
  const words = fold(name).trim().split(/\s+/).map(escapeRegExp);
  return new RegExp(`(?<![\\p{L}\\p{N}])${words.join("\\s+")}(?![\\p{L}\\p{N}])`, "u");
}

/** Toate potrivirile: [{ name, line }] (line incepe de la 1). */
export function findNames(text, names) {
  const hits = [];
  const lines = String(text).split("\n");
  const patterns = names.map((n) => [n, nameRegExp(n)]);
  lines.forEach((raw, i) => {
    const line = fold(raw);
    for (const [name, re] of patterns) {
      if (re.test(line)) hits.push({ name, line: i + 1 });
    }
  });
  return hits;
}

/**
 * Codul JavaScript fara comentarii, cu sirurile pastrate si cu liniile pastrate (un
 * comentariu pe mai multe linii lasa liniile goale), ca numarul liniei sa ramana bun.
 */
export function stripJsComments(src) {
  let out = "";
  let i = 0;
  const s = String(src);
  while (i < s.length) {
    const c = s[i];
    const n = s[i + 1];
    if (c === "/" && n === "/") {
      while (i < s.length && s[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && n === "*") {
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) {
        if (s[i] === "\n") out += "\n";
        i++;
      }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i++;
      while (i < s.length && s[i] !== quote) {
        if (s[i] === "\\") {
          out += s[i] + (s[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += s[i];
        i++;
      }
      if (i < s.length) out += s[i];
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Sirurile dintre ghilimele dintr-un text de cod fara comentarii. */
export function stringLiterals(code) {
  return [...String(code).matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)].map(
    (m) => m[1] ?? m[2] ?? m[3] ?? "",
  );
}

/** Telefoane si emailuri din datele inventate care nu au forma rezervata. */
export function contactShapeProblems(code) {
  const problems = [];
  for (const lit of stringLiterals(code)) {
    for (const email of lit.match(/[^\s"'<>(),;]+@[^\s"'<>(),;]+/g) ?? []) {
      if (!INVENTED_EMAIL.test(email)) problems.push(`email "${email}" nu se termina in .example`);
    }
    // Un sir care incepe cu + si are cel putin 8 cifre este tratat ca telefon.
    if (/^\+\d/.test(lit.trim()) && (lit.match(/\d/g) ?? []).length >= 8 && !INVENTED_PHONE.test(lit.trim())) {
      problems.push(`telefonul "${lit.trim()}" nu are forma +373 00 000 NNN`);
    }
  }
  return problems;
}

function walk(dir, files) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

/**
 * Fisierele de verificat, fiecare cu felul in care se citeste:
 *   code     = cod JavaScript: se citesc numai datele, fara comentarii
 *   text     = tot textul
 *   fixtures = cod cu date inventate: in plus, telefoanele si emailurile au forma rezervata
 */
export function privacyTargets(root) {
  const targets = [];
  const guideScripts = join(root, "scripts/guide");
  if (existsSync(guideScripts)) {
    for (const f of walk(guideScripts, [])) {
      if (!/\.(mjs|js|ts)$/.test(f)) continue;
      targets.push({ file: f, kind: /fixtures\.mjs$/.test(f) ? "fixtures" : "code" });
    }
  }
  const scriptsDir = join(root, "scripts");
  for (const name of readdirSync(scriptsDir).sort()) {
    if (/^seed-test-.*\.mjs$/.test(name)) targets.push({ file: join(scriptsDir, name), kind: "code" });
  }
  const content = join(root, "content/guide");
  if (existsSync(content)) {
    for (const f of walk(content, []).sort()) if (f.endsWith(".md")) targets.push({ file: f, kind: "text" });
  }
  const manifest = join(root, "docs/guide/screenshots.json");
  if (existsSync(manifest)) targets.push({ file: manifest, kind: "text" });
  return targets;
}

/** Verifica fisierele. Intoarce { problems, scanned }. */
export function checkPrivacy(root, names) {
  const problems = [];
  const targets = privacyTargets(root);
  for (const t of targets) {
    const raw = readFileSync(t.file, "utf8");
    const text = t.kind === "text" ? raw : stripJsComments(raw);
    const rel = relative(root, t.file);
    for (const hit of findNames(text, names)) {
      problems.push(`${rel}:${hit.line}: apare "${hit.name}", care este pe lista docs/guide/real-names.txt`);
    }
    if (t.kind === "fixtures") {
      for (const p of contactShapeProblems(text)) problems.push(`${rel}: ${p}`);
    }
  }
  return { problems, scanned: targets.map((t) => relative(root, t.file)) };
}
