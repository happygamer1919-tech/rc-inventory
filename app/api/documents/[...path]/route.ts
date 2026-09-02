// EXT-08. Ruta care sta in fata lui Supabase Storage.
//
// DE CE EXISTA. Contractul cerut este:
//
//   jeton expirat     -> 400, application/json, cod stabil citibil de masina
//   jeton invalid     -> 401, aceeasi forma
//   obiect inexistent -> 404, aceeasi forma
//   niciodata text/html pe nicio cale de esec
//
// Supabase Storage nu il respecta, si asta s-a MASURAT pe proiectul real, nu
// s-a citit din documentatie: el raspunde 400 pentru toate patru cazurile, si
// foloseste acelasi cod "InvalidJWT" si pentru expirat si pentru falsificat,
// care este exact distinctia de care Make are nevoie. Capturile verbatim sunt in
// raportul cardului. lib/data/document-url.ts poarta tabelul.
//
// CE NU FACE. Nu semneaza nimic, nu citeste niciun secret, nu atinge baza de
// date. Singura variabila de care are nevoie este NEXT_PUBLIC_SUPABASE_URL.
// Autorizarea ramane in intregime jetonul semnat de Supabase: ruta nu poate
// acorda acces pe care legatura semnata nu il acorda deja.
//
// CORPUL DE LA EI NU SE TRIMITE MAI DEPARTE PE CALEA DE ESEC. Daca vreodata
// intoarce HTML, HTML-ul se opreste aici. Asta este intreaga poanta.
//
// PROXY-UL. proxy.ts redirecteaza catre /login orice cerere fara sesiune, iar
// /login este HTML. O cerere de la Make nu are sesiune. Exceptia din isPublic()
// este de aceea parte din contract, nu o comoditate: fara ea fiecare esec ar fi
// o pagina de autentificare, cu status 200, exact lucrul pe care contractul il
// interzice.

import { NextResponse } from "next/server";
import { supabaseUrl } from "@/lib/supabase/env";
import {
  DOCUMENT_ERROR,
  DOCUMENT_STATUS,
  classifyStorageFailure,
  type DocumentErrorCode,
} from "@/lib/data/document-url";

export const dynamic = "force-dynamic";

/** Cate secunde asteptam Storage inainte sa numim indisponibilitatea. */
const UPSTREAM_TIMEOUT_MS = 20_000;

/**
 * Singurul constructor de raspuns de esec din acest fisier.
 *
 * Fiecare esec trece pe aici, deci nu exista cale pe care sa iasa alt
 * content-type. `code` este campul pe care comuta cealalta parte; `error` este
 * pentru ochiul omului si nu se citeste de masina.
 */
function failure(code: DocumentErrorCode, error: string): NextResponse {
  return NextResponse.json(
    { code, error, document_url_contract: "docs/contracts/document-url.md" },
    {
      status: DOCUMENT_STATUS[code],
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await context.params;
    const objectPath = (path ?? []).map((s) => encodeURIComponent(s)).join("/");
    const token = new URL(request.url).searchParams.get("token");

    // Fara jeton nu exista autorizare de examinat. 401, ca un jeton stricat:
    // din punctul de vedere al lui Make amandoua inseamna "legatura nu este
    // buna", si niciuna nu inseamna "mai incearca".
    if (token === null || token.length === 0) {
      return failure(DOCUMENT_ERROR.invalid, "Jeton absent.");
    }
    if (objectPath.length === 0) {
      return failure(DOCUMENT_ERROR.notFound, "Cale absenta.");
    }

    const upstream = `${supabaseUrl()}/storage/v1/object/sign/${objectPath}?token=${encodeURIComponent(token)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(upstream, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.ok) {
      // Succes: octetii trec neatinsi, cu tipul lor. Legatura este privata si
      // de unica folosinta pentru un extractor, deci nu se pune in nicio memorie
      // intermediara.
      const headers = new Headers({ "cache-control": "private, no-store" });
      for (const name of ["content-type", "content-length", "etag", "last-modified"]) {
        const value = response.headers.get(name);
        if (value !== null) headers.set(name, value);
      }
      return new NextResponse(response.body, { status: 200, headers });
    }

    // O redirectare de la ei nu este un document. Nu o urmam si nu o transmitem:
    // urmarita, ar putea ajunge oriunde, iar transmisa, Make ar urma-o el.
    if (response.status >= 300 && response.status < 400) {
      return failure(DOCUMENT_ERROR.upstream, "Storage a raspuns cu o redirectare.");
    }

    const raw = await response.text().catch(() => "");
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }

    const code = classifyStorageFailure(
      response.status,
      parsed,
      token,
      Math.floor(Date.now() / 1000),
    );
    return failure(code, REASON[code]);
  } catch (error) {
    // ORICE exceptie devine JSON. O exceptie nerezolvata in Next produce o
    // pagina de eroare HTML, si o pagina de eroare HTML este starea pe care
    // acest card exista sa o faca imposibila.
    const detail = error instanceof Error ? error.name : "necunoscut";
    return failure(DOCUMENT_ERROR.upstream, `Storage nu a putut fi interogat (${detail}).`);
  }
}

const REASON: Record<DocumentErrorCode, string> = {
  [DOCUMENT_ERROR.expired]: "Legatura a expirat. Cere una noua; documentul este intact.",
  [DOCUMENT_ERROR.invalid]: "Jeton invalid. Legatura este stricata, nu expirata.",
  [DOCUMENT_ERROR.notFound]: "Obiectul nu exista la calea aceasta.",
  [DOCUMENT_ERROR.upstream]: "Storage a raspuns ceva ce nu recunoastem.",
  [DOCUMENT_ERROR.method]: "Metoda nepermisa.",
};

/** Orice alta metoda. Tot JSON, tot fara HTML. */
async function refuse(): Promise<NextResponse> {
  return failure(DOCUMENT_ERROR.method, "Numai GET.");
}

export const POST = refuse;
export const PUT = refuse;
export const PATCH = refuse;
export const DELETE = refuse;
export const HEAD = refuse;
