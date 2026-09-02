// EXT-08. /api/documents fara nicio cale.
//
// Ruta cu segmente este [...path] si ea nu se potriveste cu prefixul gol.
// Fara acest fisier, Next raspunde cu pagina lui 404, care este HTML, si
// contractul spune "niciodata text/html pe nicio cale de esec". O cerere fara
// cale este o cerere pentru un obiect care nu exista, deci 404, in JSON.

import { NextResponse } from "next/server";
import { DOCUMENT_ERROR, DOCUMENT_STATUS } from "@/lib/data/document-url";

export const dynamic = "force-dynamic";

function notFound(): NextResponse {
  return NextResponse.json(
    {
      code: DOCUMENT_ERROR.notFound,
      error: "Cale absenta.",
      document_url_contract: "docs/contracts/document-url.md",
    },
    {
      status: DOCUMENT_STATUS[DOCUMENT_ERROR.notFound],
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    },
  );
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
export const HEAD = notFound;
