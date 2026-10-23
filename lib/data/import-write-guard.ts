// P3-338. A RAND NOU SE VERIFICA DIN NOU LA SCRIERE, PE SERVER, SUB BLOCAJ.
//
// Planul se calculeaza dintr-o citire a clientilor facuta INAINTE de scriere, iar
// blocajul "un import pe fel" din ecran sta in browser (lib/import-lock.ts): doi
// administratori cu fisiere care se suprapun, sau unul pe doua calculatoare, citesc
// amandoi "nu exista" si amandoi scriu. Functia import_insert_client din migratia
// 0091 face intr-o singura tranzactie ce nu se poate face din doua cereri: ia un
// blocaj, cauta un client stocat cu aceleasi chei ca ale planului, si scrie randul
// numai daca nu gaseste niciunul.
//
// Fisierul acesta are doar cheile (aceleasi functii ca planurile, nu o copie), forma
// raspunsului si propozitia pe care o vede operatorul. Fara "use server": nu este o
// actiune, este un ajutor al actiunilor.

import { nameKey, phoneKey } from "./client-import-plan";
import { normaliseEmail } from "./client-import-types";
import { normalisePhone } from "./lead-import-types";

/** Cheile de dublare ale unui rand, cum le asteapta functia din baza. Fiecare cheie lipsa
 *  este null si nu se foloseste. */
export type ImportGuardKeys = {
  email: string | null;
  /** Numele si ultimele 8 cifre ale telefonului, cheia a doua a importului de clienti. */
  name: string | null;
  phone: string | null;
  /** Telefonul singur, cheia a doua a importului de leaduri: formele de cifre ale
   *  numarului canonic, ca un telefon stocat in alt format sa fie recunoscut. */
  phoneForms: string[] | null;
};

/** Ce spune baza despre un rand pe care l-ar dubla: cu cine s-ar potrivi. */
export type WriteDuplicate = {
  id: string;
  name: string;
  inactive: boolean;
  by: "email" | "phone" | "namePhone";
};

/** Cheile importului de clienti: aceleasi ca in client-import-plan.ts. */
export function clientGuardKeys(row: { name: string; email: string; phone: string }): ImportGuardKeys {
  const name = nameKey(row.name);
  return {
    email: normaliseEmail(row.email),
    name: name === "" ? null : name,
    phone: phoneKey(row.phone),
    phoneForms: null,
  };
}

/** Formele de cifre pe care le poate avea in baza un numar canonic (+373 sau +40 sau strain):
 *  cu prefixul de tara, cu zero in loc de prefix, sau doar numarul local. */
function phoneForms(canonical: string): string[] {
  const digits = canonical.replace(/\D/g, "");
  for (const prefix of ["373", "40"]) {
    if (digits.startsWith(prefix)) {
      const local = digits.slice(prefix.length);
      return [digits, `0${local}`, local];
    }
  }
  return [digits];
}

/** Cheile importului de leaduri: aceleasi ca in lead-import-plan.ts, emailul sau telefonul. */
export function leadGuardKeys(row: { email: string; phone: string }): ImportGuardKeys {
  const phone = normalisePhone(row.phone);
  return {
    email: normaliseEmail(row.email),
    name: null,
    phone: null,
    phoneForms: phone === null ? null : phoneForms(phone),
  };
}

/** Raspunsul functiei, citit cu grija: o forma neasteptata nu se ia drept succes. */
export function readGuardAnswer(
  data: unknown,
): { kind: "inserted"; id: string } | { kind: "duplicate"; duplicate: WriteDuplicate } | null {
  if (typeof data !== "object" || data === null) return null;
  const answer = data as { id?: unknown; duplicate?: Record<string, unknown> };
  if (typeof answer.id === "string") return { kind: "inserted", id: answer.id };
  const found = answer.duplicate;
  if (found && typeof found.id === "string") {
    const by = found.by === "email" || found.by === "phone" ? found.by : "namePhone";
    return {
      kind: "duplicate",
      duplicate: {
        id: found.id,
        name: typeof found.name === "string" ? found.name : "",
        inactive: found.active === false,
        by,
      },
    };
  }
  return null;
}

/** Propozitia din fisierul randurilor nepreluate. Incepe cu "Dublat": randul nu s-a scris. */
export function writeDuplicateReason(duplicate: WriteDuplicate): string {
  if (duplicate.inactive)
    return `Dublat găsit la scriere. Există deja ca client dezactivat: ${duplicate.name}. Reactivați-l din fișa clientului înainte de import.`;
  const how =
    duplicate.by === "email" ? "email" : duplicate.by === "phone" ? "telefon" : "nume și telefon";
  return `Dublat găsit la scriere, după ${how}, cu "${duplicate.name}", care există deja.`;
}
