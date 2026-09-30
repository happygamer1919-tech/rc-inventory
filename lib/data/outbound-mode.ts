// Cele doua moduri de iesire, si validatorul pe care le trece amandoua.
//
// Cardul P3-118, hotararea R-215. Iesirea are de acum doua feluri: catre un
// PROIECT, exact ce a fost dintotdeauna, si catre un CLIENT DIRECT care ridica
// materialul de la depozit fara niciun proiect in spate.
//
// DE CE UN MODUL SEPARAT SI NU CATEVA LINII IN outbound-actions.ts. Fisierul
// acela este marcat "use server", deci nu poate exporta decat functii async si nu
// poate fi importat de un test care il cheama direct. Acceptanta (d) a cardului
// cere ca fiecare din cele NOUA unitati sa fie primita si ca modulul sa nu aiba
// nicio lista proprie de unitati, iar asta se dovedeste citind chiar acest
// fisier. Un modul curat, fara nimic de server, este singura forma in care
// dovada se poate face.
//
// NU EXISTA NICIO LISTA DE UNITATI AICI, SI NU ESTE O SCAPARE, ESTE REGULA.
// Deviatia D3 si corectarea intai a hotararii R-215: lib/data/units.ts are noua
// unitati de la migratia 0030 incoace, cererea lui Ivan enumera sapte, si nicio
// unitate nu se scoate. Validarea intreaba isUnitCode, care citeste ALL_UNITS,
// deci unitatea urmatoare este primita peste tot dintr-o data si nu exista o a
// doua copie a raspunsului care sa se poata abate de la prima.
//
// DATA RIDICARII: SINGURA AUTORITATE ASUPRA EI ESTE BAZA DE DATE. Aici se cere
// doar sa fie scrisa. Daca ziua nu exista in calendar, coloana `date` din
// PostgreSQL o refuza, iar lib/data/outbound-actions.ts traduce refuzul intr-o
// propozitie romaneasca. O a doua verificare de calendar scrisa aici ar fi exact
// tiparul pe care acest depozit l-a mai plata: doua rutine care trebuie sa fie
// de acord pentru totdeauna.

import { isUnitCode } from "./units";
import type { NewIssueInput, OutboundMode } from "./outbound-types";

/** Tokenurile stocate, englezesti, P2-01. Etichetele romanesti sunt ale
 *  cardurilor P3-119 si P3-120 si nu se scriu aici. */
export const ALL_OUTBOUND_MODES: OutboundMode[] = ["project", "direct_client"];

export function isOutboundMode(value: unknown): value is OutboundMode {
  return typeof value === "string" && (ALL_OUTBOUND_MODES as string[]).includes(value);
}

/** Unitatea trimisa pe o poziție este primita? Intrebarea merge la units.ts si
 *  nicaieri altundeva. */
export function acceptsUnit(unit: string): boolean {
  return isUnitCode(unit);
}

/** Un refuz, cu propozitia romaneasca si campul pe care se aseaza pe ecran. */
export type ModeRefusal = { message: string; field?: string };

/**
 * PROPOZITIILE DE REFUZ, O SINGURA COPIE FIECARE. Cardul P3-119 clauza 6.
 *
 * DE CE SUNT SCOASE DIN validateNewIssue. Ecranul si aceasta functie spun acelasi
 * lucru operatorului, si cardul cere anume ca AMANDOUA refuzurile sa existe: "the
 * screen tells the operator, the constraint protects every other caller". Formularul
 * are insa nevoie de ele pe rand, ca sa le poata numi pe AMANDOUA cand amandoua
 * lipsesc, iar validateNewIssue intoarce numai primul refuz. Scrise de doua ori, o
 * corectare de text ar fi mutat o propozitie si ar fi lasat-o pe cealalta: doua
 * mesaje care descriu aceeasi lipsa in cuvinte diferite sunt chiar defectul pe care
 * cardurile P3-61 si P3-98 l-au ridicat.
 */
export const ISSUE_REFUSAL = {
  mode: "Alege tipul ieșirii: proiect sau client direct.",
  project: "Alege proiectul.",
  client: "Alege clientul care ridică materialele.",
  pickupDate: "Alege data ridicării materialelor.",
  unknownUnit: "Unitatea de măsură a unei poziții nu este cunoscută.",
} as const;

/**
 * Ce cere fiecare mod, verificat inainte de a se trimite cererea.
 *
 * REFUZUL DE AICI NU INLOCUIESTE RESTRICTIILE DIN BAZA, si asta este proiectarea
 * si nu o dublare: ecranul si aceasta functie spun OPERATORULUI ce lipseste, iar
 * outbound_issues_project_mode_shape si outbound_issues_direct_client_mode_shape
 * din migratia 0067 apara toti ceilalti apelanti. Un formular este un apelant;
 * baza de date este toti.
 *
 * Intoarce null cand intrarea este intreaga.
 */
export function validateNewIssue(input: NewIssueInput): ModeRefusal | null {
  const mode: OutboundMode = input.mode ?? "project";
  if (!isOutboundMode(mode)) return { message: ISSUE_REFUSAL.mode, field: "mode" };

  if (mode === "project") {
    if ((input.projectId ?? "").trim() === "")
      return { message: ISSUE_REFUSAL.project, field: "projectId" };
  } else {
    if ((input.clientId ?? "").trim() === "")
      return { message: ISSUE_REFUSAL.client, field: "clientId" };
    if ((input.pickupDate ?? "").trim() === "")
      return { message: ISSUE_REFUSAL.pickupDate, field: "pickupDate" };
  }

  // Unitatea este optionala pe intrare: ea traieste pe produs, in
  // products.unit, si ecranul o afiseaza de acolo. Cand un apelant o trimite
  // totusi, ea trebuie sa fie una dintre cele pe care units.ts le cunoaste.
  const unknown = input.lines.find((l) => l.unit !== undefined && !acceptsUnit(l.unit));
  if (unknown) return { message: ISSUE_REFUSAL.unknownUnit, field: "lines" };

  return null;
}
