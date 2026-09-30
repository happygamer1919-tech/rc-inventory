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

// P3-116, goal G69 partea 4. ACEASTA FUNCTIE RAMANE SINGURUL DRUM DE CITIRE AL
// DATELOR FIRMEI. Secțiunea Date firmă nu are un al doilea: citeste chiar randul
// pe care il citeste si blocul Facturare, si pe care il citeste si factura cand isi
// tipareste emitentul (lib/data/facturare-detail.ts). O a doua functie ar fi un al
// doilea lucru de pus de acord, adica exact defectul pe care raportul de proiectare
// il numeste.

import { createClient } from "@/lib/supabase/server";
import { hasCompanyContactFields, hasFacturareSettings } from "./schema-capability";
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
  // P3-116. Cerute numai cand 0066 este aplicata, deci absente din obiect pana
  // atunci. Opționale in tip fiindca sunt opționale in interogare.
  issuer_vat_code?: string | null;
  issuer_phone?: string | null;
  issuer_email?: string | null;
};

const COLUMNS =
  "series_prefix, number_includes_year, default_vat_rate, issuer_name, " +
  "issuer_fiscal_code, issuer_address, issuer_bank, issuer_iban";

/** P3-116. Cele trei coloane ale migratiei 0066, cerute doar cand exista.
 *
 *  O COLOANA INEXISTENTA NU SE CERE, si asta nu este prudenta in exces: PostgREST
 *  raspunde 42703 pentru ea, citirea ar intoarce null, si blocul Facturare ar
 *  spune atunci "facturarea nu este activa" pe un ecran pe care este. Poarta
 *  hasCompanyContactFields este cea care decide. */
const CONTACT_COLUMNS = "issuer_vat_code, issuer_phone, issuer_email";

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

  // DOUA SONDE, DOUA MIGRATII. 0063 a adus tabela, 0066 cele trei coloane, si
  // intre fuziunea si aplicarea celei de a doua exista o fereastra in care tabela
  // exista si coloanele nu.
  const contactReady = await hasCompanyContactFields(supabase);
  const columns = contactReady ? `${COLUMNS}, ${CONTACT_COLUMNS}` : COLUMNS;

  const { data, error } = await supabase.from("invoice_settings").select(columns).maybeSingle();
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
    // GOL SE CITESTE CA GOL, niciodata ca o cratima si niciodata ca un text
    // inventat: o jumatate necompletata a datelor firmei trebuie sa se vada
    // necompletata. Acelasi tratament pe care il primesc deja cele cinci de sus.
    issuerVatCode: row.issuer_vat_code ?? "",
    issuerPhone: row.issuer_phone ?? "",
    issuerEmail: row.issuer_email ?? "",
    companyContactReady: contactReady,
  };
}
