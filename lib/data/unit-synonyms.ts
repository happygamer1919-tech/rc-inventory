// Ce scrie pe documentul furnizorului, si ce unitate a noastra inseamna.
//
// Card P3-102, constatarea F23 a lui Ivan, tinta G59. Observata in productie pe
// 2026-09-24, pe confirmarea unei comenzi MPC: UM `set` (Șurub autoforant, cutie
// 1000 buc) si `litri` (Diluant nitro) nu se mapeaza, deci lista de selectie arata
// "Alege unitatea" cu "Pe document: set" dedesubt, iar operatorul completeaza de
// mana un lucru pe care documentul il spune raspicat.
//
// UN SINONIM REDENUMESTE O UNITATE, NU INMULTESTE NICIODATA O CANTITATE. Antetul
// migratiei 0030 o scrie cu majuscule, "NICIO CONVERSIE NU ESTE INTRODUSA AICI SAU
// ORIUNDE", si aici este aceeasi regula. `litri` inseamna unitatea `l`; nu inseamna
// ca un litru este un kilogram si nici ca o cutie este o mie de bucati. Nu exista
// factor nicaieri in acest fisier si nici in tabela pe care o insoteste, si asta
// este o proprietate, nu o lipsa: cine adauga vreodata o conversie o adauga cu un
// card care spune ce se intampla cu cantitatile deja stocate.
//
// `l` EXISTA DEJA, de la migratia 0030. Diluant nitro nu a fost niciodata o unitate
// lipsa, a fost un SINONIM lipsa, iar harta de mai jos este intreg leacul lui.
// `set` nu exista si se adauga, prin 0061 si 0062.
//
// `cutie` NU ESTE IN HARTA, DELIBERAT. Tinta G59 pomeneste cuvantul fara sa il
// treaca printre unitatile de creat, iar o unitate nascuta dintr-o pomenire in
// trecere este o unitate prin care se citeste de acum inainte fiecare cantitate.
// Cuvantul ramane nemapat, ia calea "acest cuvant nu se mapeaza", si alegerea
// operatorului pentru el se tine minte pe furnizor prin 0063.
//
// FISIERUL NU ATINGE BAZA DE DATE, deci il poate importa si un component de client.
// Tinerea de minte pe furnizor, care are nevoie de baza, sta in
// lib/data/unit-aliases.ts.

import type { UnitCode } from "./units";

/** Semnele diacritice ale formei NFD.
 *
 *  SCRISA CA PROPRIETATE UNICODE si nu ca interval de coduri, spre deosebire de
 *  flaggedSku din lib/data/extraction-actions.ts, care foloseste intervalul
 *  combinat clasic. Cele doua acopera aceleasi semne pentru romana; forma de aici
 *  spune pe fata ce cauta, iar tinta de compilare este ES2022, deci steagul u si
 *  clasele de proprietati sunt disponibile. */
const COMBINING = /\p{Mn}/gu;

/**
 * Cuvantul unui document, adus la forma pe care o comparam.
 *
 * Fara diacritice, cu litere mici, fara punct si fara spatii duble, deci `Set.`,
 * `SET` si ` set ` sunt acelasi cuvant. Punctele se scot TOATE si nu numai cel
 * final, ca `m.l.` sa ajunga `ml`.
 *
 * ACEEASI FUNCTIE SCRIE SI CITESTE cheia din public.supplier_unit_aliases, deci
 * forma cu care un rand a fost scris si forma cu care este cautat nu au cum sa nu
 * fie de acord.
 */
export function foldUnitWord(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";
  return raw
    .normalize("NFD")
    .replace(COMBINING, "")
    .replace(/\./g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Numele unui furnizor, adus la forma pe care o comparam. Acelasi tratament ca
 * mai sus, minus scoaterea punctelor: `S.R.L.` face parte din numele firmei si
 * doua firme se pot deosebi prin el.
 */
export function foldSupplierName(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";
  return raw
    .normalize("NFD")
    .replace(COMBINING, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Harta, scrisa cu cuvintele asa cum apar pe hartie.
 *
 * Fiecare cheie trece prin foldUnitWord la incarcare, deci un cuvant scris aici cu
 * diacritice, cu punct sau cu majuscule ajunge oricum la forma cautata, si nimeni
 * nu trebuie sa tina minte conventia ca sa adauge un rand.
 */
const RAW_SYNONYMS: Array<[string, UnitCode]> = [
  // Setul, unitatea noua a acestui card.
  ["set", "set"],
  ["set.", "set"],
  ["seturi", "set"],

  // Litrul. Unitatea exista de la 0030; lipseau numai cuvintele.
  ["l", "l"],
  ["L", "l"],
  ["litri", "l"],
  ["litru", "l"],

  // Bucata.
  ["buc", "pcs"],
  ["buc.", "pcs"],
  ["bucăți", "pcs"],
  ["pcs", "pcs"],

  // Metrul patrat. `m²` nu poarta semn diacritic, deci pliarea nu il preface in
  // `m2`: are randul lui, si asta nu este o dublura.
  ["m2", "m2"],
  ["m²", "m2"],
  ["mp", "m2"],

  // Metrul liniar.
  ["ml", "lm"],
  ["m.l.", "lm"],
  ["metru liniar", "lm"],

  // Kilogramul.
  ["kg", "kg"],
];

/** Harta pliata, construita o singura data. */
const SYNONYMS: Map<string, UnitCode> = (() => {
  const map = new Map<string, UnitCode>();
  for (const [word, unit] of RAW_SYNONYMS) {
    const key = foldUnitWord(word);
    if (key.length === 0) continue;
    map.set(key, unit);
  }
  return map;
})();

/**
 * Ce unitate a noastra inseamna cuvantul de pe document, sau null cand nu stim.
 *
 * null NU ESTE UN ESEC. Este calea pe care ecranul o trateaza: lista ramane pe
 * "Alege unitatea", cuvantul documentului sta scris dedesubt ca "Pe document:
 * <cuvant>", operatorul alege o unitate care exista, si alegerea se tine minte
 * pentru urmatorul document al aceluiasi furnizor.
 */
export function unitFromDocumentWord(raw: string | null | undefined): UnitCode | null {
  const key = foldUnitWord(raw);
  if (key.length === 0) return null;
  return SYNONYMS.get(key) ?? null;
}

/**
 * Cuvantul unui document, pliat, catre unitatea aleasa ultima oara pentru el.
 *
 * TIPUL STA AICI SI NU IN lib/data/unit-aliases.ts, care il umple, fiindca
 * ecranul de verificare este un component de client si acel fisier poarta
 * `server-only`. Un `import type` s-ar sterge la compilare si ar fi fost in regula,
 * dar un tip scris in singurul fisier al perechii pe care il poate atinge oricine
 * nu lasa pe nimeni sa verifice asta.
 */
export type UnitAliasMap = Record<string, UnitCode>;
