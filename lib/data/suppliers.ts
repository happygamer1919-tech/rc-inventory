import "server-only";

// Rezolvarea furnizorului, intr-un singur loc.
//
// DE CE ESTE UN MODUL SEPARAT SI NU O FUNCTIE INTR-UN FISIER DE ACTIUNI. Doua cai
// creeaza produse si amandoua trebuie sa ajunga la acelasi furnizor: formularul de
// catalog din lib/data/product-actions.ts si confirmarea unui document extras din
// lib/data/extraction-actions.ts. Pana la P3-05b a doua scria pur si simplu
// products.supplier_name si nu se intalnea niciodata cu prima. Coloana aceea nu mai
// exista, deci calea a doua trebuie sa rezolve un supplier_id, si atunci
// rezolvarea nu mai are voie sa traiasca intr-unul dintre cele doua fisiere.
//
// AMANDOUA FISIERELE SUNT "use server", unde FIECARE export devine o actiune de
// server apelabila din browser. O functie de rezolvare exportata de acolo ar fi o
// suprafata publica noua fara motiv. Aici, cu import "server-only", nu este.
//
// PLIEREA ESTE PE NUME SI ATAT, DEOCAMDATA. public.fold_text normalizeaza
// majusculele, diacriticele si sirurile de spatii, si NU atinge punctuatia, deci
// "Bricolaj SRL" si "Bricolaj S.R.L." sunt doi furnizori diferiti si aceasta
// functie va crea al doilea. Cardul SUPP-01 este cel care inchide asta, pe calea
// de scriere si nu doar pe cea de cautare.

import { createClient } from "@/lib/supabase/server";
import { one } from "./row";
import { looksLikeUuid } from "./suppliers-types";

/**
 * Traduce ce a ales operatorul intr-un supplier_id.
 *
 * P3-05 face din furnizor o inregistrare si lasa lista DESCHISA: un furnizor
 * nou se scrie in acelasi combobox, ca introducerea unui produs sa nu devina o
 * sarcina pe doua ecrane. Valoarea primita este deci fie un id, fie un nume.
 *
 * P3-05b: NU SE MAI SCRIE NICIUN NUME. products.supplier_name a fost sters de
 * migratia 0027, deci nu mai exista o a doua ortografie care sa se contrazica cu
 * randul de furnizor. Functia rezolva un id si numai atat; numele se citeste la
 * afisare, prin legatura.
 *
 * CAUTAREA UNUI NUME NOU SE FACE PE NUMELE PLIAT, cu aceeasi functie pe care o
 * foloseste si backfill-ul: public.fold_text. Cine scrie "bricolaj srl" cand
 * exista "Bricolaj SRL" nu creeaza al doilea furnizor, pentru ca exact asta
 * strange cardul la un loc.
 */
export type ResolvedSupplier =
  | { ok: true; value: { supplier_id: string | null } }
  | { ok: false; message: string; field: string };

export async function resolveSupplier(raw: string): Promise<ResolvedSupplier> {
  const value = raw.trim();

  // P3-05b: RAMURA DE DINAINTE DE FAZA 3 A DISPARUT ODATA CU COLOANA. Ea scria
  // numele ca text pe products.supplier_name, care nu mai exista, deci nu ar mai
  // fi degradat elegant: ar fi esuat scrierea oricarui produs.
  if (value.length === 0) return { ok: true, value: { supplier_id: null } };

  const supabase = await createClient();

  if (looksLikeUuid(value)) {
    const { data } = await supabase
      .from("suppliers")
      .select("id, name")
      .eq("id", value)
      .maybeSingle();
    if (!data)
      return { ok: false, message: "Furnizorul ales nu mai există.", field: "supplier" };
    return { ok: true, value: { supplier_id: data.id as string } };
  }

  // Un nume: mai intai cautat pliat, si creat doar daca nu exista.
  const { data: existing } = await supabase.rpc("find_supplier_by_folded_name", {
    p_name: value,
  });
  const found = one(existing);
  if (found?.id)
    return {
      ok: true,
      value: { supplier_id: found.id as string },
    };

  const { data: created, error } = await supabase
    .from("suppliers")
    .insert({ name: value })
    .select("id, name")
    .single();
  if (error || !created)
    return {
      ok: false,
      message:
        error?.code === "42501"
          ? "Doar administratorul poate adăuga un furnizor."
          : `Nu s-a putut crea furnizorul. ${error?.message ?? ""}`.trim(),
      field: "supplier",
    };
  return {
    ok: true,
    value: { supplier_id: created.id as string },
  };
}
