#!/usr/bin/env node
// scripts/guide/screenshots.mjs
// Card P3-320. Pozele ghidului, facute de program, nu de mana.
//
// Pentru fiecare lectie cu `screen` in antet (content/guide, citit de
// lib/guide/source.mjs): intra in cont cu contul de test cerut, deschide ecranul,
// face pasii din `before`, gaseste elementele din `marks` dupa selector, deseneaza
// peste ecran chenarul, sageata si cercul cu numarul pasului in culoarea de accent
// (--color-rc-orange din app/globals.css) si salveaza doua poze:
//   public/guide/<id>-desktop.png   1440 lat
//   public/guide/<id>-mobile.png    390 lat (telefon)
// docs/guide/screenshots.json spune ce arata fiecare poza: adresa, marcajele gasite si
// lipsa, textul care era pe ecran (il citeste verificarea de confidentialitate) si
// amprenta sha256 a fisierului. O lectie al carei ecran nu se poate deschide, sau pe
// care nu se gaseste niciun marcaj, nu primeste poza si apare acolo la "skipped":
// pagina ei arata "fără imagine".
//
// NUMAI PE O COPIE DE TEST. Ruleaza in GitHub Actions
// (.github/workflows/guide-screenshots.yml) pe stiva locala Supabase umpluta de
// scripts/guide/seed.mjs cu date inventate. Refuza orice adresa care nu este
// localhost, pentru aplicatie si pentru Supabase, si ruleaza paza
// scripts/assert-not-prod.mjs inainte de orice. Nu scrie nimic in baza de date: pasii
// din `before` deschid formulare, nu le trimit.
//
// Mediu: GUIDE_BASE_URL (implicit http://localhost:3104), NEXT_PUBLIC_SUPABASE_URL,
// TEST_OWNER_EMAIL, TEST_OWNER_PASSWORD, TEST_MANAGER_EMAIL, TEST_MANAGER_PASSWORD
// (citite si din .env.local). GUIDE_ONLY=id1,id2 face numai acele lectii.
// Nicio valoare secreta nu este scrisa in jurnal.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { chromium } from "@playwright/test";
import { layoutMarks, overlaySvg, readAccent } from "../../lib/guide/annotate.mjs";
import { loadGuide, shotSpec } from "../../lib/guide/source.mjs";
import { resolvePlaceholders } from "./fixtures.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
nextEnv.loadEnvConfig(ROOT);

export const SIZES = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
// O poza nu creste peste atat, ca un ecran lung sa nu dea o poza cat un sul. Un
// marcaj de mai jos ramane in afara pozei si este trecut ca lipsa.
const MAX_HEIGHT = { desktop: 1600, mobile: 2000 };
const OUT_DIR = join(ROOT, "public/guide");
const MANIFEST = join(ROOT, "docs/guide/screenshots.json");
const BASE_URL = (process.env.GUIDE_BASE_URL ?? "http://localhost:3104").replace(/\/$/, "");

function fail(code, message) {
  console.error(`guide-screenshots: ${message}`);
  process.exit(code);
}

// ---------------------------------------------------------------------------
// Paza: numai localhost.
// ---------------------------------------------------------------------------
function assertLocal(name, value, required) {
  if (!value) {
    if (required) fail(2, `${name} lipseste`);
    return;
  }
  let host;
  try {
    host = new URL(value).hostname;
  } catch {
    fail(2, `${name} nu este o adresa`);
  }
  if (host !== "localhost" && host !== "127.0.0.1") {
    fail(2, `${name} arata spre ${host}. Pozele se fac numai pe o copie locala de test, niciodata pe productie.`);
  }
}
assertLocal("GUIDE_BASE_URL", BASE_URL, true);
assertLocal("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL, true);
assertLocal("SUPABASE_URL", process.env.SUPABASE_URL, false);
const guard = spawnSync(process.execPath, [join(ROOT, "scripts/assert-not-prod.mjs")], { stdio: "inherit" });
if (guard.status !== 0) fail(2, "scripts/assert-not-prod.mjs a refuzat");

function account(kind) {
  if (kind === "none") return null;
  const prefix = kind === "account_manager" ? "TEST_MANAGER" : "TEST_OWNER";
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) fail(2, `${prefix}_EMAIL sau ${prefix}_PASSWORD lipseste`);
  return { email, password };
}

function resolveSpec(spec) {
  const action = (a) => ({ ...a, selector: resolvePlaceholders(a.selector), value: a.value === null ? null : resolvePlaceholders(a.value) });
  return {
    ...spec,
    screen: resolvePlaceholders(spec.screen),
    before: spec.before.map(action),
    beforeMobile: spec.beforeMobile.map(action),
    marks: spec.marks.map((m) => ({ ...m, selector: resolvePlaceholders(m.selector) })),
  };
}

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(250);
}

// Fara animatii si fara cursor clipind: doua rulari pe acelasi ecran dau aceeasi poza.
const STILL_CSS = "*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}";

function visible(page, selector) {
  return page.locator(selector).filter({ visible: true }).first();
}

async function runAction(page, action) {
  const loc = visible(page, action.selector);
  if (action.verb === "click") await loc.click({ timeout: 8_000 });
  else if (action.verb === "wait") await loc.waitFor({ state: "visible", timeout: 10_000 });
  else if (action.verb === "fill") await loc.fill(action.value ?? "", { timeout: 8_000 });
  else if (action.verb === "select") await loc.selectOption({ label: action.value ?? "" }, { timeout: 8_000 });
  await settle(page);
}

async function rectOf(loc) {
  return loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
}

function short(err) {
  return String(err?.message ?? err).split("\n")[0].slice(0, 160);
}

async function signIn(context, who) {
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/autentificare`, { waitUntil: "load", timeout: 60_000 });
  await page.locator("#email").fill(who.email);
  await page.locator("#password").fill(who.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL((url) => new URL(url).pathname === "/", { timeout: 45_000 });
  await page.close();
}

async function shoot(context, spec, size, accent) {
  const page = await context.newPage();
  const path = spec.screen;
  const result = { id: spec.id, lesson: spec.lesson, size, path };
  try {
    const response = await page.goto(`${BASE_URL}${path}`, { waitUntil: "load", timeout: 45_000 });
    await page.addStyleTag({ content: STILL_CSS }).catch(() => {});
    await settle(page);
    const landed = new URL(page.url()).pathname;
    if (spec.account !== "none" && landed === "/autentificare") return { ...result, skipped: "ecranul a trimis la autentificare" };
    if (response && (response.status() === 404 || response.status() >= 500)) {
      return { ...result, skipped: `ecranul a raspuns ${response.status()}` };
    }
    const actions = [...spec.before, ...(size === "mobile" ? spec.beforeMobile : [])];
    for (const action of actions) {
      try {
        await runAction(page, action);
      } catch (err) {
        return { ...result, skipped: `pasul pregatitor "${action.verb} ${action.selector}" nu a mers: ${short(err)}` };
      }
    }
    await page.addStyleTag({ content: STILL_CSS }).catch(() => {});
    // Inapoi sus: fereastra si orice panou cu defilare proprie (aplicatia defileaza
    // in panoul ei, iar pasii pregatitori il pot lasa la jumatate).
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      for (const el of document.querySelectorAll("*")) if (el.scrollTop > 0) el.scrollTop = 0;
    });
    await settle(page);

    const marks = [];
    for (const m of spec.marks) {
      const loc = visible(page, m.selector);
      try {
        await loc.waitFor({ state: "visible", timeout: 4_000 });
        marks.push({ ...m, loc, found: true });
      } catch {
        marks.push({ ...m, loc: null, found: false, reason: "negasit pe ecran" });
      }
    }
    let found = marks.filter((m) => m.found);
    if (found.length === 0) return { ...result, skipped: "niciun marcaj gasit pe ecran", marks: marks.map(publicMark) };

    // Poza creste in jos cat sa cuprinda marcajele de sub marginea ferestrei.
    const base = SIZES[size];
    for (const m of found) m.rect = await rectOf(m.loc);
    const bottom = Math.max(...found.map((m) => m.rect.y + m.rect.height));
    if (bottom + 60 > base.height) {
      await page.setViewportSize({ width: base.width, height: Math.min(Math.ceil(bottom + 90), MAX_HEIGHT[size]) });
      await settle(page);
      for (const m of found) m.rect = await rectOf(m.loc);
      // Tot nu incape: pagina coboara pana intra ultimul marcaj. Aplicatia defileaza
      // in panoul ei, nu in fereastra, deci se cere elementului sa intre in vedere.
      // Marcajele de sus care ies astfel din poza sunt trecute ca lipsa, mai jos.
      const lowest = found.reduce((a, b) => (b.rect.y + b.rect.height > a.rect.y + a.rect.height ? b : a));
      if (lowest.rect.y + lowest.rect.height + 60 > MAX_HEIGHT[size]) {
        await lowest.loc.evaluate((el) => el.scrollIntoView({ block: "end" }));
        await settle(page);
        for (const m of found) m.rect = await rectOf(m.loc);
      }
    }
    const viewport = page.viewportSize();
    for (const m of found) {
      const r = m.rect;
      const usable = r.width > 0 && r.height > 0 && r.y >= 0 && r.x >= 0 && r.y + r.height <= viewport.height && r.x + r.width <= viewport.width + 1;
      if (!usable) {
        m.found = false;
        m.reason = "in afara pozei";
      }
    }
    found = marks.filter((m) => m.found);
    if (found.length === 0) return { ...result, skipped: "niciun marcaj in cadrul pozei", marks: marks.map(publicMark) };

    const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    // Butoanele si campurile vizibile: cercul nu se pune peste ele daca are alt loc.
    const obstacles = await page.evaluate(() =>
      [...document.querySelectorAll("button, a, input, select, textarea, [role='button']")]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height })),
    );
    const layout = layoutMarks(found.map((m) => ({ step: m.step, rect: m.rect })), viewport, obstacles);
    const svg = overlaySvg(layout, accent, viewport);
    await page.evaluate((markup) => {
      const layer = document.createElement("div");
      layer.id = "guide-annotations";
      layer.setAttribute("style", "position:fixed;inset:0;z-index:2147483647;pointer-events:none;");
      layer.innerHTML = markup;
      document.body.appendChild(layer);
    }, svg);
    const file = join(OUT_DIR, `${spec.id}-${size}.png`);
    await page.screenshot({ path: file, fullPage: false, animations: "disabled", caret: "hide" });
    const sha256 = createHash("sha256").update(readFileSync(file)).digest("hex");
    return {
      ...result,
      file: `public/guide/${spec.id}-${size}.png`,
      width: viewport.width,
      height: viewport.height,
      sha256,
      marks: marks.map(publicMark),
      text,
    };
  } catch (err) {
    return { ...result, skipped: `ecranul nu s-a putut deschide: ${short(err)}` };
  } finally {
    await page.close().catch(() => {});
  }
}

function publicMark(m) {
  return m.found ? { step: m.step, selector: m.selector, found: true } : { step: m.step, selector: m.selector, found: false, reason: m.reason };
}

async function main() {
  const accent = readAccent(readFileSync(join(ROOT, "app/globals.css"), "utf8"));
  const guide = loadGuide(join(ROOT, "content/guide"));
  if (guide.problems.length > 0) fail(1, `content/guide nu se poate citi: ${guide.problems.join("; ")}`);
  const chapterOrder = new Map(guide.chapters.map((c) => [c.id, c.order]));
  const only = (process.env.GUIDE_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const lessons = [...guide.lessons]
    .filter((l) => only.length === 0 || only.includes(l.id))
    .sort((a, b) => chapterOrder.get(a.chapter) - chapterOrder.get(b.chapter) || a.order - b.order);

  mkdirSync(OUT_DIR, { recursive: true });
  if (only.length === 0) {
    // O lectie care si-a pierdut poza nu pastreaza poza veche.
    for (const name of readdirSync(OUT_DIR)) {
      if (/-(desktop|mobile)\.png$/.test(name)) rmSync(join(OUT_DIR, name));
    }
  }

  const browser = await chromium.launch();
  const contexts = new Map();
  async function contextFor(kind, size) {
    const key = `${kind}:${size}`;
    if (contexts.has(key)) return contexts.get(key);
    const s = SIZES[size];
    const context = await browser.newContext({
      viewport: { width: s.width, height: s.height },
      deviceScaleFactor: s.deviceScaleFactor,
      isMobile: s.isMobile,
      hasTouch: s.hasTouch,
      locale: "ro-RO",
      timezoneId: "Europe/Chisinau",
      reducedMotion: "reduce",
    });
    const who = account(kind);
    if (who) {
      try {
        await signIn(context, who);
      } catch (err) {
        fail(1, `intrarea in cont (${kind}, ${size}) nu a mers: ${short(err)}`);
      }
    }
    contexts.set(key, context);
    return context;
  }

  const images = [];
  const skipped = [];
  for (const lesson of lessons) {
    const raw = shotSpec(lesson);
    const spec = raw ? resolveSpec(raw) : null;
    if (!spec) {
      for (const size of Object.keys(SIZES)) skipped.push({ id: String(lesson.screenshots?.[0] ?? lesson.id), lesson: lesson.id, size, skipped: "lectia nu are screen in antet" });
      continue;
    }
    for (const size of Object.keys(SIZES)) {
      if (!spec.sizes.includes(size)) {
        skipped.push({ id: spec.id, lesson: spec.lesson, size, skipped: "marime nefolosita de lectie (sizes)" });
        continue;
      }
      const context = await contextFor(spec.account, size);
      const r = await shoot(context, spec, size, accent);
      if (r.skipped) {
        skipped.push(r);
        console.log(`  fara poza  ${spec.id} ${size}: ${r.skipped}`);
      } else {
        images.push(r);
        const missing = r.marks.filter((m) => !m.found).map((m) => m.step);
        console.log(`  poza       ${r.file} ${r.width}x${r.height}${missing.length ? ` (marcaje lipsa: pasii ${missing.join(", ")})` : ""}`);
      }
    }
  }
  await browser.close();

  const manifest = {
    card: "P3-320",
    note: "Scris de scripts/guide/screenshots.mjs. Nu se editeaza de mana. Textul fiecarei poze il citeste npm run check:guide-privacy.",
    generated_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    commit: process.env.GITHUB_SHA ?? null,
    accent,
    sizes: Object.fromEntries(Object.entries(SIZES).map(([k, v]) => [k, { width: v.width, height: v.height, device_scale_factor: v.deviceScaleFactor }])),
    images,
    skipped,
  };
  if (only.length === 0) {
    mkdirSync(dirname(MANIFEST), { recursive: true });
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  }

  const summary = [
    `Poze ghid: ${images.length} facute, ${skipped.length} fara poza.`,
    "",
    ...skipped.map((s) => `- ${s.id} (${s.size}): ${s.skipped}`),
  ].join("\n");
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY && existsSync(dirname(process.env.GITHUB_STEP_SUMMARY))) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n", { flag: "a" });
  }
  // O rulare care nu face nicio poza nu a dovedit nimic.
  if (images.length === 0) fail(1, "nicio poza facuta");
}

main().catch((err) => fail(1, short(err)));
