import "server-only";

// Citirea unei facturi, pentru ecranul ei. Cardul P3-110, goal G65 partea 3.
//
// TREI RASPUNSURI SI NU DOUA, si distinctia este chiar ce vede omul:
//
//   pending  migratia 0063 nu este inca aplicata, deci ruta deseneaza linia
//            romaneasca de la SchemaPending in loc sa cada cu 500. Aceeasi poarta
//            hasFacturareSettings ca in partile 1 si 2, si NU una noua: 0063
//            creeaza enumul si toate cele patru tabele intr-o singura tranzactie.
//   missing  id-ul nu exista, deci 404, nu un ecran gol.
//   ok       factura.
//
// Un `null` pentru amandoua ar fi facut din fiecare fereastra de dinaintea aplicarii
// un 404, ceea ce ar fi spus despre fiecare factura ca nu exista.
//
// TOTALURILE NU SE CALCULEAZA AICI. Sunt cele scrise de
// invoice_lines_compute_totals si invoice_lines_sync_invoice_totals din 0063, si un
// al doilea calcul in TypeScript ar fi o a doua aritmetica care poate ajunge sa nu
// fie de acord cu documentul pe care il are clientul.
//
// ISTORICUL VINE DIN CELE SASE COLOANE DE STAMPILA. Motivul este scris in
// facturare-detail-types.ts si in antetul migratiei 0063: public.status_entity nu
// poarta eticheta 'invoice', iar adaugarea unei etichete de enum este o migratie, pe
// care acest card nu are voie sa o scrie.

import { createClient } from "@/lib/supabase/server";
import { hasFacturareSettings } from "./schema-capability";
import { getInvoiceSettings } from "./facturare-settings";
import { ownerDisplayName } from "./clients";
import { isUnitCode, type UnitCode } from "./units";
import { one } from "./row";
import type { InvoiceStatus } from "./facturare-types";
import type {
  InvoiceDetail,
  InvoiceEvent,
  InvoiceEventKind,
  InvoiceLineView,
} from "./facturare-detail-types";

const SELECT_INVOICE = `
  id, series, number, status, issue_date, due_date, notes, cancel_reason,
  subtotal_mdl, vat_total_mdl, total_mdl,
  created_at, created_by, issued_at, issued_by, paid_at, paid_by, cancelled_at, cancelled_by,
  client_id,
  clients ( id, name, fiscal_code, address ),
  project_id,
  projects ( id, name ),
  outbound_issue_id,
  outbound_issues ( id, reference ),
  invoice_lines (
    id, product_id, description, quantity, unit, unit_price_mdl, vat_rate,
    line_subtotal_mdl, line_vat_mdl, line_total_mdl, sort_order,
    products ( sku, name )
  )
`;

type Named = { id: string; name: string };

type LineRow = {
  id: string;
  product_id: string | null;
  description: string | null;
  quantity: number | string;
  unit: string;
  unit_price_mdl: number | string;
  vat_rate: number | string;
  line_subtotal_mdl: number | string;
  line_vat_mdl: number | string;
  line_total_mdl: number | string;
  sort_order: number | string | null;
  products?: { sku: string; name: string } | { sku: string; name: string }[] | null;
};

type InvoiceRow = {
  id: string;
  series: string | null;
  number: number | string | null;
  status: string;
  issue_date: string | null;
  due_date: string | null;
  notes: string | null;
  cancel_reason: string | null;
  subtotal_mdl: number | string | null;
  vat_total_mdl: number | string | null;
  total_mdl: number | string | null;
  created_at: string;
  created_by: string | null;
  issued_at: string | null;
  issued_by: string | null;
  paid_at: string | null;
  paid_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  client_id: string;
  clients?:
    | { id: string; name: string; fiscal_code: string | null; address: string | null }
    | { id: string; name: string; fiscal_code: string | null; address: string | null }[]
    | null;
  project_id: string | null;
  projects?: Named | Named[] | null;
  outbound_issue_id: string | null;
  outbound_issues?: { id: string; reference: string } | { id: string; reference: string }[] | null;
  invoice_lines?: LineRow[] | null;
};

/** numeric ajunge prin PostgREST ca sir. Number() o data, aici. */
function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export type InvoiceRead =
  | { state: "pending" }
  | { state: "missing" }
  | { state: "ok"; invoice: InvoiceDetail };

/**
 * O factura cu liniile, parti, totalurile si istoricul ei.
 *
 * UN CONT FARA PROFIL ACTIV NU PRIMESTE "pending" SI NICI O EROARE: politicile de
 * tip select filtreaza randuri, ceea ce este distinctia scrisa de migratia 0055,
 * deci el citeste zero randuri si primeste "missing". Ecranul lui este un 404, nu o
 * pagina alba si nu un mesaj despre o migratie.
 */
export async function getInvoice(id: string): Promise<InvoiceRead> {
  const supabase = await createClient();
  if (!(await hasFacturareSettings(supabase))) return { state: "pending" };

  const { data, error } = await supabase
    .from("invoices")
    .select(SELECT_INVOICE)
    .eq("id", id)
    .maybeSingle();

  // 22P02 este un uuid nevalid in adresa: acela este un id care nu exista, nu o
  // eroare de spus operatorului.
  if (error || !data) return { state: "missing" };

  const row = data as unknown as InvoiceRow;
  const client = one(row.clients ?? null);
  const project = one(row.projects ?? null);
  const issue = one(row.outbound_issues ?? null);

  const lines: InvoiceLineView[] = (row.invoice_lines ?? [])
    .map((l): InvoiceLineView => {
      const product = one(l.products ?? null);
      return {
        id: l.id,
        productId: l.product_id,
        productSku: product?.sku ?? null,
        productName: product?.name ?? null,
        description: l.description,
        unit: (isUnitCode(l.unit) ? l.unit : "pcs") as UnitCode,
        quantity: toNumber(l.quantity),
        unitPriceMdl: toNumber(l.unit_price_mdl),
        vatRate: toNumber(l.vat_rate),
        lineSubtotalMdl: toNumber(l.line_subtotal_mdl),
        lineVatMdl: toNumber(l.line_vat_mdl),
        lineTotalMdl: toNumber(l.line_total_mdl),
        sortOrder: toNumber(l.sort_order),
      };
    })
    // ORDINEA ESTE CEA A DOCUMENTULUI: sort_order, si la egalitate id-ul, ca doua
    // randari ale aceleiasi facturi sa nu poata aseza liniile altfel. PostgREST nu
    // promite nicio ordine pentru un rand incorporat.
    .sort((a, b) => (a.sortOrder === b.sortOrder ? a.id.localeCompare(b.id) : a.sortOrder - b.sortOrder));

  const events = await withNames(supabase, [
    { kind: "created" as InvoiceEventKind, at: row.created_at, userId: row.created_by },
    { kind: "issued" as InvoiceEventKind, at: row.issued_at, userId: row.issued_by },
    { kind: "paid" as InvoiceEventKind, at: row.paid_at, userId: row.paid_by },
    { kind: "cancelled" as InvoiceEventKind, at: row.cancelled_at, userId: row.cancelled_by },
  ]);

  // SETARILE SUNT EMITENTUL. Cand randul nu se poate citi, sirurile rămân goale si
  // ecranul spune romaneste ca datele emitentului se completează în Setări: o
  // jumatate necompletata a unui document trebuie sa se vada.
  const settings = await getInvoiceSettings();

  return {
    state: "ok",
    invoice: {
      id: row.id,
      series: row.series,
      number: row.number === null || row.number === undefined ? null : Number(row.number),
      status: row.status as InvoiceStatus,
      issueDate: row.issue_date,
      dueDate: row.due_date,
      notes: row.notes,
      cancelReason: row.cancel_reason,
      subtotalMdl: toNumber(row.subtotal_mdl),
      vatTotalMdl: toNumber(row.vat_total_mdl),
      totalMdl: toNumber(row.total_mdl),
      issuer: {
        name: settings?.issuerName ?? "",
        fiscalCode: settings?.issuerFiscalCode ?? "",
        address: settings?.issuerAddress ?? "",
        bank: settings?.issuerBank ?? "",
        iban: settings?.issuerIban ?? "",
      },
      client: {
        // Cheia straina refuza stergerea unui client legat de o factura, deci randul
        // incorporat exista; textele de mai jos sunt pentru cazul in care politicile
        // de citire l-ar ascunde, nu pentru o legatura rupta.
        id: client?.id ?? row.client_id,
        name: client?.name ?? "Client necunoscut",
        fiscalCode: client?.fiscal_code ?? "",
        address: client?.address ?? "",
      },
      project: project ? { id: project.id, name: project.name } : null,
      outboundIssue: issue ? { id: issue.id, reference: issue.reference } : null,
      lines,
      events,
    },
  };
}

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Cele patru momente care au avut loc, cu numele omului langa fiecare.
 *
 * O SINGURA INTEROGARE PE public.profiles, pentru toate id-urile deodata, si numai
 * cand exista vreunul. invoices.created_by trimite la auth.users si nu la
 * public.profiles, deci PostgREST nu poate incorpora numele: relatia nu exista in
 * schema pe care el o vede. De aceea este o a doua citire si nu un join.
 *
 * UN NUME CARE NU SE POATE CITI RAMANE null SI EVENIMENTUL RAMANE. Cine a facut-o
 * este util; cand s-a intamplat este necesar, si a ascunde momentul fiindca nu se
 * stie omul ar fi pierderea informatiei mai importante din cele doua.
 */
async function withNames(
  supabase: Client,
  raw: { kind: InvoiceEventKind; at: string | null; userId: string | null }[],
): Promise<InvoiceEvent[]> {
  const happened = raw.filter((e): e is { kind: InvoiceEventKind; at: string; userId: string | null } =>
    Boolean(e.at),
  );
  const ids = [...new Set(happened.map((e) => e.userId).filter((id): id is string => Boolean(id)))];

  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
    for (const p of (data ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
      names.set(p.id, ownerDisplayName(p));
    }
  }

  return happened
    .map((e): InvoiceEvent => ({
      kind: e.kind,
      at: e.at,
      by: e.userId ? (names.get(e.userId) ?? null) : null,
    }))
    // CELE MAI NOI INTAI, ca istoricul iesirii din components/orders/OutboundPanel.tsx:
    // doua istorice pe acelasi ecran nu au voie sa curga in doua directii.
    .sort((a, b) => (a.at === b.at ? 0 : a.at < b.at ? 1 : -1));
}
