// P3-328. PDF-ul ghidului, tiparit la cerere pentru rolul celui conectat. Inainte era un fisier
// gata facut in public/guide, deschis de oricine fara cont si cu toate lectiile, inclusiv cele
// numai pentru administrator.
//
// ACELASI ACCES CA /ajutor: fara sesiune, 401 (proxy.ts redirectioneaza oricum catre
// autentificare). Administratorul primeste toate lectiile, operatorul numai pe ale lui
// (guideForRole, aceeasi functie ca la pagini). ORICE ESEC ESTE JSON, NICIODATA UN PDF STRICAT.

import { NextResponse } from "next/server";
import { renderGuidePdf } from "@/lib/guide/pdf.mjs";
import { getSessionUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function refusal(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status, headers: { "cache-control": "no-store" } });
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return refusal(401, "Trebuie să fii autentificat.");

  try {
    const { pdf } = await renderGuidePdf(user.role);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": 'attachment; filename="ghid-rapid-construct.pdf"',
        "content-length": String(pdf.length),
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "necunoscut";
    console.error("ghid PDF: randarea a esuat", { role: user.role, detail });
    return refusal(500, "PDF-ul nu a putut fi generat.");
  }
}
