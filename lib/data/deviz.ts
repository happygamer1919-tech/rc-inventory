// Citirile devizului, cardul P3-13b.
//
// PRETUL OFERTAT SI PRETUL CURENT SUNT DOUA NUMERE DIFERITE SI AMANDOUA SE
// CITESC AICI. deviz_lines.unit_price_mdl este instantaneul inghetat la momentul
// ofertarii, scris o singura data de actiunea care adauga linia, si nimic din
// acest fisier nu il reimprospateaza din catalog. products.unit_value_mdl este
// valoarea de azi si se citeste separat, ca sa poata fi ARATATA alaturi. Totalul
// foloseste instantaneul.
//
// Migratia 0025 nu are coloana de unitate pe linie: unitatea este a produsului
// si se randeaza din public.products.unit.

import { createClient } from "@/lib/supabase/server";
import { isUnitCode, type UnitCode } from "./units";
import type { DevizStatus } from "./deviz-types";

export type DevizLine = {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  unit: UnitCode;
  quantity: number;
  /** Inghetat la momentul ofertarii. Nu se recalculeaza niciodata din catalog. */
  quotedUnitPriceMdl: number;
  /** Valoarea de azi din catalog, citita ca sa fie aratata alaturi. */
  currentUnitPriceMdl: number;
  /** curent minus ofertat, pe unitate. Pozitiv inseamna ca produsul s-a scumpit. */
  unitDifferenceMdl: number;
  /** cantitate inmultita cu pretul OFERTAT. */
  lineTotalMdl: number;
  note: string | null;
  sortOrder: number;
};

export type Deviz = {
  id: string;
  projectId: string;
  name: string | null;
  version: number;
  status: DevizStatus;
  marginPercent: number;
  validUntil: string | null;
  notes: string | null;
  approvedAt: string | null;
  createdAt: string;
  lines: DevizLine[];
  subtotalMdl: number;
  adaosMdl: number;
  totalMdl: number;
};

/** Un rand de lista: destul ca sa alegi o versiune, nimic mai mult.
 *
 *  DOCTRINA DENSITATII: lista de versiuni arata versiunea, starea, valabilitatea
 *  si totalul, iar liniile traiesc pe versiunea deschisa. */
export type DevizSummary = {
  id: string;
  name: string | null;
  version: number;
  status: DevizStatus;
  validUntil: string | null;
  createdAt: string;
  lineCount: number;
  totalMdl: number;
};

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Rotunjire la ban, aplicata O SINGURA DATA per marime afisata.
 *
 *  Fara ea subtotalul afisat si suma liniilor afisate pot sa difere cu un ban,
 *  iar un deviz in care coloana nu se aduna este un deviz pe care nimeni nu il
 *  semneaza. */
function toBani(value: number): number {
  return Math.round(value * 100) / 100;
}

type LineRow = {
  id: string;
  product_id: string;
  quantity: unknown;
  unit_price_mdl: unknown;
  line_note: string | null;
  sort_order: number;
  products: { sku: string; name: string; unit: string; unit_value_mdl: unknown } | null;
};

type DevizRow = {
  id: string;
  project_id: string;
  name: string | null;
  version: number;
  status: DevizStatus;
  margin_percent: unknown;
  valid_until: string | null;
  notes: string | null;
  approved_at: string | null;
  created_at: string;
  deviz_lines: LineRow[] | null;
};

const DEVIZ_SELECT =
  "id, project_id, name, version, status, margin_percent, valid_until, notes, approved_at, created_at, " +
  "deviz_lines(id, product_id, quantity, unit_price_mdl, line_note, sort_order, products(sku, name, unit, unit_value_mdl))";

function toLine(row: LineRow): DevizLine {
  const quantity = toNumber(row.quantity);
  const quoted = toNumber(row.unit_price_mdl);
  const current = toNumber(row.products?.unit_value_mdl);
  return {
    id: row.id,
    productId: row.product_id,
    sku: row.products?.sku ?? "-",
    productName: row.products?.name ?? "-",
    unit: isUnitCode(row.products?.unit) ? (row.products?.unit as UnitCode) : "pcs",
    quantity,
    quotedUnitPriceMdl: quoted,
    currentUnitPriceMdl: current,
    unitDifferenceMdl: toBani(current - quoted),
    lineTotalMdl: toBani(quantity * quoted),
    note: row.line_note,
    sortOrder: row.sort_order,
  };
}

/** Subtotal, Adaos si Total, calculate in acelasi loc pentru lista si pentru
 *  fisa, ca doua ecrane sa nu ajunga la doua numere. */
export function devizTotals(
  lines: { lineTotalMdl: number }[],
  marginPercent: number,
): { subtotalMdl: number; adaosMdl: number; totalMdl: number } {
  const subtotal = toBani(lines.reduce((sum, l) => sum + l.lineTotalMdl, 0));
  const adaos = toBani((subtotal * marginPercent) / 100);
  return { subtotalMdl: subtotal, adaosMdl: adaos, totalMdl: toBani(subtotal + adaos) };
}

function toDeviz(row: DevizRow): Deviz {
  const lines = (row.deviz_lines ?? [])
    .map(toLine)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.sku.localeCompare(b.sku));
  const margin = toNumber(row.margin_percent);
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    version: row.version,
    status: row.status,
    marginPercent: margin,
    validUntil: row.valid_until,
    notes: row.notes,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    lines,
    ...devizTotals(lines, margin),
  };
}

/** Toate versiunile unui proiect, cea mai noua prima. */
export async function listProjectDevize(projectId: string): Promise<DevizSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("devize")
    .select(DEVIZ_SELECT)
    .eq("project_id", projectId)
    .order("version", { ascending: false });

  if (error) throw new Error(`Nu s-au putut citi devizele: ${error.message}`);

  return ((data ?? []) as unknown as DevizRow[]).map((row) => {
    const full = toDeviz(row);
    return {
      id: full.id,
      name: full.name,
      version: full.version,
      status: full.status,
      validUntil: full.validUntil,
      createdAt: full.createdAt,
      lineCount: full.lines.length,
      totalMdl: full.totalMdl,
    };
  });
}

export async function getDeviz(devizId: string): Promise<Deviz | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("devize")
    .select(DEVIZ_SELECT)
    .eq("id", devizId)
    .maybeSingle();

  if (error) throw new Error(`Nu s-a putut citi devizul: ${error.message}`);
  if (!data) return null;
  return toDeviz(data as unknown as DevizRow);
}

/** Versiunea deschisa pe fila: cea ceruta in adresa, altfel cea mai noua.
 *
 *  O singura interogare completa, nu una de lista plus una de fisa. */
export async function getProjectDevizView(
  projectId: string,
  requestedId: string | null,
): Promise<{ list: DevizSummary[]; open: Deviz | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("devize")
    .select(DEVIZ_SELECT)
    .eq("project_id", projectId)
    .order("version", { ascending: false });

  if (error) throw new Error(`Nu s-au putut citi devizele: ${error.message}`);

  const all = ((data ?? []) as unknown as DevizRow[]).map(toDeviz);
  const list: DevizSummary[] = all.map((d) => ({
    id: d.id,
    name: d.name,
    version: d.version,
    status: d.status,
    validUntil: d.validUntil,
    createdAt: d.createdAt,
    lineCount: d.lines.length,
    totalMdl: d.totalMdl,
  }));

  const open = (requestedId ? all.find((d) => d.id === requestedId) : undefined) ?? all[0] ?? null;
  return { list, open };
}

