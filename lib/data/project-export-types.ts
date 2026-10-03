// P3-128. EXPORTUL PROIECTELOR: tipurile si scriitorul fisierului, fara nimic de server.
//
// ACELASI ANTET CA MODELUL DE IMPORT, NU A DOUA LISTA. `projectModelHeaders` citeste primul
// rand al lui `templateCsv` din project-import-types.ts, deci o schimbare a sablonului muta
// si exportul. Randurile se scriu prin `buildCsv`, scriitorul comun din import-shared.ts
// (cardul P3-121), cu BOM si cu ghilimelele puse de acelasi cod ca la sablon.
//
// CLIENTUL SE SCRIE DUPA DENUMIRE, NICIODATA DUPA ID. Importul potriveste celula Client cu
// denumirea clientului (clientNameKey, project-import-plan.ts), iar un nume necunoscut este
// eroare de rand. Un fisier cu id-uri ar arata bine si ar cadea pe fiecare rand.
//
// NICIO MONEDA, NICIO UNITATE: sablonul nu le are (public.projects tine numai budget_mdl),
// iar bugetul se scrie in MDL, forma pe care o citeste importul.

import {
  PROJECT_TEMPLATE_FIELDS,
  IMPORT_MAX_ROWS,
  buildCsv,
  parseCsv,
  templateCsv,
  type ProjectImportField,
} from "./project-import-types";

export const PROJECT_EXPORT_FILE_NAME = "proiecte.csv";

/** Antetul sablonului de proiecte, exact cum il scrie `templateCsv`: aceleasi etichete,
 *  aceeasi ordine, Client si Denumire cu asterisc. */
export function projectModelHeaders(): string[] {
  return parseCsv(templateCsv())[0] ?? [];
}

/** Un proiect gata de scris in fisier: fiecare camp ca text, sub aceleasi chei ca importul.
 *  Starea este deja eticheta romaneasca, clientul este denumirea lui. */
export type ExportProjectRow = Record<Exclude<ProjectImportField, "currency">, string>;

/** Fisierul exportului: antetul modelului, apoi cate un rand pe proiect, coloanele in
 *  ordinea sablonului. */
export function projectExportCsv(projects: ExportProjectRow[]): string {
  return buildCsv([
    projectModelHeaders(),
    ...projects.map((project) => PROJECT_TEMPLATE_FIELDS.map((field) => project[field])),
  ]);
}

/** Propozitia de dupa un export taiat la limita. */
export function projectExportTruncatedNotice(total: number): string {
  return (
    `Filtrul are ${total} de rânduri, dar fișierul poate avea cel mult ${IMPORT_MAX_ROWS}. ` +
    `Am exportat primele ${IMPORT_MAX_ROWS}. Restrânge filtrul și exportă din nou pentru restul.`
  );
}
