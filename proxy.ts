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
//
// P2-11. ANTETELE DE SECURITATE SE PUN SI AICI, pe fiecare raspuns pe care il
// produce acest fisier. next.config.ts le pune pe raspunsurile care ajung in
// randare; o redirectare sau o rescriere intoarsa de aici scurtcircuiteaza
// randarea si nu le-ar primi niciodata.
//
// Iar aceea este tocmai prima pagina pe care o vede un vizitator: raspunsul
// dintai pentru cineva neautentificat NU este o pagina, este redirectarea catre
// autentificare. Fara antete pe ea, primul contact al browserului cu domeniul se
// face fara politica, exact contactul pe care HSTS exista sa il acopere.

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { FORBIDDEN_PATH, LOGIN_PATH, NO_PROFILE_PATH, OWNER_ONLY_PREFIXES } from "@/lib/routes";
import { COOKIE_OPTIONS } from "@/lib/supabase/cookies";
import { applySecurityHeaders } from "@/lib/security-headers";

/** Lista permisa. Orice altceva cere sesiune. */
const PUBLIC_PATHS = new Set<string>([LOGIN_PATH]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // Callback-ul de autentificare, daca ajunge sa fie folosit vreodata.
  if (pathname.startsWith("/auth/")) return true;
  // P2-08a. CALLBACK-UL DE EXTRAGERE ESTE UN ENDPOINT DE MASINA, NU DE OM.
  //
  // Make posteaza aici fara sesiune si fara cookie, iar autentificarea lui este
  // antetul secret partajat pe care contractul o prevede, verificat de ruta
  // insasi inaintea oricarei alte munci. Fara aceasta exceptie proxy-ul il
  // redirecta catre ecranul de autentificare, si un client care urmareste
  // redirectarile primea 200 de la pagina de login pentru ORICE payload,
  // inclusiv unul cu secretul gresit. Un 401 care ajunge 200 pentru ca l-a
  // interceptat middleware-ul este cea mai linistita cale catre un endpoint
  // care pare sa mearga si nu verifica nimic.
  //
  // "Public" aici inseamna doar "proxy-ul nu il redirecteaza". Ruta refuza
  // singura orice cerere fara antetul corect, si o face pe primul rand.
  if (pathname === "/api/extraction/callback") return true;
  // EXT-08. LEGATURA CATRE DOCUMENT ESTE TOT UN ENDPOINT DE MASINA.
  //
  // Extractorul lui Andre descarca documentul de aici, fara sesiune si fara
  // cookie. Autorizarea ei este jetonul semnat de Supabase din querystring,
  // verificat de Supabase insusi, si ruta nu poate acorda nimic peste el.
  //
  // FARA ACEASTA EXCEPTIE FIECARE ESEC AR FI O PAGINA DE AUTENTIFICARE. Proxy-ul
  // ar raspunde 307 catre /login, un client care urmareste redirectarile ar primi
  // 200 si text/html, iar Make ar raporta "raspuns care nu este document" fara sa
  // poata spune daca legatura a expirat sau s-a stricat. Contractul din
  // docs/contracts/document-url.md interzice exact acel raspuns, deci linia
  // aceasta este parte din contract si nu o comoditate.
  //
  // Matcher-ul de la finalul fisierului exclude deja caile care se termina in
  // ".pdf", deci astazi majoritatea acestor cereri nici nu ajung la proxy. Pe
  // aceea nu se poate baza nimeni: un obiect fara extensie, sau cu alta, ajunge.
  if (pathname === "/api/documents" || pathname.startsWith("/api/documents/")) return true;
  // P3-11e. RUTA DE SANATATE ESTE INTEROGATA DE APLIER, DE PE ALTA MASINA.
  //
  // Ea spune ce commit ruleaza in productie, si aplierul refuza o migratie de
  // eliminare pana cand raspunsul acela dovedeste ca desfasurarea contine deja
  // codul care a incetat sa citeasca obiectul eliminat. Cel care intreaba nu are
  // sesiune si nu poate avea una: este un script, nu un ecran.
  //
  // Fara aceasta linie proxy-ul ar raspunde 307 catre /login, iar aplierul ar
  // citi o pagina HTML de autentificare in loc de un commit. Ar refuza, ceea ce
  // este partea sigura, dar ar refuza PENTRU TOTDEAUNA si pentru motivul gresit.
  if (pathname === "/api/health") return true;
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
    if (isPublic(pathname)) return applySecurityHeaders(response);
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = "";
    // Nu se randeaza niciodata un ecran gol pentru un vizitator neautentificat.
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return applySecurityHeaders(redirect);
  }

  // --- rolul, citit o singura data -----------------------------------------
  //
  // CRIT-17. CITIREA PROFILULUI SE FACE INAINTEA ORICAREI REDIRECTARI, si asta
  // este chiar reparatia. Pana la acest card ordinea era inversa: intai
  // "esti autentificat si stai pe pagina de autentificare, deci mergi la /",
  // apoi "nu ai profil activ, deci mergi la pagina de autentificare". Cele doua
  // ramuri se aratau una spre cealalta, deci un cont cu sesiune valida si fara
  // rand activ in profiles sarea intre / si /autentificare pana cand browserul
  // renunta cu ERR_TOO_MANY_REDIRECTS. Proprietarul a intalnit-o in productie.
  //
  // O sesiune este utilizabila numai impreuna cu profilul ei, deci profilul se
  // rezolva o singura data, aici, si abia dupa aceea se decide unde merge
  // cererea.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", user.id)
    .single();

  // EROAREA SE DEOSEBESTE DE ABSENTA, chiar daca amandoua refuza cererea.
  //
  // Pana la acest card eroarea era aruncata: `const { data: profile }` lasa
  // deoparte `error`, deci o politica RLS schimbata gresit, o retea cazuta sau
  // orice defect al interogarii aratau identic cu "contul nu are rand". Refuzul
  // este acelasi, fiindca a intra cu un rol necunoscut este mai rau decat a nu
  // intra deloc, dar defectul se scrie in jurnal ca sa nu se ascunda intr-un
  // ecran care spune utilizatorului ceva neadevarat despre contul lui.
  //
  // PGRST116 este codul PostgREST pentru "single() nu a gasit niciun rand",
  // adica exact absenta, nu un defect.
  if (profileError && profileError.code !== "PGRST116") {
    console.error("proxy: citirea profilului a esuat", {
      code: profileError.code,
      message: profileError.message,
      pathname,
    });
  }

  // Un cont autentificat fara rand activ in profiles nu are rol, deci nu are
  // acces. Randurile se creeaza manual, o data cu contul.
  //
  // REWRITE, NU REDIRECT. Adresa ramane cea ceruta, ecranul se randeaza pe loc
  // si nicio bucla nu este posibila, oricare ar fi ruta ceruta, inclusiv
  // pagina de autentificare. Aceeasi ratiune ca la ecranul 403 mai jos.
  if (!profile || !profile.active) {
    const url = request.nextUrl.clone();
    url.pathname = NO_PROFILE_PATH;
    url.search = "";
    const rewritten = NextResponse.rewrite(url);
    for (const cookie of response.cookies.getAll()) rewritten.cookies.set(cookie);
    return applySecurityHeaders(rewritten);
  }

  // --- autentificat, cu profil activ, dar pe pagina de autentificare --------
  // Se muta DUPA verificarea profilului: un cont fara profil nu are unde sa fie
  // trimis de aici, si tocmai incercarea de a-l trimite la / era jumatatea de
  // sus a buclei.
  if (pathname === LOGIN_PATH) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return applySecurityHeaders(redirect);
  }

  const role = profile.role as string;

  // --- rol gresit ----------------------------------------------------------
  if (OWNER_ONLY_PREFIXES.some((p) => pathname.startsWith(p)) && role !== "owner") {
    const url = request.nextUrl.clone();
    url.pathname = FORBIDDEN_PATH;
    // Rewrite, nu redirect: adresa ramane cea ceruta si nu poate aparea bucla.
    const rewritten = NextResponse.rewrite(url);
    for (const cookie of response.cookies.getAll()) rewritten.cookies.set(cookie);
    return applySecurityHeaders(rewritten);
  }

  // --- transmite rolul mai departe -----------------------------------------
  const headers = new Headers(request.headers);
  headers.set("x-rc-role", role);
  headers.set("x-rc-user-id", user.id);

  const passthrough = NextResponse.next({ request: { headers } });
  for (const cookie of response.cookies.getAll()) passthrough.cookies.set(cookie);
  return applySecurityHeaders(passthrough);
}

export const config = {
  // Totul in afara de fisierele statice si de imaginile optimizate. Rutele noi
  // intra automat sub protectie fiindca nu sunt excluse aici.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|pdf)$).*)",
  ],
};
