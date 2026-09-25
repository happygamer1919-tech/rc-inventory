import "server-only";

// Ce a raspuns operatorul, ultima oara, despre cuvantul acestui furnizor.
//
// Card P3-102, constatarea F23 a lui Ivan, tinta G59. Harta de sinonime din
// lib/data/unit-synonyms.ts stie cuvintele pe care acest proiect le-a vazut. Nu
// are cum sa stie fiecare cuvant pe care il tipareste fiecare furnizor. Cand un
// cuvant nu se mapeaza, operatorul alege o unitate care EXISTA, iar pana la acest
// card raspunsul acela murea odata cu documentul: urmatorul aviz al aceluiasi
// furnizor punea aceeasi intrebare.
//
// TABELA ESTE public.supplier_unit_aliases, din migratia 0061, si este DOAR
// ADAUGARE. Nu exista cheie unica si nu exista politica de update: un raspuns dat
// alta data ramane citibil, iar cititorul ia cel mai NOU rand pentru o pereche.
//
// NICIO CONVERSIE, SI FORMA O FACE IMPOSIBILA: nu exista coloana de factor. Un
// rand spune "cuvantul acestui furnizor inseamna aceasta unitate". Nu spune
// niciodata cate dintr-una fac una din cealalta.
//
// SUGESTIE, NU HOTARARE. Unitatea tinuta minte precompleteaza lista pe urmatorul
// document al aceluiasi furnizor. Este o sugestie pe un ecran pe care operatorul
// oricum il citeste si o poate schimba, exact ca orice alta valoare extrasa: ce se
// salveaza este ce este pe ecran la confirmare.
//
// FIECARE APEL TRECE PRIN hasSupplierUnitAliases. 0061 ajunge in productie pe
// fuziune si codul pleaca din acelasi push, deci intre cele doua momente tabela nu
// exista, si asta este chiar calea prin care intra fiecare document de furnizor.
// Pana la aplicare ecranul se poarta ca astazi plus harta de sinonime, care nu
// atinge baza de date deloc.

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasSupplierUnitAliases } from "./schema-capability";
import {
  foldSupplierName,
  foldUnitWord,
  unitFromDocumentWord,
  type UnitAliasMap,
} from "./unit-synonyms";
import { isUnitCode, type UnitCode } from "./units";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Ce s-a tinut minte pentru furnizorii acestia, pe cuvant pliat.
 *
 * Intoarce o harta pe FURNIZOR PLIAT, ca apelantul sa nu plieze a doua oara si sa
 * riste sa plieze altfel.
 *
 * O TABELA CARE NU EXISTA INCA, O EROARE DE CITIRE SI UN FURNIZOR NECUNOSCUT DAU
 * TOATE ACELASI RASPUNS: nimic tinut minte. Ecranul are deja calea aceea si o
 * merge in fiecare zi, deci nu exista stare noua de tratat.
 */
export async function loadUnitAliases(
  supabase: Db,
  supplierNames: Array<string | null | undefined>,
): Promise<Record<string, UnitAliasMap>> {
  const keys = [...new Set(supplierNames.map(foldSupplierName).filter((k) => k.length > 0))];
  if (keys.length === 0) return {};
  if (!(await hasSupplierUnitAliases(supabase))) return {};

  const { data, error } = await supabase
    .from("supplier_unit_aliases")
    .select("supplier_key, unit_raw_key, unit, created_at")
    .in("supplier_key", keys)
    // CEL MAI NOU INTAI, si primul citit pentru o pereche castiga. Tabela este
    // doar adaugare, deci un raspuns schimbat este un rand nou, nu unul rescris.
    .order("created_at", { ascending: false });
  if (error) return {};

  const out: Record<string, UnitAliasMap> = {};
  for (const row of data ?? []) {
    const supplierKey = String((row as { supplier_key: unknown }).supplier_key ?? "");
    const wordKey = String((row as { unit_raw_key: unknown }).unit_raw_key ?? "");
    const unit = String((row as { unit: unknown }).unit ?? "");
    if (supplierKey.length === 0 || wordKey.length === 0) continue;
    // O valoare care nu este o unitate a noastra se ignora in loc sa ajunga pe
    // ecran. Enumul din baza o face deja imposibila; aceasta linie este ce
    // impiedica un `as` sa treaca peste el in TypeScript.
    if (!isUnitCode(unit)) continue;
    const forSupplier = (out[supplierKey] ??= {});
    if (forSupplier[wordKey] === undefined) forSupplier[wordKey] = unit;
  }
  return out;
}

/**
 * Tine minte ce a ales operatorul pentru cuvintele pe care harta nu le stie.
 *
 * NU SCRIE CE STIE DEJA HARTA. Un rand pentru `litri` ar fi o a doua sursa de
 * adevar despre acelasi cuvant, si cele doua ar putea sa nu fie de acord.
 * Apelantul filtreaza, si aceasta functie mai verifica o data, fiindca doua cai
 * de executie inseamna doua ocazii de a uita.
 *
 * NU SCRIE CE ESTE DEJA TINUT MINTE LA FEL. Altfel fiecare confirmare ar adauga
 * un rand identic cu cel dinaintea lui.
 *
 * NU RASTOARNA NIMIC. Se cheama dupa ce comanda a fost creata, si un esec aici
 * nu are voie sa desfaca o comanda reala: a pierde livrarea ca sa salvezi o
 * preferinta ar fi exact schimbul gresit. Acelasi rationament pe care il poarta
 * mutarea referintei furnizorului in confirmExtractionDraft.
 */
export async function rememberUnitAliases(
  supabase: Db,
  supplierName: string,
  userId: string,
  choices: Array<{ word: string | null; unit: string }>,
): Promise<number> {
  const supplierKey = foldSupplierName(supplierName);
  if (supplierKey.length === 0) return 0;

  const wanted = new Map<string, UnitCode>();
  for (const choice of choices) {
    const wordKey = foldUnitWord(choice.word);
    if (wordKey.length === 0) continue;
    if (!isUnitCode(choice.unit)) continue;
    // Cuvantul pe care harta il stie nu ajunge in tabela: vezi mai sus.
    if (unitFromDocumentWord(choice.word) !== null) continue;
    wanted.set(wordKey, choice.unit);
  }
  if (wanted.size === 0) return 0;

  if (!(await hasSupplierUnitAliases(supabase))) return 0;

  const known = (await loadUnitAliases(supabase, [supplierName]))[supplierKey] ?? {};
  const rows = [...wanted.entries()]
    .filter(([wordKey, unit]) => known[wordKey] !== unit)
    .map(([wordKey, unit]) => ({
      supplier_key: supplierKey,
      unit_raw_key: wordKey,
      unit,
      created_by: userId,
    }));
  if (rows.length === 0) return 0;

  const { error } = await supabase.from("supplier_unit_aliases").insert(rows);
  if (error) return 0;
  return rows.length;
}
