import "server-only";

// Citirile ecranului de creare a unei facturi. Cardul P3-110, goal G65 partea 3.
//
// TREI LUCRURI SI NIMIC ALTCEVA:
//
//   getIssueInvoiceability  se poate factura aceasta Iesire, si daca nu, de ce nu
//   getInvoiceEditor        cu ce se deschide formularul
//   nextInvoiceNumberText   ce numar ar lua urmatoarea emitere din seria de azi
//
// NIMIC DE AICI NU SCRIE. Scrierile sunt in facturare-actions.ts, un fisier pe grija,
// exact cum sunt despartite citirea si scrierea la clienti si la produse.
//
// POARTA ESTE hasFacturareSettings SI NU UNA NOUA. 0063 creeaza enumul si toate cele
// patru tabele intr-o singura tranzactie, deci "exista invoice_settings" si "exista
// invoices" sunt acelasi fapt, si o a doua sonda ar fi un al doilea drum la baza pentru
// un raspuns care nu poate diferi. Scris pe larg in schema-capability.ts.

import { createClient } from "@/lib/supabase/server";
import { hasFacturareSettings } from "./schema-capability";
import { getInvoiceSettings } from "./facturare-settings";
import { listActiveProducts } from "./products";
import { listSelectableProjects } from "./projects";
import { listClientOptions } from "./projects-list";
import { chisinauToday } from "./format";
import { invoiceNumberText } from "./facturare-types";
import { isUnitCode, type UnitCode } from "./units";
import { one } from "./row";
import type {
  InvoiceDraftLine,
  InvoiceEditorOptions,
  InvoiceEditorView,
  IssueInvoiceability,
} from "./facturare-create-types";

/** Cate zile are scadenta implicita.
 *
 *  TREIZECI, si este o valoare implicita si nu o regula: operatorul o schimba in
 *  casuta de langa. Termenul real de plata este o clauza de contract, pe care acest
 *  proiect nu o cunoaste, iar o casuta goala ar fi o factura fara scadenta. */
const DUE_DAYS = 30;

/** Ziua `YYYY-MM-DD` mutata cu `days` zile, pe UTC si pe siruri.
 *
 *  PE SIRURI SI PE UTC, NICIODATA PE ORA LOCALA, acelasi motiv scris in
 *  facturare-list-types.ts: `new Date(sir)` este miezul noptii UTC, adica ora 3 in
 *  Chisinau, si ar muta ziua pentru o parte din fiecare zi. */
function shiftDay(day: string, days: number): string {
  const at = new Date(0);
  at.setUTCFullYear(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`;
}

/**
 * Un numeric venit de la PostgREST, scris pentru un camp de formular.
 *
 * NU ESTE COSMETICA, ESTE UN NUMAR CITIT GRESIT. PostgREST trimite numeric(14,3) ca
 * SIR cu toate zecimalele: cantitatea 3 soseste "3.000" si pretul 100 soseste "100.00".
 * Pus asa intr-un camp, "3.000" se citeste in Romania ca trei mii, fiindca punctul este
 * separatorul de mii. Number() apoi String() da "3", "2.5" si "100", care este acelasi
 * numar scris scurt. Punctul zecimal rămâne punct, si trebuie: un <input type="number">
 * cere separatorul cu punct, oricare ar fi limba paginii.
 */
function fieldNumber(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "";
}

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Cum arata numarul pe care l-ar lua urmatoarea emitere din seria zilei date.
 *
 * DOUA CITIRI SI NICIO SCRIERE. Seria se cere lui public.invoice_series_for, care
 * este singurul loc care stie ce este o serie, iar contorul se citeste din
 * public.invoice_number_series, pe care authenticated are DOAR drept de citire (0063,
 * sectiunea 9): nici acest cod, nici vreun ecran nu pot muta un contor.
 *
 * O SERIE FARA CONTOR INCEPE DE LA 1, ceea ce este chiar ce face public.issue_invoice
 * cand creeaza randul de contor la prima folosire.
 */
async function nextNumberFor(supabase: Client, on: string): Promise<string> {
  const { data: series, error } = await supabase.rpc("invoice_series_for", { p_on: on });
  const name = typeof series === "string" ? series : "";
  if (error || name.trim() === "") return "";

  const { data } = await supabase
    .from("invoice_number_series")
    .select("next_number")
    .eq("series", name)
    .maybeSingle();

  const next = data ? Number((data as { next_number: number | string }).next_number) : 1;
  return invoiceNumberText(name, Number.isFinite(next) && next >= 1 ? next : 1) ?? "";
}

/**
 * Numarul pe care l-ar lua urmatoarea emitere din seria zilei de azi.
 *
 * PENTRU PROPOZITIA DE CONFIRMARE DE LA Emite, pe ecranul unei facturi. Sirul gol
 * inseamna ca nu se poate spune, si atunci confirmarea scrie doar ce se intampla si nu
 * un numar inventat.
 */
export async function nextInvoiceNumberText(): Promise<string> {
  const supabase = await createClient();
  if (!(await hasFacturareSettings(supabase))) return "";
  return nextNumberFor(supabase, chisinauToday());
}

/**
 * Se poate face o factura din aceasta Iesire?
 *
 * Null inseamna ca migratia 0063 nu este aplicata, si atunci butonul nu apare deloc:
 * regula veche a acestui proiect este ca nimic din ce nu se poate folosi nu apare pe
 * ecran.
 *
 * DOUA MOTIVE DE REFUZ, cele doua pe care le numeste raportul de proiectare: o linie
 * fara pret, si o factura care exista deja.
 *
 * O FACTURA ANULATA NU BLOCHEAZA IESIREA, si asta este o judecata scrisa aici ca sa
 * poata fi citita: raportul spune "an invoice already exists for it", iar o factura
 * anulata este chiar declaratia ca acea Iesire NU a fost facturata. Daca ea ar bloca,
 * o greseala anulata regulamentar ar face Iesirea nefacturabila pentru totdeauna, si
 * singura ieșire din situatie ar fi o factura manuala care nu mai este legata de
 * nicio Iesire.
 */
export async function getIssueInvoiceability(issueId: string): Promise<IssueInvoiceability | null> {
  const supabase = await createClient();
  if (!(await hasFacturareSettings(supabase))) return null;

  const { data: lines, error: linesError } = await supabase
    .from("outbound_lines")
    .select("id, sale_price_mdl")
    .eq("outbound_issue_id", issueId);

  if (linesError) {
    return {
      canInvoice: false,
      reason: "Pozițiile ieșirii nu au putut fi citite. Reîncarcă pagina.",
      existingInvoice: null,
    };
  }

  const rows = (lines ?? []) as { id: string; sale_price_mdl: number | string | null }[];
  if (rows.length === 0) {
    return {
      canInvoice: false,
      reason: "Ieșirea nu are nicio poziție, deci nu este nimic de facturat.",
      existingInvoice: null,
    };
  }

  const { data: invoices, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, series, number, status")
    .eq("outbound_issue_id", issueId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  if (invoiceError) {
    return {
      canInvoice: false,
      reason: "Facturile acestei ieșiri nu au putut fi citite. Reîncarcă pagina.",
      existingInvoice: null,
    };
  }

  const existing = ((invoices ?? []) as { id: string; series: string | null; number: number | string | null }[])[0];
  if (existing) {
    return {
      canInvoice: false,
      reason: "Există deja o factură pentru această ieșire.",
      existingInvoice: {
        id: existing.id,
        numberText: invoiceNumberText(
          existing.series,
          existing.number === null || existing.number === undefined ? null : Number(existing.number),
        ),
      },
    };
  }

  if (rows.some((l) => l.sale_price_mdl === null || l.sale_price_mdl === "")) {
    return {
      canInvoice: false,
      // Textul spune si ce ESTE o astfel de iesire, fiindca operatorul care o vede
      // trebuie sa poata decide daca lipsa pretului este o greseala sau intentia:
      // ecranul de iesiri scrie deja ca pozitiile fara pret sunt eliberari netarifate.
      reason:
        "Ieșirea are o poziție fără preț unitar, deci nu poate fi facturată. O eliberare netarifată este de obicei către un șantier propriu.",
      existingInvoice: null,
    };
  }

  return { canInvoice: true, reason: null, existingInvoice: null };
}

export type InvoiceEditorRead =
  | { state: "pending" }
  | { state: "missing" }
  | { state: "refused"; message: string }
  | { state: "ok"; view: InvoiceEditorView; options: InvoiceEditorOptions };

/**
 * Cu ce se deschide formularul.
 *
 * TREI FELURI DE A AJUNGE AICI, si un singur tip de raspuns:
 *
 *   invoiceId   o ciorna salvata, care se modifica
 *   issueId     o Iesire, din care se completeaza o ciorna nesalvata
 *   niciunul    calea manuala, cu totul gol
 *
 * "refused" nu este o eroare: este o propozitie romaneasca despre de ce ecranul nu
 * poate fi deschis, de exemplu o factura care nu mai este ciorna sau o Iesire care nu
 * poate fi facturata. Ea se deseneaza pe ecran, cu o legatura inapoi.
 */
export async function getInvoiceEditor(input: {
  invoiceId?: string | null;
  issueId?: string | null;
}): Promise<InvoiceEditorRead> {
  const supabase = await createClient();
  if (!(await hasFacturareSettings(supabase))) return { state: "pending" };

  const today = chisinauToday();
  const [settings, options, nextNumberText] = await Promise.all([
    getInvoiceSettings(),
    editorOptions(),
    nextNumberFor(supabase, today),
  ]);
  const vatRate = String(settings?.defaultVatRate ?? 0);

  const base: InvoiceEditorView = {
    invoiceId: null,
    fromIssue: null,
    clientId: "",
    clientName: "",
    projectId: "",
    projectName: "",
    partiesLocked: false,
    issueDate: today,
    dueDate: shiftDay(today, DUE_DAYS),
    notes: "",
    vatRate,
    lines: [],
    nextNumberText,
  };

  if (input.invoiceId) {
    return draftView(supabase, input.invoiceId, base, options);
  }

  if (input.issueId) {
    return issueView(supabase, input.issueId, base, options);
  }

  return { state: "ok", view: base, options };
}

/** Formularul incarcat de pe o ciorna salvata. */
async function draftView(
  supabase: Client,
  invoiceId: string,
  base: InvoiceEditorView,
  options: InvoiceEditorOptions,
): Promise<InvoiceEditorRead> {
  const { data, error } = await supabase
    .from("invoices")
    .select(
      `id, status, due_date, notes, client_id, project_id,
       clients ( id, name ),
       projects ( id, name ),
       outbound_issue_id,
       outbound_issues ( id, reference ),
       invoice_lines (
         id, product_id, description, quantity, unit, unit_price_mdl, vat_rate, sort_order,
         products ( name )
       )`,
    )
    .eq("id", invoiceId)
    .maybeSingle();

  if (error || !data) return { state: "missing" };

  const row = data as unknown as {
    id: string;
    status: string;
    due_date: string | null;
    notes: string | null;
    client_id: string;
    clients?: { id: string; name: string } | { id: string; name: string }[] | null;
    project_id: string | null;
    projects?: { id: string; name: string } | { id: string; name: string }[] | null;
    outbound_issue_id: string | null;
    outbound_issues?: { id: string; reference: string } | { id: string; reference: string }[] | null;
    invoice_lines?: {
      id: string;
      product_id: string | null;
      description: string | null;
      quantity: number | string;
      unit: string;
      unit_price_mdl: number | string;
      vat_rate: number | string;
      sort_order: number | string | null;
      products?: { name: string } | { name: string }[] | null;
    }[] | null;
  };

  if (row.status !== "draft") {
    return {
      state: "refused",
      // NU SE MODIFICA, SI DE CE: o factura emisa este un document pe care il are si
      // clientul, iar o corectie se face prin anulare si o factura noua. Aceeasi
      // propozitie pe care o ridica si baza de date, doar scrisa cu diacritice.
      message:
        "Factura nu mai este ciornă, deci nu se mai modifică. O corecție se face prin anulare și o factură nouă.",
    };
  }

  const client = one(row.clients ?? null);
  const project = one(row.projects ?? null);
  const issue = one(row.outbound_issues ?? null);

  const stored = (row.invoice_lines ?? [])
    .map((l) => ({
      line: {
        id: l.id,
        productId: l.product_id ?? "",
        productName: one(l.products ?? null)?.name ?? "",
        description: l.description ?? "",
        unit: (isUnitCode(l.unit) ? l.unit : "pcs") as UnitCode,
        quantity: fieldNumber(l.quantity),
        unitPrice: fieldNumber(l.unit_price_mdl),
      } satisfies InvoiceDraftLine,
      sortOrder: Number(l.sort_order ?? 0),
      vatRate: fieldNumber(l.vat_rate),
    }))
    .sort((a, b) =>
      a.sortOrder === b.sortOrder ? a.line.id.localeCompare(b.line.id) : a.sortOrder - b.sortOrder,
    );

  return {
    state: "ok",
    view: {
      ...base,
      invoiceId: row.id,
      fromIssue: issue ? { id: issue.id, reference: issue.reference } : null,
      clientId: client?.id ?? row.client_id,
      clientName: client?.name ?? "Client necunoscut",
      projectId: project?.id ?? "",
      projectName: project?.name ?? "",
      // O CIORNA FACUTA DINTR-O IESIRE ISI PASTREAZA PARTILE CITITE. Una manuala isi
      // pastreaza clientul ales, care se poate schimba cat timp este ciorna.
      partiesLocked: row.outbound_issue_id !== null,
      dueDate: row.due_date ?? base.dueDate,
      notes: row.notes ?? "",
      // COTA VINE DE PE LINIILE SALVATE si nu din setari, cand exista linii: setarea
      // este un implicit pentru o factura NOUA, iar o ciorna scrisa saptamana trecuta
      // poarta cota cu care a fost scrisa. O setare schimbata intre timp nu are voie
      // sa rescrie in tacere o factura care exista.
      vatRate: stored[0]?.vatRate ?? base.vatRate,
      lines: stored.map((s) => s.line),
    },
    options,
  };
}

/** Formularul completat dintr-o Iesire, fara sa scrie nimic. */
async function issueView(
  supabase: Client,
  issueId: string,
  base: InvoiceEditorView,
  options: InvoiceEditorOptions,
): Promise<InvoiceEditorRead> {
  const invoiceability = await getIssueInvoiceability(issueId);
  if (invoiceability === null) return { state: "pending" };
  if (!invoiceability.canInvoice) {
    return { state: "refused", message: invoiceability.reason ?? "Ieșirea nu poate fi facturată." };
  }

  const { data, error } = await supabase
    .from("outbound_issues")
    .select(
      `id, reference, project_id,
       projects ( id, name, clients ( id, name ) ),
       outbound_lines (
         id, product_id, quantity, sale_price_mdl,
         products ( id, name, unit )
       )`,
    )
    .eq("id", issueId)
    .maybeSingle();

  if (error || !data) return { state: "missing" };

  const row = data as unknown as {
    id: string;
    reference: string;
    project_id: string;
    projects?:
      | { id: string; name: string; clients?: { id: string; name: string } | { id: string; name: string }[] | null }
      | { id: string; name: string; clients?: { id: string; name: string } | { id: string; name: string }[] | null }[]
      | null;
    outbound_lines?: {
      id: string;
      product_id: string;
      quantity: number | string;
      sale_price_mdl: number | string | null;
      products?: { id: string; name: string; unit: string } | { id: string; name: string; unit: string }[] | null;
    }[] | null;
  };

  const project = one(row.projects ?? null);
  const client = one(project?.clients ?? null);
  if (!client) {
    return {
      state: "refused",
      message: "Ieșirea nu are un client asociat, deci nu se poate factura.",
    };
  }

  // O LINIE DE FACTURA PER LINIE DE IESIRE, in ordinea in care baza le da, cu
  // cantitatea, unitatea si PRETUL IESIRII. Pretul nu se ia din catalog: al iesirii
  // este cel la care a plecat materialul, iar cel din catalog este valoarea de stoc
  // de astazi, adica alt numar cu alt inteles.
  const lines: InvoiceDraftLine[] = (row.outbound_lines ?? [])
    .map((l) => {
      const product = one(l.products ?? null);
      return {
        id: "",
        productId: l.product_id,
        productName: product?.name ?? "",
        description: "",
        unit: (isUnitCode(product?.unit) ? (product!.unit as UnitCode) : "pcs") as UnitCode,
        quantity: fieldNumber(l.quantity),
        unitPrice: l.sale_price_mdl === null ? "" : fieldNumber(l.sale_price_mdl),
      };
    })
    .sort((a, b) => a.productName.localeCompare(b.productName, "ro"));

  return {
    state: "ok",
    view: {
      ...base,
      fromIssue: { id: row.id, reference: row.reference },
      clientId: client.id,
      clientName: client.name,
      projectId: project?.id ?? "",
      projectName: project?.name ?? "",
      partiesLocked: true,
      lines,
    },
    options,
  };
}

/** Din ce se alege pe calea manuala: clientii activi, proiectele deschise, catalogul. */
async function editorOptions(): Promise<InvoiceEditorOptions> {
  const [clients, projects, products] = await Promise.all([
    listClientOptions(),
    listSelectableProjects(),
    listActiveProducts(),
  ]);

  return {
    clients,
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      clientId: p.clientId,
      clientName: p.clientName,
    })),
    products: products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, unit: p.unit })),
  };
}
