// Factura ca PDF, pentru butonul "Descarcă PDF". Cardul P3-272, decizia lui Max din
// 2026-10-13.
//
// ACELASI ACCES CA ECRANUL FACTURII, FARA UN AL DOILEA MECANISM. proxy.ts refuza orice
// cerere fara sesiune (redirectare catre autentificare, ruta nu este pe lista publica),
// iar getInvoice citeste cu clientul sesiunii, deci politicile RLS sunt cele ale
// ecranului: un cont fara profil activ citeste zero randuri si primeste 404, ca
// pe /facturare/[id].
//
// O CIORNA NU ARE PDF. Nu are numar, iar un document fara numar nu este o factura: 409,
// cu propozitia romaneasca. Butonul nici nu se deseneaza pentru ea.
//
// ORICE ESEC ESTE JSON, NICIODATA UN PDF STRICAT: un fisier pe jumatate scris, salvat de
// browser ca "factura.pdf", ar arata ca o factura si nu s-ar deschide.

import { NextResponse } from "next/server";
import { getInvoice } from "@/lib/data/facturare-detail";
import { invoiceNumberText } from "@/lib/data/facturare-types";
import { renderInvoicePdf } from "@/lib/pdf/invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function refusal(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status, headers: { "cache-control": "no-store" } });
}

/** Numele fisierului: numarul facturii, numai cu semne sigure intr-un antet. */
function fileName(numberText: string): string {
  return `${numberText.replace(/[^A-Za-z0-9._-]+/g, "_")}.pdf`;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const read = await getInvoice(id);

  if (read.state === "pending") return refusal(503, "Facturarea nu este încă activă.");
  if (read.state === "missing") return refusal(404, "Factura nu există.");

  const { invoice } = read;
  const numberText = invoiceNumberText(invoice.series, invoice.number);
  if (invoice.status === "draft" || numberText === null) {
    return refusal(409, "O ciornă nu are PDF: numărul se alocă la emitere.");
  }

  try {
    const pdf = await renderInvoicePdf(invoice);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${fileName(numberText)}"`,
        "content-length": String(pdf.length),
        // Un document cu date de client nu sta in nicio memorie intermediara.
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.name : "necunoscut";
    console.error("factura PDF: randarea a esuat", { id, detail });
    return refusal(500, "PDF-ul nu a putut fi generat.");
  }
}
