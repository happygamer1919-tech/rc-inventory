// P3-321. Ghidul citit pentru un rol, pe server. Singurul loc din aplicatie care stie unde
// sta sursa (content/guide) si unde stau pozele (public/guide).
//
// Calea pleaca de la process.cwd(), ca lib/pdf/invoice-pdf.ts, iar fisierele ajung in
// functia serverless prin outputFileTracingIncludes din next.config.ts: fara randul acela
// ghidul ar fi gol in productie desi build-ul local merge.
//
// Nu se tine nimic minte intre cereri: 50 de fisiere mici, citite o data pe cerere, si o
// lectie schimbata se vede imediat. Nu se scrie nimic si nu se retine cine ce a citit.

import path from "node:path";
// De la parse.mjs si NU de la source.mjs: acela mai are un cititor care umbla prin tot codul
// (readAppSourceText), iar Turbopack ar pune tot proiectul in functia serverless.
import { loadGuide } from "./parse.mjs";
import { guideForRole } from "./view.mjs";

const GUIDE_DIR = path.join(process.cwd(), "content", "guide");

/** Dosarul cu pozele lectiilor, cel pe care il citeste lessonPictures. */
export const PUBLIC_GUIDE_DIR = path.join(process.cwd(), "public", "guide");

/** Ghidul asa cum il vede `role`. Un rol necunoscut (sau lipsa) primeste un ghid gol. */
export function readGuideFor(role: string | null | undefined) {
  return guideForRole(loadGuide(GUIDE_DIR), role ?? "");
}
