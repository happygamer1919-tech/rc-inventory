// P3-128. EXPORTUL PROIECTELOR: tipurile si scriitorul fisierului, fara nimic de server.
//
// ACELASI ANTET CA MODELUL DE IMPORT, NU A DOUA LISTA. `projectModelHeaders` citeste primul
// rand al lui `templateCsv` din project-import-types.ts, deci o schimbare a sablonului muta
// si exportul. Randurile se scriu prin `buildCsv`, scriitorul comun din import-shared.ts
// (cardul P3-121), cu BOM si cu ghilimelele puse de acelasi cod ca la sablon.
//
// CLIENTUL SE SCRIE DUPA DENUMIRE, IN COLOANA Client, SI DUPA ID, IN COLOANA DE LA COADA.
// Celula Client ramane denumirea (fisierele vechi si cele scrise de mana o potrivesc dupa
// nume), iar coloana "Identificator client" poarta id-ul: importul il potriveste PRIMUL, deci
// doi clienti cu aceeasi denumire sau un client dezactivat se reimporta fara eroare.
//
// NICIO MONEDA, NICIO UNITATE: sablonul nu le are (public.projects tine numai budget_mdl),
// iar bugetul se scrie in MDL, forma pe care o citeste importul.

import {
  PROJECT_IMPORT_FIELD_LABEL,
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

/** Antetul exportului: cel al modelului, neschimbat, apoi la coada identificatorul clientului. */
export function projectExportHeaders(): string[] {
  return [...projectModelHeaders(), PROJECT_IMPORT_FIELD_LABEL.clientId];
}

/** Un proiect gata de scris in fisier: fiecare camp ca text, sub aceleasi chei ca importul.
 *  Starea este deja eticheta romaneasca, clientul este denumirea lui, iar `clientId` este
 *  identificatorul lui (importul il potriveste inaintea denumirii). */
export type ExportProjectRow = Record<Exclude<ProjectImportField, "currency">, string>;

/** Fisierul exportului: antetul modelului plus identificatorul clientului la coada, apoi cate
 *  un rand pe proiect, coloanele in ordinea sablonului. */
export function projectExportCsv(projects: ExportProjectRow[]): string {
  return buildCsv([
    projectExportHeaders(),
    ...projects.map((project) => [
      ...PROJECT_TEMPLATE_FIELDS.map((field) => project[field]),
      project.clientId,
    ]),
  ]);
}

/** Propozitia de dupa un export taiat la limita. */
export function projectExportTruncatedNotice(total: number): string {
  return (
    `Filtrul are ${total} de rânduri, dar fișierul poate avea cel mult ${IMPORT_MAX_ROWS}. ` +
    `Am exportat primele ${IMPORT_MAX_ROWS}. Restrânge filtrul și exportă din nou pentru restul.`
  );
}
