"use server";

// Scrierea setarilor de facturare. Cardul P3-108, goal G65 partea 1.
//
// APARARE PE DOUA NIVELURI, ca in product-actions.ts. Verificarea de rol de aici
// este a DOUA, nu prima: politica invoice_settings_owner_update din migratia 0063
// refuza deja o scriere venita de la un operator, la nivel de baza de date, si o
// refuza in liniste, filtrand randul. Verificarea din cod exista ca sa intoarca un
// mesaj romanesc inteligibil in loc de o salvare care pare sa reuseasca si nu
// schimba nimic.
//
// ERORILE SUNT ROMANESTI SI LEGATE DE CAMP. Un mesaj brut de Postgres pe ecran
// este un defect, nu un detaliu.
//
// NU SE INSEREAZA NIMIC SI NU SE STERGE NIMIC. Randul exista, scris de migratia
// 0063, iar authenticated nu are nici drept de insert nici de delete pe tabela.
// Aceasta actiune face exact un UPDATE pe randul unic.

import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { hasFacturareSettings } from "./schema-capability";

type Failure = { ok: false; message: string; field?: string };
export type ActionResult = { ok: true } | Failure;

const OWNER_ONLY = {
  ok: false,
  message: "Doar administratorul poate modifica setările de facturare.",
} as const;

export type InvoiceSettingsInput = {
  seriesPrefix: string;
  numberIncludesYear: boolean;
  /** Cum a fost tastata: "20", "20,5" sau "20.5". Se curata mai jos. */
  defaultVatRate: string;
  issuerName: string;
  issuerFiscalCode: string;
  issuerAddress: string;
  issuerBank: string;
  issuerIban: string;
};

/** Virgula zecimala este felul in care se scriu numerele pe un document
 *  romanesc, deci formularul o accepta si ea devine punct inainte de baza. */
function parseRate(raw: string): number | null {
  const clean = raw.trim().replace(",", ".");
  if (clean.length === 0) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const value = Number(clean);
  return Number.isFinite(value) ? value : null;
}

/** Gol devine null, ca o coloana nescrisa sa ramana goala si nu un sir vid:
 *  jumatatea necompletata a unui document trebuie sa se vada ca necompletata. */
function orNull(raw: string): string | null {
  const clean = raw.trim();
  return clean.length === 0 ? null : clean;
}

export async function saveInvoiceSettings(input: InvoiceSettingsInput): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;

  const prefix = input.seriesPrefix.trim();
  if (prefix.length === 0) {
    return {
      ok: false,
      message: "Prefixul seriei este obligatoriu.",
      field: "seriesPrefix",
    };
  }

  const rate = parseRate(input.defaultVatRate);
  if (rate === null) {
    return {
      ok: false,
      message: "Cota TVA implicită trebuie să fie un număr, cu cel mult două zecimale.",
      field: "defaultVatRate",
    };
  }
  if (rate > 100) {
    return {
      ok: false,
      message: "Cota TVA implicită nu poate depăși 100 %.",
      field: "defaultVatRate",
    };
  }

  const supabase = await createClient();
  if (!(await hasFacturareSettings(supabase))) {
    return { ok: false, message: "Facturarea nu este încă activă pe această bază de date." };
  }

  const { error } = await supabase
    .from("invoice_settings")
    .update({
      series_prefix: prefix,
      number_includes_year: input.numberIncludesYear,
      default_vat_rate: rate,
      issuer_name: orNull(input.issuerName),
      issuer_fiscal_code: orNull(input.issuerFiscalCode),
      issuer_address: orNull(input.issuerAddress),
      issuer_bank: orNull(input.issuerBank),
      issuer_iban: orNull(input.issuerIban),
      updated_by: user.id,
    })
    .eq("id", true);

  if (error) {
    // 23514 este o restrictie CHECK: prefix gol sau cota in afara intervalului.
    // Amandoua sunt deja prinse mai sus, deci un 23514 de aici inseamna ca baza
    // stie o regula pe care ecranul nu o stie, si atunci se spune asta pe fata.
    if (error.code === "23514") {
      return {
        ok: false,
        message: "Baza de date a refuzat valorile: verifică prefixul seriei și cota TVA.",
      };
    }
    if (error.code === "42501") return OWNER_ONLY;
    return { ok: false, message: "Setările nu au putut fi salvate. Încearcă din nou." };
  }

  revalidatePath("/setari");
  return { ok: true };
}
