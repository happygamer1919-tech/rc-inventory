// P3-321. Ghidul citit pentru un rol, pe server. Singurul loc din aplicatie care stie unde
// sta sursa (content/guide) si unde stau pozele (content/guide-images).
//
// Calea pleaca de la process.cwd(), ca lib/pdf/invoice-pdf.ts, iar fisierele ajung in
// functia serverless prin outputFileTracingIncludes din next.config.ts: fara randul acela
// ghidul ar fi gol in productie desi build-ul local merge.
//
// Nu se tine nimic minte intre cereri: 50 de fisiere mici, citite o data pe cerere, si o
// lectie schimbata se vede imediat. Nu se scrie nimic si nu se retine cine ce a citit.

import { readFileSync } from "node:fs";
import path from "node:path";
// De la parse.mjs si NU de la source.mjs: acela mai are un cititor care umbla prin tot codul
// (readAppSourceText), iar Turbopack ar pune tot proiectul in functia serverless.
import { faqForRole, loadFaq } from "./faq.mjs";
import { loadGuide } from "./parse.mjs";
import { GUIDE_IMAGE_NAME, guideForRole } from "./view.mjs";

const GUIDE_DIR = path.join(process.cwd(), "content", "guide");
const FAQ_FILE = path.join(GUIDE_DIR, "faq.md");

/**
 * Dosarul cu pozele lectiilor, cel pe care il citeste lessonPictures. P3-328: nu mai e in
 * public/, deci nu se serveste direct; ruta /api/guide/poza le da numai celor conectati.
 */
export const GUIDE_IMAGES_DIR = path.join(process.cwd(), "content", "guide-images");

/**
 * Poza `name` (<id>-desktop sau <id>-mobile) daca apartine unei lectii pe care `role` o vede,
 * altfel null. O poza a unei lectii numai pentru administrator nu exista pentru operator.
 */
export function readGuideImage(role: string | null | undefined, name: string): Buffer | null {
  const m = GUIDE_IMAGE_NAME.exec(name);
  if (!m) return null;
  const allowed = readGuideFor(role).flat.some((e) => {
    const shots = e.lesson.screenshots;
    return Array.isArray(shots) && shots[0] === m[1];
  });
  if (!allowed) return null;
  try {
    return readFileSync(path.join(GUIDE_IMAGES_DIR, `${name}.png`));
  } catch {
    return null;
  }
}

/** Ghidul asa cum il vede `role`. Un rol necunoscut (sau lipsa) primeste un ghid gol. */
export function readGuideFor(role: string | null | undefined) {
  return guideForRole(loadGuide(GUIDE_DIR), role ?? "");
}

/** Intrebarile frecvente ale unui rol: numai cele a caror lectie o vede si el. */
export function readFaqFor(role: string | null | undefined) {
  return faqForRole(loadFaq(FAQ_FILE), readGuideFor(role).flat);
}
