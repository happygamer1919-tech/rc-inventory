// P3-114, goal G69 partea 3. CONTURILE, CITITE SI NIMIC ALTCEVA.
//
// Raportul de proiectare docs/reports/2026-09-30-author-setari-design.md, sectiunea
// 4 Partea 3, cere exact atat: fiecare cont cu numele, emailul, rolul romaneste si
// daca este activ. "Fara migratie, fara permisiune noua si fara scriere." Nu exista
// deci nicio functie de scriere in acest fisier, si asta nu este o omisiune: un
// ecran care poate stinge un cont isi merita proba lui, deci este o parte a patra.
//
// SE REFOLOSESTE CITIREA CARE EXISTA, nu se inventeaza a doua. lib/data/clients.ts
// citeste deja profiles pentru lista de responsabili ai unui lead (P3-45), prin
// acelasi createClient de server si acelasi from("profiles").select(...). Singura
// diferenta este .eq("active", true) de acolo, care NU se pune aici: un cont stins
// este chiar lucrul pe care ecranul trebuie sa il arate.
//
// NUMELE SE ARATA PRINTR-O SINGURA REGULA, ownerDisplayName din clients.ts: numele
// complet, altfel emailul, altfel "Fără nume". A scrie a doua regula aici ar fi
// insemnat ca acelasi om apare sub doua nume in doua ecrane.
//
// NICIO PERMISIUNE NOUA SI NICIO CHEIE. Politica profiles_select din migratia 0001
// este `id = auth.uid() or public.is_owner()`, iar tot /setari este deja numai al
// administratorului (proxy.ts). Deci lista completa ajunge exact la omul care are
// deja dreptul sa deschida ecranul, si nu se adauga nimic. Nu se foloseste cheia de
// service: nu exista pe aceasta masina, nu se aduce si nu este nevoie de ea.

import { ownerDisplayName } from "@/lib/data/clients";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/supabase/types";

/** Un cont, asa cum il arata secțiunea Utilizatori. Numai citire. */
export type AccountRow = {
  id: string;
  /** Numele complet, altfel emailul, altfel "Fără nume". */
  name: string;
  /** Emailul asa cum este stocat. Null cand randul nu are unul. */
  email: string | null;
  role: AppRole;
  active: boolean;
};

/**
 * Toate conturile pe care le vede cititorul, dupa nume.
 *
 * ORDINEA ESTE CEA DE LA RESPONSABILI, nume cu colationare romaneasca, fiindca un
 * al doilea criteriu inventat aici (rolul intai, starea intai) ar fi o decizie pe
 * care raportul de proiectare nu a luat-o. Starea si rolul se citesc de pe fiecare
 * rand, deci nu au nevoie sa fie si ordinea.
 *
 * O eroare intoarce lista goala, exact ca listClientOwnerChoices, iar blocul spune
 * atunci romaneste ca nu are ce arata in loc sa cada ecranul.
 */
export async function listAccounts(): Promise<AccountRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, active");
  if (error || !data) return [];

  return (
    data as {
      id: string;
      full_name: string | null;
      email: string | null;
      role: AppRole;
      active: boolean;
    }[]
  )
    .map((p) => ({
      id: p.id,
      name: ownerDisplayName(p),
      email: p.email?.trim() ? p.email.trim() : null,
      role: p.role,
      active: p.active,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ro"));
}
