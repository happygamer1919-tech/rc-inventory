// P3-127. EXPORTUL CLIENTILOR: tipurile si scriitorul fisierului, fara nimic de server.
//
// ACELASI ANTET CA MODELUL DE IMPORT, NU A DOUA LISTA. `clientModelHeaders` citeste primul
// rand al lui `templateCsv` din client-import-types.ts, deci o schimbare a sablonului muta
// si exportul. Randurile se scriu prin `buildCsv`, scriitorul comun din import-shared.ts
// (cardul P3-121), cu BOM si cu ghilimelele puse de acelasi cod ca la sablon.
//
// NICIO COLOANA DE PERSOANA DE CONTACT, NICIO MONEDA, NICIO UNITATE: modelul de import al
// clientilor nu le are, iar un fisier exportat trebuie sa se reimporte fara nicio potrivire.

import {
  CLIENT_IMPORT_FIELDS,
  IMPORT_MAX_ROWS,
  buildCsv,
  parseCsv,
  templateCsv,
  type ClientImportField,
} from "./client-import-types";
import { csvText } from "./import-shared";

export const CLIENT_EXPORT_FILE_NAME = "clienti.csv";

/** Antetul sablonului de clienti, exact cum il scrie `templateCsv`: aceleasi etichete,
 *  aceeasi ordine, Denumire cu asterisc. */
export function clientModelHeaders(): string[] {
  return parseCsv(templateCsv())[0] ?? [];
}

/** Un client gata de scris in fisier: fiecare camp ca text, sub aceleasi chei ca importul.
 *  Tipul, etapa si sursa sunt deja etichetele romanesti. */
export type ExportClientRow = Record<ClientImportField, string>;

/** Fisierul exportului: antetul modelului, apoi cate un rand pe client, coloanele in
 *  ordinea `CLIENT_IMPORT_FIELDS`. */
export function clientExportCsv(clients: ExportClientRow[]): string {
  return buildCsv([
    clientModelHeaders(),
    ...clients.map((client) =>
      CLIENT_IMPORT_FIELDS.map((field) =>
        field === "phone" || field === "fiscalCode" ? csvText(client[field]) : client[field],
      ),
    ),
  ]);
}

/** Propozitia de dupa un export taiat la limita. */
export function clientExportTruncatedNotice(total: number): string {
  return (
    `Filtrul are ${total} de rânduri, dar fișierul poate avea cel mult ${IMPORT_MAX_ROWS}. ` +
    `Am exportat primele ${IMPORT_MAX_ROWS}. Restrânge filtrul și exportă din nou pentru restul.`
  );
}
