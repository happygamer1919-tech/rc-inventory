import "server-only";

// Este schema fazei 3 aplicata pe baza pe care ruleaza aplicatia?
//
// DE CE EXISTA ACEST FISIER, SI DE CE ESTE UN DEFECT DE PRODUCTIE CE L-A ADUS.
//
// Pe 2026-08-31 platforma a cazut cu 500 pe fiecare ecran, inclusiv tabloul de
// bord. Cauza nu a fost o migratie gresita si nici o rezolvare de conflict: cele
// treisprezece migratii ale fazei 3 sunt SCRISE SI FUZIONATE dar NEAPLICATE, iar
// codul fuzionat odata cu ele citea neconditionat coloane care nu exista inca:
//
//   listProducts        -> select ..., supplier_id, ...   (adaugat de 0019)
//   listOutboundIssues  -> select ..., project_id, ...    (adaugat de 0017)
//
// PostgREST intoarce 42703 pentru o coloana inexistenta, cele doua functii arunca
// iar tabloul de bord este prima pagina care le cheama. Rapoartele spuneau, card
// dupa card, "exista in cod si nu pe site-ul viu" si tratau asta ca inofensiv.
// Nu este: CODUL este pe site-ul viu, si citea schema neconditionat.
//
// REGULA PE CARE O IMPUNE ACEST FISIER: un ecran nu are voie sa se prabuseasca
// pentru ca o migratie nu a fost inca aplicata. Ori citeste ce exista, ori spune
// romaneste ca functia nu este inca activa. Ziua in care P3-27 aplica migratiile,
// totul se aprinde singur, fara alta livrare.
//
// SONDA MERGE PRIN PostgREST SI NU PRINTR-O FUNCTIE SQL, deliberat: o functie ar
// fi ea insasi intr-o migratie neaplicata, deci nu ar putea raspunde la intrebare
// tocmai cand intrebarea conteaza.

import { createClient } from "@/lib/supabase/server";

/** Cat timp se tine minte raspunsul, in milisecunde.
 *
 *  NU LA NESFARSIT. O instanta pornita inainte de aplicare ar raspunde "nu"
 *  pentru totdeauna, iar ecranele ar ramane stinse dupa ce schema a aterizat,
 *  fara ca nimeni sa inteleaga de ce. Un minut inseamna ca aplicarea se vede
 *  singura, fara redeploy si fara repornire. */
const TTL_MS = 60_000;

let cached: { value: boolean; at: number } | null = null;

/**
 * True cand tabelele fazei 3 exista pe baza catre care arata aplicatia.
 *
 * Sonda cere UN rand din public.projects. Cand tabela lipseste, PostgREST
 * raspunde cu eroare si raspunsul este "nu". Cand tabela exista dar RLS nu lasa
 * nimic sa treaca, raspunsul este un SET GOL SI NICIO EROARE, deci "da": exact
 * distinctia care conteaza, si motivul pentru care se verifica eroarea si nu
 * numarul de randuri.
 */
export async function hasPhase3Schema(): Promise<boolean> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.value;

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("projects").select("id").limit(1);
    cached = { value: !error, at: now };
  } catch {
    // O sonda care arunca inseamna ca nu se stie, si "nu se stie" se trateaza ca
    // "nu": ecranul degradeaza in loc sa se prabuseasca, ceea ce este intreg
    // rostul acestui fisier.
    cached = { value: false, at: now };
  }
  return cached.value;
}

