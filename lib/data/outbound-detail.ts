"use server";

// Detaliul unei iesiri, incarcat la deschiderea panoului.
//
// P3-110, goal G65 partea 3: pe langa iesire se citeste si daca ea se poate factura,
// IN ACELASI DRUM. Panoul are nevoie de amandoua ca sa deseneze butonul "Creează
// factură" sau propozitia romaneasca de langa el, si o a doua actiune de server ar fi
// un al doilea drum la baza pentru a desena un singur rand.

import { getOutboundIssue } from "./outbound";
import { getIssueInvoiceability } from "./facturare-create";
import { getSessionUser } from "@/lib/supabase/server";
import type { OutboundDetail } from "./outbound-types";

export async function loadOutboundDetail(issueId: string): Promise<OutboundDetail> {
  // O server action este un capat de retea, nu o functie interna.
  const user = await getSessionUser();
  if (!user) return { issue: null, invoiceability: null };

  const [issue, invoiceability] = await Promise.all([
    getOutboundIssue(issueId),
    getIssueInvoiceability(issueId),
  ]);
  return { issue, invoiceability };
}
