// P3-328. Pozele ghidului, doar pentru cine e conectat si doar ale lectiilor pe care rolul lui
// le vede (aceeasi regula ca paginile /ajutor). Inainte stateau in public/guide si le putea
// deschide oricine, fara cont, pentru ca proxy.ts sare peste caile care se termina in .png.
//
// ADRESA NU SE TERMINA IN .png: altfel matcher-ul din proxy.ts ar sari peste cerere si nu s-ar
// mai verifica nici sesiunea. Ruta verifica oricum singura: fara sesiune, 401, nu o pagina de login.
//
// O POZA A UNEI LECTII CARE NU E A ROLULUI NU EXISTA PENTRU EL: 404, ca la o adresa gresita,
// nu un refuz care ar confirma ca lectia exista.

import { NextResponse } from "next/server";
import { readGuideImage } from "@/lib/guide/read";
import { getSessionUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function refusal(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(_request: Request, context: { params: Promise<{ nume: string }> }) {
  const user = await getSessionUser();
  if (!user) return refusal(401, "Trebuie să fii autentificat.");

  const { nume } = await context.params;
  const picture = readGuideImage(user.role, nume);
  if (!picture) return refusal(404, "Imaginea nu există.");

  return new NextResponse(new Uint8Array(picture), {
    status: 200,
    headers: {
      "content-type": "image/png",
      "content-length": String(picture.length),
      // Sta in memoria browserului celui conectat, nu in una comuna.
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
