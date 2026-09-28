import "server-only";

// Citirea setarilor de facturare. Cardul P3-108, goal G65 partea 1.
//
// UN SINGUR RAND, si tabela nu poate avea altul: cheia primara a lui
// public.invoice_settings este un boolean fixat pe true de o restrictie, deci un
// al doilea rand nu poate exista. De aceea nu exista niciun `order by` si niciun
// `limit` aici: nu se alege intre randuri, se citeste randul.
//
// NULL INSEAMNA "MIGRATIA 0063 NU ESTE INCA APLICATA", nu "nu sunt setari".
// Apelantul deseneaza atunci linia romaneasca de pe ecran in loc sa cada, care
// este intreaga ratiune a portii din schema-capability.ts.
//
// FISIER SEPARAT DE facturare-actions.ts, ca la clienti si la produse: un fisier
// pe grija, citirea intr-unul si scrierea in celalalt.

import { createClient } from "@/lib/supabase/server";
import { hasFacturareSettings } from "./schema-capability";
import type { InvoiceSettings } from "./facturare-types";

type SettingsRow = {
  series_prefix: string;
  number_includes_year: boolean;
  default_vat_rate: number | string;
  issuer_name: string | null;
  issuer_fiscal_code: string | null;
  issuer_address: string | null;
  issuer_bank: string | null;
  issuer_iban: string | null;
};

const COLUMNS =
  "series_prefix, number_includes_year, default_vat_rate, issuer_name, " +
  "issuer_fiscal_code, issuer_address, issuer_bank, issuer_iban";

/**
 * Setarile de facturare, sau null cand migratia 0063 nu este inca aplicata sau
 * cand cel care se uita nu are voie sa le citeasca.
 *
 * UN REFUZ DE CITIRE ESTE UN SET GOL, NU O EROARE: politicile de tip select
 * filtreaza randuri, ceea ce este distinctia pe care o scrie migratia 0055. Un
 * cont dezactivat primeste deci zero randuri si citeste null, exact ca inainte de
 * aplicare, si tot ecranul degradeaza in loc sa se prabuseasca.
 */
export async function getInvoiceSettings(): Promise<InvoiceSettings | null> {
  const supabase = await createClient();
  if (!(await hasFacturareSettings(supabase))) return null;

  const { data, error } = await supabase.from("invoice_settings").select(COLUMNS).maybeSingle();
  if (error || !data) return null;

  const row = data as unknown as SettingsRow;
  return {
    seriesPrefix: row.series_prefix,
    numberIncludesYear: row.number_includes_year,
    // numeric(5,2) ajunge prin PostgREST ca sir. Number() o data, aici, ca
    // ecranul sa nu mai aiba de gandit despre tipuri.
    defaultVatRate: Number(row.default_vat_rate),
    issuerName: row.issuer_name ?? "",
    issuerFiscalCode: row.issuer_fiscal_code ?? "",
    issuerAddress: row.issuer_address ?? "",
    issuerBank: row.issuer_bank ?? "",
    issuerIban: row.issuer_iban ?? "",
  };
}
