// P3-11e. Ce ruleaza ACUM in productie, spus de productia insasi.
//
// DE CE EXISTA. INC-06: o migratie de eliminare s-a aplicat pe o baza de date a
// carei cod VIU inca citea obiectul eliminat, si sase ecrane au raspuns 500.
// check:removal-safety, livrat de P3-11c, dovedeste jumatatea FUZIONATA: niciun
// cititor nu mai ramane pe main. Jumatatea DESFASURATA nu se putea dovedi de
// nicaieri, asa ca aplierul cerea in schimb ca operatorul sa declare
// RC_DEPLOY_CONFIRMED=yes. O declaratie de operator este exact ghicitul care a
// produs INC-06.
//
// FARA VERCEL_TOKEN SI FARA API-UL VERCEL, pe instructiunea proprietarului.
// Vercel expune VERCEL_GIT_COMMIT_SHA APLICATIEI, la build, deci desfasurarea
// isi poate spune singura commit-ul fara nicio acreditare. Asta SUPRAVIETUIESTE
// revocarii de acreditari din P2-13, care este tot rostul: o verificare ce moare
// cand se rotesc cheile este o verificare ce moare exact in ziua in care conteaza.
//
// RUTA ESTE PUBLICA SI NU POARTA NIMIC ALTCEVA. Un sha de commit si un numar de
// versiune de migratie. Fara nume de variabile de mediu, fara numaratori, fara
// sanatatea vreunei dependinte. Orice altceva este alt card: o ruta de sanatate
// este singurul endpoint la care toata lumea mai adauga un camp.

import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

/** Sha-ul commit-ului din care a fost construita ACEASTA desfasurare. */
function liveCommit(): string | null {
  // SCRIS LITERAL. Next inlocuieste la compilare numai referintele scrise
  // litera cu litera; process.env[nume] nu este inlocuit si ar fi undefined in
  // build. Aceeasi regula pe care o explica lib/supabase/env.ts.
  const raw = process.env.VERCEL_GIT_COMMIT_SHA;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

/**
 * Cea mai mare versiune din registrul de migratii APLICAT.
 *
 * SE CITESTE DIN BAZA DE DATE, NICIODATA DIN REPOZITORIU. Repozitoriul spune ce
 * AR TREBUI aplicat; numai baza de date spune ce ESTE aplicat, iar diferenta
 * dintre cele doua este intreaga clasa de defect din care face parte INC-06.
 *
 * Trece prin public.applied_ledger_version(), o functie SECURITY DEFINER, fiindca
 * schema supabase_migrations nu este expusa prin PostgREST si nu trebuie sa fie.
 * Intoarce null cand functia nu exista inca, si null se citeste ca "nu stiu", nu
 * ca "niciuna": aplierul refuza pe null si nu presupune nimic.
 */
async function appliedLedgerVersion(): Promise<string | null> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof key !== "string" || key.trim().length === 0) return null;
  try {
    const supabase = createServiceClient(supabaseUrl(), key.trim(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.rpc("applied_ledger_version");
    if (error || typeof data !== "string" || data.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

export async function GET() {
  const commit = liveCommit();
  return NextResponse.json(
    {
      commit,
      ledger_version: await appliedLedgerVersion(),
      at: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        // Fara memorie intermediara, niciodata. O ruta de sanatate servita din
        // cache raporteaza commit-ul desfasurarii ANTERIOARE, care este cea mai
        // rea minciuna posibila aici: aplierul ar citi ca desfasurat exact
        // codul pe care il inlocuieste.
        "cache-control": "no-store, max-age=0, must-revalidate",
      },
    },
  );
}
