// EXT-21. CE ACCEPTAM ACUM, SPUS DE BAZA DE DATE INSASI.
//
// DE CE EXISTA. Pe 2026-09-03 registrul nostru de migratii spunea ca 0028 pana la
// 0031 sunt in asteptare, productia le avea deja pe toate patru, iar documentul
// de stare scris pentru Andre a fost compus din registru. I-a spus ca a
// nouasprezecea categorie si unitatile t si l "vor ajunge cand lotul de migratii
// in asteptare va fi aplicat in productie". Era fals in chiar clipa in care a
// fost scris, si l-a costat o zi in care a tinut pe loc trei valori deja sigure.
//
// DE CE UN MECANISM SI NU O REGULA. Defectul este INVIZIBIL CAT TIMP SE INTAMPLA.
// Nimic nu s-a facut rosu, nicio verificare nu a picat, si amandoua partile s-au
// purtat corect fata de informatia pe care o aveau. O regula care spune "tine
// documentul de stare exact" ar fi fost respectata de toata lumea si nu ar fi
// schimbat nimic, fiindca cel care il scria credea ca este exact. Singurul lucru
// care scoate din joc aceasta clasa de defect este ca Andre sa poata INTREBA
// PRODUCTIA in loc sa citeasca ce am scris noi despre ea.
//
// PUBLICA SI NEAUTENTIFICATA, DELIBERAT, pe defaults-ul cardului. O acreditare
// este un lucru de emis, de rotit si de sustinut, si ar pune acest endpoint
// exact in spatele pasului uman pe care cardul il elimina. Ce intoarce este un
// vocabular de categorii si un enum de unitati: liste controlate, nu date de
// client, si amandoua ajung oricum la Andre prin contract.
//
// NU POARTA NIMIC ALTCEVA, SI ASTA ESTE PAZIT DE O VERIFICARE, NU DE O RECITIRE.
// /api/health spune in antetul lui ca o ruta de sanatate este singurul endpoint
// la care toata lumea mai adauga un camp. Aceeasi propozitie se aplica aici, cu
// mai multa forta, fiindca aceasta ruta este citita de un tert. De aceea
// npm run check:state-endpoint refuza orice select din acest fisier catre alta
// tabela decat public.categories si public.units, si refuza pierderea filtrului
// active. Cine adauga a treia tabela o adauga cu un card care spune de ce.
//
// CHEIA DE SERVICIU, SI DE CE NU CEA ANONIMA. Politicile RLS din 0001 dau select
// pe categories si units numai rolului authenticated. Rolul anon nu vede niciun
// rand, deci o citire anonima ar intoarce o lista goala, nu o eroare, ceea ce
// este exact minciuna tacuta pe care acest card o scoate din sistem. Se citeste
// cu clientul de serviciu, la fel ca /api/health, si nicio cheie nu paraseste
// serverul.

import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/supabase/env";
import { isUnitCode, unitLabel, type UnitCode } from "@/lib/data/units";

export const dynamic = "force-dynamic";

/** Ce intoarce ruta. Trei campuri, si al patrulea are nevoie de un card. */
type StatePayload = {
  categories: string[];
  units: { code: UnitCode; label: string }[];
  ledger_version: string | null;
  at: string;
};

/**
 * Clientul de serviciu, sau null cand cheia lipseste.
 *
 * NULL SE CITESTE CA "NU STIU", NICIODATA CA "NICIUNA", exact ca in
 * /api/health: raspunsul spune atunci ca nu poate raspunde, si nu intoarce o
 * lista goala pe care un cititor ar lua-o drept "nu acceptati nicio categorie".
 */
function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof key !== "string" || key.trim().length === 0) return null;
  try {
    return createServiceClient(supabaseUrl(), key.trim(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch {
    return null;
  }
}

export async function GET() {
  const supabase = serviceClient();
  if (supabase === null) {
    // 503 SI NU 200 CU LISTE GOALE. Un poller care primeste 200 cu zero
    // categorii nu are cum sa distinga "nu acceptati nimic" de "nu am putut
    // citi", si prima citire este cea care il face sa tina pe loc valori bune.
    return NextResponse.json(
      { error: "state_unavailable", at: new Date().toISOString() },
      { status: 503, headers: HEADERS },
    );
  }

  const [categories, units, ledger] = await Promise.all([
    supabase
      .from("categories")
      .select("name, sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("units")
      .select("code, sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    supabase.rpc("applied_ledger_version"),
  ]);

  if (categories.error || units.error) {
    return NextResponse.json(
      { error: "state_unavailable", at: new Date().toISOString() },
      { status: 503, headers: HEADERS },
    );
  }

  // ETICHETELE VIN DIN COD SI CODURILE DIN BAZA DE DATE, si asta este spus aici
  // fiindca este singura jumatate a raspunsului care nu este citita. Enumul
  // unit_code fixeaza valorile; tabela units spune care sunt in uz si in ce
  // ordine; lib/data/units.ts traduce codul in eticheta romaneasca. Andre emite
  // CODUL, deci codul este partea care trebuie sa fie vie, si este.
  const payload: StatePayload = {
    categories: (categories.data ?? []).map((r) => r.name as string),
    units: (units.data ?? [])
      .map((r) => r.code as string)
      .filter(isUnitCode)
      .map((code) => ({ code, label: unitLabel(code) })),
    ledger_version:
      !ledger.error && typeof ledger.data === "string" && ledger.data.length > 0
        ? ledger.data
        : null,
    at: new Date().toISOString(),
  };

  return NextResponse.json(payload, { status: 200, headers: HEADERS });
}

// Fara memorie intermediara, niciodata. Un raspuns servit din cache la intrebarea
// "ce acceptati acum" este chiar defectul pe care acest card il elimina: ar
// raspunde cu starea de dinaintea ultimei migratii, si ar face-o cu 200.
const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, max-age=0, must-revalidate",
} as const;
