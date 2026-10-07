// Poarta unei ciorne facute dintr-o Iesire. Cardul P3-171.
//
// O VANZARE DIRECTA NU SE FACTUREAZA NICIODATA, hotararea R-215, si pana la acest
// card regula statea numai in citirea getIssueInvoiceability, care ascunde butonul.
// Scrierea nu o stia: o cerere construita de mana crea o ciorna legata de o vanzare
// directa. Aici scrierea intreaba ACEEASI citire, si nu o copie a ei, inainte sa
// cheme baza.
//
// FISIER SEPARAT SI FARA "server-only", ca specificatia sa il poata incarca fara
// Supabase: citirea si salvarea vin din afara, deci se poate dovedi ca salvarea NU
// este chemata cand Iesirea este refuzata.
//
// NUMAI REFUZUL MODULUI OPRESTE SALVAREA. Celelalte refuzuri ale citirii (o Iesire
// fara pozitii, o factura care exista deja, o citire cazuta) sunt pentru buton si nu
// se adauga aici: o Iesire pe proiect se salveaza exact ca inainte, iar indexul
// invoices_one_live_per_outbound_issue din 0064 ramane garantia pentru a doua factura.

import { DIRECT_CLIENT_NOT_INVOICEABLE, type IssueInvoiceability } from "./facturare-create-types";

export type IssueGateResult<T> = { refused: string } | { saved: T };

export async function saveUnlessNeverInvoiceable<T>(
  issueId: string | null,
  readInvoiceability: (issueId: string) => Promise<IssueInvoiceability | null>,
  // PromiseLike si nu Promise: apelul PostgREST este un "thenable", nu un Promise.
  save: () => PromiseLike<T>,
): Promise<IssueGateResult<T>> {
  if (issueId !== null) {
    const invoiceability = await readInvoiceability(issueId);
    if (invoiceability?.neverInvoiceable) {
      return { refused: invoiceability.reason ?? DIRECT_CLIENT_NOT_INVOICEABLE };
    }
  }
  return { saved: await save() };
}
