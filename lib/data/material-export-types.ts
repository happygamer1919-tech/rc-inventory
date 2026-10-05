// P3-129. EXPORTUL MATERIALELOR: tipurile si scriitorul fisierului, fara nimic de server.
//
// ACELASI ANTET CA MODELUL DE IMPORT, NU A DOUA LISTA. `materialModelHeaders` citeste primul
// rand al lui `templateCsv` din material-import-types.ts, deci o schimbare a sablonului muta
// si exportul. Randurile se scriu prin `buildCsv`, scriitorul comun din import-shared.ts
// (cardul P3-121), cu BOM si cu ghilimelele puse de acelasi cod ca la sablon.
//
// UNITATEA SE SCRIE IN FORMA DIN RANDUL EXEMPLU AL MODELULUI: eticheta de pe ecran (buc, m²).
// Importul accepta si codul si eticheta (readUnit); modelul scrie eticheta, deci aceea este
// autoritatea. Nicio conversie, nicio lista de unitati scrisa aici: eticheta vine din
// `unitLabel`, adica din units.ts.
//
// NICIO COLOANA DE STOC. Stocul se calculeaza din loturi si nu are contor stocat; importul de
// materiale nu are camp de stoc. Un fisier cu o coloana de cantitate ar parea ca poate seta un
// stoc, iar importul ar ignora-o: cel mai convingator numar gresit posibil. Pragul (Prag
// recomandă) este o valoare de prag, nu un stoc, si se scrie.
//
// CATEGORIA SE SCRIE DUPA DENUMIRE, forma pe care o potriveste importul (buildCategoryLookup).

import {
  IMPORT_MAX_ROWS,
  MATERIAL_TEMPLATE_FIELDS,
  buildCsv,
  parseCsv,
  templateCsv,
  type MaterialImportField,
} from "./material-import-types";
import { formatCsvNumber } from "./import-shared";

export const MATERIAL_EXPORT_FILE_NAME = "materiale.csv";

/** Antetul sablonului de materiale, exact cum il scrie `templateCsv`: aceleasi etichete,
 *  aceeasi ordine, Cod SKU, Denumire, Categorie si Unitate de măsură cu asterisc. */
export function materialModelHeaders(): string[] {
  return parseCsv(templateCsv())[0] ?? [];
}

/** Un material gata de scris in fisier: fiecare camp ca text, sub aceleasi chei ca importul.
 *  Categoria este denumirea ei, unitatea este eticheta de pe ecran. */
export type ExportMaterialRow = Record<Exclude<MaterialImportField, "currency">, string>;

/** Un numar din baza, ca text pe care il citeste `readNumber` din import: cifre si virgula
 *  zecimala (12,5), fara notatie stiintifica. Coloanele sunt numeric(14,3) si numeric(14,2). */
export function exportNumber(value: number): string {
  return formatCsvNumber(value);
}

/** Fisierul exportului: antetul modelului, apoi cate un rand pe material, coloanele in
 *  ordinea sablonului. */
export function materialExportCsv(materials: ExportMaterialRow[]): string {
  return buildCsv([
    materialModelHeaders(),
    ...materials.map((material) => MATERIAL_TEMPLATE_FIELDS.map((field) => material[field])),
  ]);
}

/** Propozitia de dupa un export taiat la limita. */
export function materialExportTruncatedNotice(total: number): string {
  return (
    `Filtrul are ${total} de rânduri, dar fișierul poate avea cel mult ${IMPORT_MAX_ROWS}. ` +
    `Am exportat primele ${IMPORT_MAX_ROWS}. Restrânge filtrul și exportă din nou pentru restul.`
  );
}
