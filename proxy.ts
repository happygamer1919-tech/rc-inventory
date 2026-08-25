// Proxy de autentificare. Ruleaza inaintea fiecarei cereri.
//
// Fisierul se numeste proxy.ts, nu middleware.ts: Next 16 a redenumit conventia
// si avertizeaza la fiecare pornire ca "middleware" este depreciat.
//
// REFUZ IMPLICIT. Nu exista lista de rute protejate, exista o lista de rute
// permise, si tot restul cere autentificare. O ruta noua este protejata pentru
// ca este noua, nu pentru ca cineva si-a amintit sa o adauge undeva.
//
// Rolul se citeste O SINGURA DATA pe cerere, aici, si se transmite mai departe
// prin antetul x-rc-role. Componentele nu interogheaza din nou tabela profiles.
//
// Sesiunea se reimprospateaza prin @supabase/ssr, cu implicitele lui.

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { FORBIDDEN_PATH, LOGIN_PATH, OWNER_ONLY_PREFIXES } from "@/lib/routes";
import { COOKIE_OPTIONS } from "@/lib/supabase/cookies";

/** Lista permisa. Orice altceva cere sesiune. */
const PUBLIC_PATHS = new Set<string>([LOGIN_PATH]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // Callback-ul de autentificare, daca ajunge sa fie folosit vreodata.
  if (pathname.startsWith("/auth/")) return true;
  return false;
}

function normaliseOrigin(raw: string | undefined): string {
  if (!raw) throw new Error("NEXT_PUBLIC_SUPABASE_URL lipseste.");
  return new URL(raw.trim()).origin;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    normaliseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser valideaza tokenul la serverul de autentificare. getSession ar citi
  // doar cookie-ul, care este date trimise de client, deci nu proba de identitate.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // --- neautentificat ------------------------------------------------------
  if (!user) {
    if (isPublic(pathname)) return response;
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = "";
    // Nu se randeaza niciodata un ecran gol pentru un vizitator neautentificat.
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  // --- autentificat, dar pe pagina de autentificare -------------------------
  if (pathname === LOGIN_PATH) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  // --- rolul, citit o singura data -----------------------------------------
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", user.id)
    .single();

  // Un cont autentificat fara rand activ in profiles nu are rol, deci nu are
  // acces. Randurile se creeaza manual, o data cu contul.
  if (!profile || !profile.active) {
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = "";
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  const role = profile.role as string;

  // --- rol gresit ----------------------------------------------------------
  if (OWNER_ONLY_PREFIXES.some((p) => pathname.startsWith(p)) && role !== "owner") {
    const url = request.nextUrl.clone();
    url.pathname = FORBIDDEN_PATH;
    // Rewrite, nu redirect: adresa ramane cea ceruta si nu poate aparea bucla.
    const rewritten = NextResponse.rewrite(url);
    for (const cookie of response.cookies.getAll()) rewritten.cookies.set(cookie);
    return rewritten;
  }

  // --- transmite rolul mai departe -----------------------------------------
  const headers = new Headers(request.headers);
  headers.set("x-rc-role", role);
  headers.set("x-rc-user-id", user.id);

  const passthrough = NextResponse.next({ request: { headers } });
  for (const cookie of response.cookies.getAll()) passthrough.cookies.set(cookie);
  return passthrough;
}

export const config = {
  // Totul in afara de fisierele statice si de imaginile optimizate. Rutele noi
  // intra automat sub protectie fiindca nu sunt excluse aici.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|pdf)$).*)",
  ],
};
