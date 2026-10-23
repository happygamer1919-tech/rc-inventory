import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { globalAllowedWords, judgePicture, nameLikeWords, sha256Of } from "../../lib/guide/ocr.mjs";

// P3-339. Pozele ghidului sunt citite din pixeli. Primele teste nu folosesc OCR (judecata
// pe un text dat); ultimul ruleaza verificarea reala pe o poza reala, cu tesseract.

const REPO = join(__dirname, "..", "..");

test("P3-339: a deny list name in the text read from a picture is denied, with diacritics and case ignored", () => {
  const verdict = judgePicture({
    ocrText: "Client\nȘtefan POPESCU SRL\nTelefon",
    denyNames: ["Ștefan Popescu", "Ivan"],
    allowedWords: new Set(["client", "telefon"]),
  });
  expect(verdict.denied).toEqual(["Ștefan Popescu"]);
});

test("P3-339: a capitalised word that is not invented data, not a label and not on screen is an unknown name", () => {
  const allowed = new Set(["client", "salveaza", "exemplu"]);
  const verdict = judgePicture({
    ocrText: "Client Exemplu Salvează Vasilescu Adresa",
    denyNames: ["Ivan"],
    allowedWords: allowed,
    screenText: "Adresa",
  });
  expect(verdict.denied).toEqual([]);
  expect(verdict.unknown).toEqual(["vasilescu"]);
});

test("P3-339: only capitalised words of four letters or more look like names", () => {
  expect(nameLikeWords("Ion cumpara Pavel si Maria din Chișinău, SRL, Aa")).toEqual(["pavel", "maria", "chisinau"]);
});

test("P3-339: the allowed words come from the invented data, the lessons and the allow file", () => {
  const allowed = globalAllowedWords(REPO);
  expect(allowed.has("exemplu")).toBe(true); // scripts/guide/fixtures.mjs
  expect(allowed.has("administrator")).toBe(true); // docs/guide/ocr-allow.txt
  expect(allowed.size).toBeGreaterThan(100);
});

test("P3-339: the sha256 key changes with the picture", () => {
  expect(sha256Of(Buffer.from("a"))).not.toBe(sha256Of(Buffer.from("b")));
  expect(sha256Of(Buffer.from("a"))).toHaveLength(64);
});

test("P3-339: the check reads the pixels of a real picture, fails on a deny list name in it and passes without it", () => {
  test.setTimeout(300_000);
  const root = mkdtempSync(join(tmpdir(), "guide-ocr-"));
  mkdirSync(join(root, "content/guide-images"), { recursive: true });
  mkdirSync(join(root, "docs/guide"), { recursive: true });
  // The login screen: "Autentificare" is printed in it, and no manifest says so.
  copyFileSync(join(REPO, "content/guide-images/intra-in-cont-desktop.png"), join(root, "content/guide-images/intra-in-cont-desktop.png"));
  const run = (deny: string) => {
    writeFileSync(join(root, "docs/guide/real-names.txt"), `# test\n${deny}\n`);
    return spawnSync("node", [join(REPO, "scripts/poc-free/check-guide-ocr.mjs")], {
      env: { ...process.env, GUIDE_OCR_ROOT: root, GUIDE_OCR_CACHE: join(REPO, ".cache/guide-ocr"), GITHUB_STEP_SUMMARY: "" },
      encoding: "utf8",
    });
  };
  const hit = run("Autentificare");
  expect(hit.status, hit.stdout + hit.stderr).toBe(1);
  expect(hit.stderr).toContain('in poza apare "Autentificare"');
  const clean = run("Zzyxqvort");
  expect(clean.status, clean.stdout + clean.stderr).toBe(0);
  expect(clean.stdout).toContain("check-guide-ocr: ok");
});
