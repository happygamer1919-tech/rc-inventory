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
// 0063, iar authenticated nu are nici drept de insert nici drept de stergere pe
// tabela. Aceasta actiune face exact un UPDATE pe randul unic.
//
// P3-110, goal G65 partea 3, A ADAUGAT SCRIERILE UNEI FACTURI IN ACEST FISIER:
// saveInvoiceDraft, issueInvoice, markInvoicePaid si cancelInvoice. Antetul de mai
// jos le priveste pe toate. UN CUVANT A FOST SCHIMBAT IN PROPOZITIA DE DEASUPRA, de
// la cel englezesc la "stergere", ca acceptanta cardului P3-110 sa poata fi
// verificata: ea cere ca o cautare a cuvantului englezesc peste lib/data/facturare*
// sa nu gaseasca nimic, iar un cuvant intr-un comentariu ar fi trecut drept o cale
// de stergere pentru cine citeste rezultatul cautarii. Intelesul propozitiei este
// neschimbat.

import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { hasCompanyContactFields, hasFacturareSettings } from "./schema-capability";
import { isUnitCode } from "./units";
import { chisinauToday, formatDate } from "./format";
import { invoiceNumberText, type InvoiceStatus } from "./facturare-types";
import { getIssueInvoiceability } from "./facturare-create";
import { DIRECT_CLIENT_NOT_INVOICEABLE } from "./facturare-create-types";
import { saveUnlessNeverInvoiceable } from "./facturare-issue-gate";

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


// ===========================================================================
// P3-116, goal G69 partea 4. DATELE FIRMEI, SALVATE DIN SECTIUNEA Date firmă
// ===========================================================================
//
// ACELASI RAND, A DOUA FORMA DE PE ECRAN. Nu exista o a doua tabela, nu exista o
// copie si nu exista un "profil de firma" pe langa: secțiunea Date firmă scrie
// chiar randul unic pe care il scrie si blocul Facturare, prin chiar acest fisier.
// Raportul de proiectare docs/reports/2026-09-30-author-setari-design.md spune de
// ce: doua locuri care tin IDNO-ul aceleiasi firme este exact felul in care ajung
// sa se contrazica, iar cel greșit este intotdeauna cel care s-a tiparit.
//
// FIECARE FORMA SCRIE NUMAI CAMPURILE EI, si aceasta este cerinta pe care raportul
// o pune explicit: "two forms now write to one row, so each form saves only its
// own fields and never writes back a blank over the other's". Deci:
//   - saveInvoiceSettings (mai sus) scrie NUMEROTAREA si cota, plus cele cinci
//     date ale firmei pe care blocul Facturare le arata de la P3-108. Este
//     NESCHIMBATA: aceleasi campuri, acelasi mesaj, acelasi data-testid.
//   - saveCompanyDetails (mai jos) scrie CELE OPT DATE ALE FIRMEI si NICIODATA
//     prefixul seriei, anul din numar sau cota TVA. O cautare in acest corp nu
//     gaseste series_prefix, number_includes_year sau default_vat_rate, si aceea
//     este toata garantia ca formularul de Date firmă nu poate atinge numerotarea.
//
// DE CE CELE CINCI SE ARATA IN DOUA LOCURI SI NU S-AU MUTAT. Cazul 2 din
// tests/e2e/facturare-settings.spec.ts completeaza `facturare-issuer-*` in blocul
// Facturare, apasa `facturare-save` si le citeste inapoi, iar acest card nu are
// voie sa atinga acel test. A muta campurile ar fi insemnat sa mut si testul, adica
// sa schimb o proba ca sa se potriveasca unei preferinte. Ele stau deci in ambele
// locuri, pe UN SINGUR RAND, deci nu se pot contrazice: ce se salveaza intr-o
// secțiune se citeste in cealalta la urmatoarea incarcare, si asta este masurat de
// cazul 3 al tests/e2e/setari-date-firma.spec.ts.
//
// COTA TVA (un procent pe o linie) SI CODUL TVA (numarul de inregistrare al firmei)
// SUNT DOUA LUCRURI. Aceasta actiune atinge numai al doilea. Cazul 4 al aceluiasi
// spec probeaza ca schimbarea unuia nu schimba celalalt.

export type CompanyDetailsInput = {
  issuerName: string;
  issuerFiscalCode: string;
  issuerAddress: string;
  issuerBank: string;
  issuerIban: string;
  /** Codul de inregistrare ca platitor de TVA. ALT NUMAR DECAT IDNO. */
  issuerVatCode: string;
  issuerPhone: string;
  issuerEmail: string;
};

/** Mesajul de refuz al secțiunii Date firmă. Propriul lui text, fiindca omul nu
 *  este pe blocul de facturare cand il citeste. */
const COMPANY_OWNER_ONLY = {
  ok: false,
  message: "Doar administratorul poate modifica datele firmei.",
} as const;

export async function saveCompanyDetails(input: CompanyDetailsInput): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  // A DOUA LINIE SI NU PRIMA, ca la saveInvoiceSettings: politica
  // invoice_settings_owner_update refuza deja scrierea in baza, si o refuza in
  // liniste filtrand randul. Aceasta verificare exista ca sa intoarca o propoziție
  // romaneasca in loc de o salvare care pare sa reuseasca si nu schimba nimic.
  if (user.role !== "owner") return COMPANY_OWNER_ONLY;

  const supabase = await createClient();
  if (!(await hasFacturareSettings(supabase))) {
    return { ok: false, message: "Facturarea nu este încă activă pe această bază de date." };
  }

  // NICIUN CAMP NU ESTE OBLIGATORIU, si asta este decizia lui 0063 pastrata: toate
  // opt sunt nullable si goale, fiindca schema nu inventeaza date de firma. O
  // jumatate necompletata a unui document trebuie sa se vada necompletata, iar un
  // IDNO inventat nu s-ar vedea.
  const patch: Record<string, string | null> = {
    issuer_name: orNull(input.issuerName),
    issuer_fiscal_code: orNull(input.issuerFiscalCode),
    issuer_address: orNull(input.issuerAddress),
    issuer_bank: orNull(input.issuerBank),
    issuer_iban: orNull(input.issuerIban),
    updated_by: user.id,
  };

  // CELE TREI COLOANE ALE MIGRATIEI 0066 SE SCRIU NUMAI CAND EXISTA. Intre
  // fuziunea si aplicarea lui 0066 exista o fereastra de vreo doua minute in care
  // tabela exista si coloanele nu; un update care le-ar numi ar fi refuzat de
  // PostgREST cu 42703 si ar pierde si cele cinci salvate impreuna cu ele.
  const contactReady = await hasCompanyContactFields(supabase);
  if (contactReady) {
    patch.issuer_vat_code = orNull(input.issuerVatCode);
    patch.issuer_phone = orNull(input.issuerPhone);
    patch.issuer_email = orNull(input.issuerEmail);
  }

  const { error } = await supabase.from("invoice_settings").update(patch).eq("id", true);

  if (error) {
    if (error.code === "42501") return COMPANY_OWNER_ONLY;
    // 42703 nu ar trebui sa ajunga aici: poarta de mai sus il previne. Daca ajunge,
    // se spune romaneste ce se intampla in loc sa se arate un cod de Postgres.
    if (error.code === "42703") {
      return {
        ok: false,
        message: "Câmpurile noi ale firmei nu sunt încă active pe această bază de date.",
      };
    }
    return { ok: false, message: "Datele firmei nu au putut fi salvate. Încearcă din nou." };
  }

  revalidatePath("/setari");
  // Factura isi citeste emitentul din acelasi rand, deci ecranul unei facturi
  // trebuie sa vada imediat ce s-a schimbat aici.
  revalidatePath("/facturi");
  return { ok: true };
}


// ===========================================================================
// P3-110, goal G65 partea 3. CE SE POATE FACE CU O FACTURA
// ===========================================================================
//
// PATRU SCRIERI SI NICIO A CINCEA. Se salveaza o ciorna, se emite, se marcheaza
// platita, se anuleaza. NU EXISTA NICIO STERGERE, in nicio stare, pentru niciun rol,
// si nu fiindca s-a uitat: migratia 0063 nu da nimanui drept de stergere pe niciuna
// din cele patru tabele si nu creeaza nicio politica de stergere, iar sectiunea 11 a
// ei verifica amandoua lucrurile la fiecare rulare. O factura nedorita se ANULEAZA cu
// un motiv si rămâne de citit. Raportul de proiectare spune despre o ciorna nefolosita
// ca ea "may genuinely be thrown away"; linia goalului spune "Nothing is ever
// deleted", iar aceasta este linia care se respecta, ca la cardul P3-84, care a dat
// ciornelor de extragere o stare de anulare exact ca sa nu fie sterse.
//
// APARAREA ESTE PE DOUA NIVELURI, ca mai sus si ca in product-actions.ts. Declansatorul
// invoices_require_draft_to_edit din 0063 refuza deja orice modificare pe o factura
// care nu mai este ciorna, iar functia public.issue_invoice refuza deja o a doua
// emitere. Verificarile de aici exista ca sa intoarca o propozitie romaneasca cu
// diacritice in loc de un mesaj brut de Postgres, si nu ca sa inlocuiasca garantia.
//
// NUMARUL NU SE CALCULEAZA NICIODATA AICI. Singura cale prin care o factura primeste
// un numar este public.issue_invoice, care il aloca sub blocaj de rand in tranzactia
// care emite. Antetul migratiei spune ce s-ar intampla altfel: doi operatori cu acelasi
// numar, sau o gaura in serie.
//
// STOCUL NU SE ATINGE. Emiterea unei facturi nu miscă niciun material si nu schimba
// niciun lot: Iesirea a facut deja asta, iar factura este documentul care o urmeaza.

const UUID =/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SESSION_GONE: Failure = {
  ok: false,
  message: "Sesiune expirată. Autentifică-te din nou.",
};

const NOT_ACTIVE: Failure = {
  ok: false,
  message: "Facturarea nu este încă activă pe această bază de date.",
};

/** O cantitate: strict pozitiva, cel mult trei zecimale, ca numeric(14,3) din 0063.
 *
 *  VIRGULA ZECIMALA ESTE ACCEPTATA, fiindca asa se scriu numerele pe un document
 *  romanesc, exact cum o accepta deja parseRate mai sus. */
function parseQuantity(raw: string): number | null {
  const clean = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(clean)) return null;
  const value = Number(clean);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Un preț: zero sau pozitiv, cel mult doi bani, ca numeric(14,2) din 0063.
 *
 *  ZERO ESTE PERMIS si nu este o scapare: o poziție trecuta pe factura la zero lei
 *  este o poziție oferita, iar constrangerea invoice_lines_unit_price_non_negative
 *  spune acelasi lucru. Ce nu este permis este un camp gol, care nu este un preț. */
function parseAmount(raw: string): number | null {
  const clean = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const value = Number(clean);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** O zi `YYYY-MM-DD`, sau null cand casuta este goala sau nu este o zi. */
function parseDay(raw: string): string | null {
  const clean = raw.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : null;
}

/**
 * Refuzul bazei de date, in romana cu diacritice.
 *
 * SE TRADUCE DUPA COD SI NU SE ARATA TEXTUL BRUT. Mesajele din migratia 0063 sunt
 * romanesti si sunt scrise FARA DIACRITICE, deliberat, fiindca o schema nu poarta
 * text de interfata (antetul lui 0063, sectiunea 1). A le pune direct pe ecran ar
 * insemna romana fara diacritice pe un ecran, ceea ce regula 11 din CLAUDE.md
 * interzice. Codul, in schimb, spune exact ce s-a intamplat.
 */
function refusal(error: { code?: string; message?: string; details?: string } | null): Failure {
  const code = error?.code ?? "";
  // 23505 unique_violation. P3-111, finding G5: indexul parțial
  // invoices_one_live_per_outbound_issue din migratia 0064 refuza a doua factura
  // neanulata a aceleiasi Ieșiri, deci ecranul trebuie sa arate propoziția, nu codul.
  //
  // SE CITESTE NUMELE CONSTRANGERII SI NU NUMAI CODUL. Pe aceasta tabela 23505 poate
  // veni si de la invoices_number_unique_per_series, iar propoziția despre o Ieșire
  // pusa pe o coliziune de serie ar fi un mesaj fals. Numele apare in textul brut al
  // erorii lui PostgreSQL, care nu ajunge niciodata pe ecran.
  if (code === "23505") {
    const raw = `${error?.message ?? ""} ${error?.details ?? ""}`;
    if (raw.includes("invoices_one_live_per_outbound_issue")) {
      return {
        ok: false,
        message:
          "Există deja o factură pentru această ieșire. Deschide-o din ecranul ieșirii, sau anulează-o cu un motiv dacă trebuie făcută alta.",
      };
    }
    return {
      ok: false,
      message: "Baza de date a refuzat o valoare care există deja. Reîncarcă pagina și încearcă din nou.",
    };
  }
  // 23001 restrict_violation: declansatorul de ciorna, sau o emitere a doua oara.
  if (code === "23001") {
    return {
      ok: false,
      message:
        "Factura nu mai este ciornă, deci nu se mai modifică. O corecție se face prin anulare și o factură nouă.",
    };
  }
  // 42501 insufficient_privilege: niciun profil activ.
  if (code === "42501") {
    return { ok: false, message: "Contul tău nu are dreptul să facă această operațiune." };
  }
  // 23514 CHECK: o valoare pe care baza o refuza si pe care ecranul nu a prins.
  if (code === "23514") {
    return {
      ok: false,
      message: "Baza de date a refuzat valorile facturii. Verifică cantitățile, prețurile și cota TVA.",
    };
  }
  // P0001 cu `direct_client` in text: P3-171, migratia 0073. Ciorna cerea o
  // vanzare directa, care nu se factureaza niciodata. Se citeste si textul, fiindca
  // P0001 este codul implicit al oricarui `raise exception`.
  if (code === "P0001" && `${error?.message ?? ""}`.includes("direct_client")) {
    return { ok: false, message: DIRECT_CLIENT_NOT_INVOICEABLE };
  }
  // 02000 no_data_found si P0002: factura nu mai exista.
  if (code === "02000" || code === "P0002") {
    return { ok: false, message: "Factura nu mai există. Reîncarcă pagina." };
  }
  return { ok: false, message: "Operațiunea nu a reușit. Încearcă din nou." };
}

/** Ce trimite formularul pentru o linie. Siruri, fiindca vin dintr-un camp. */
export type InvoiceDraftLineInput = {
  /** Id-ul randului din public.invoice_lines, sau sir gol pentru o linie nouă. */
  id: string;
  productId: string;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
};

export type InvoiceDraftInput = {
  /** Null cand se creeaza, id-ul ciornei cand se modifica. */
  invoiceId: string | null;
  /** Iesirea din care se face factura, cand se face din una. */
  outboundIssueId: string | null;
  clientId: string;
  /** Sir gol cand factura nu are proiect: nu tot ce se factureaza este un șantier. */
  projectId: string;
  dueDate: string;
  notes: string;
  vatRate: string;
  lines: InvoiceDraftLineInput[];
};

export type InvoiceSaveResult = { ok: true; invoiceId: string } | Failure;

type CleanLine = {
  id: string;
  product_id: string | null;
  description: string | null;
  unit: string;
  quantity: number;
  unit_price_mdl: number;
  vat_rate: number;
};

/**
 * Salvează o ciornă: o creează cand nu are id, o rescrie cand are.
 *
 * UN SINGUR APEL, SI EL ESTE O TRANZACTIE. Cardul P3-111, goal G67, finding G6.
 * Pana atunci salvarea era DOUA cereri PostgREST la creare si una pe linie la
 * modificare: antetul facturii se scria intai, liniile pe urma, iar cand a doua cerere
 * cadea functia intorcea un refuz si RANDUL FACTURII RAMANEA. Fara numar, fara linii,
 * pe lista lunii, si fara nicio cale de a-l scoate, fiindca public.invoices nu are nici
 * drept de stergere nici politica de stergere pentru niciun rol, administratorul
 * inclus. Singura ieșire era sa fie anulat, ceea ce consuma un numar real dintr-o serie
 * legala pentru un document care nu a fost niciodata compus.
 *
 * Acum scrierea este public.save_invoice_draft din migratia 0064: antetul si liniile
 * intr-o singura tranzactie, deci un refuz nu lasa nimic in urma. Verificarile
 * romanesti de mai jos nu s-au schimbat si nu sunt inlocuite de functie: ele dau
 * propoziția cu diacritice si campul de lângă ea, iar functia este garanția.
 *
 * LINIILE SE SCRIU O SINGURA DATA, LA SALVARE, si de aici vine forma ecranului.
 * Cat timp factura se COMPUNE, nimic nu este in baza, deci o linie scoasa nu sterge
 * nimic si scoaterea este libera: aceea este calea pe care goalul o descrie, cea de pe
 * o Iesire. O linie care a fost scrisă nu mai poate fi scoasă de nimeni, fiindca
 * public.invoice_lines nu are nici drept de stergere nici politica de stergere, si
 * functia aceasta o spune pe fata mai jos in loc sa lase o linie sa dispară de pe ecran
 * si sa rămână in document.
 */
export async function saveInvoiceDraft(input: InvoiceDraftInput): Promise<InvoiceSaveResult> {
  const user = await getSessionUser();
  if (!user) return SESSION_GONE;

  if (!UUID.test(input.clientId.trim())) {
    return { ok: false, message: "Alege clientul facturii.", field: "clientId" };
  }
  const projectId = input.projectId.trim();
  if (projectId !== "" && !UUID.test(projectId)) {
    return { ok: false, message: "Proiectul ales nu este valid. Alege din listă.", field: "projectId" };
  }

  const rate = parseRate(input.vatRate);
  if (rate === null || rate > 100) {
    return {
      ok: false,
      message: "Cota TVA trebuie să fie un număr între 0 și 100, cu cel mult două zecimale.",
      field: "vatRate",
    };
  }

  const dueDate = input.dueDate.trim() === "" ? null : parseDay(input.dueDate);
  if (input.dueDate.trim() !== "" && dueDate === null) {
    return { ok: false, message: "Data scadenței nu este validă.", field: "dueDate" };
  }

  const clean: CleanLine[] = [];
  for (const [index, line] of input.lines.entries()) {
    const productId = line.productId.trim();
    const description = line.description.trim();
    if (productId !== "" && !UUID.test(productId)) {
      return { ok: false, message: `Poziția ${index + 1}: produsul ales nu este valid.`, field: "lines" };
    }
    if (productId === "" && description === "") {
      return {
        ok: false,
        message: `Poziția ${index + 1}: alege un produs sau scrie o denumire.`,
        field: "lines",
      };
    }
    if (!isUnitCode(line.unit)) {
      return { ok: false, message: `Poziția ${index + 1}: alege unitatea de măsură.`, field: "lines" };
    }
    const quantity = parseQuantity(line.quantity);
    if (quantity === null) {
      return {
        ok: false,
        message: `Poziția ${index + 1}: cantitatea trebuie să fie un număr mai mare decât zero.`,
        field: "lines",
      };
    }
    const unitPrice = parseAmount(line.unitPrice);
    if (unitPrice === null) {
      return {
        ok: false,
        message: `Poziția ${index + 1}: prețul unitar trebuie să fie un număr, cu cel mult doi bani.`,
        field: "lines",
      };
    }
    clean.push({
      id: line.id.trim(),
      product_id: productId === "" ? null : productId,
      description: description === "" ? null : description,
      unit: line.unit,
      quantity,
      unit_price_mdl: unitPrice,
      vat_rate: rate,
    });
  }

  if (clean.length === 0) {
    return { ok: false, message: "Adaugă cel puțin o poziție pe factură.", field: "lines" };
  }

  const supabase = await createClient();
  if (!(await hasFacturareSettings(supabase))) return NOT_ACTIVE;

  const invoiceId = input.invoiceId?.trim() ?? "";

  if (invoiceId === "") {
    const outboundIssueId = input.outboundIssueId?.trim() ?? "";
    if (outboundIssueId !== "" && !UUID.test(outboundIssueId)) {
      return { ok: false, message: "Ieșirea din care se face factura nu este validă." };
    }

    // ZIUA EMITERII NU SE TRIMITE, deliberat, si functia nu o scrie. 0063 o da la
    // Emite, si partea 2 se sprijină pe asta: un rand fara issue_date este o ciornă si
    // ziua lui pe lista este ziua crearii. O ciornă care ar purta o zi de emitere ar fi
    // un rand despre care lista ar spune ca a fost emis in ziua aceea.
    //
    // P3-171. O VANZARE DIRECTA ESTE REFUZATA INAINTE DE APEL, cu propozitia pe care
    // ecranul Iesirii o arata deja. Ecranul nu ofera niciodata butonul, dar o cerere
    // construita de mana nu trece prin ecran. Functia din 0073 o refuza si ea.
    const gated = await saveUnlessNeverInvoiceable(
      outboundIssueId === "" ? null : outboundIssueId,
      getIssueInvoiceability,
      () =>
        supabase.rpc("save_invoice_draft", {
          p_client_id: input.clientId.trim(),
          p_lines: rpcLines(clean),
          p_invoice_id: null,
          p_project_id: projectId === "" ? null : projectId,
          p_outbound_issue_id: outboundIssueId === "" ? null : outboundIssueId,
          p_due_date: dueDate,
          p_notes: input.notes.trim() === "" ? null : input.notes.trim(),
        }),
    );
    if ("refused" in gated) return { ok: false, message: gated.refused };
    const created = gated.saved;
    if (created.error) return refusal(created.error);
    const id = idFromRpc(created.data);
    if (id === null) {
      return { ok: false, message: "Factura nu a putut fi salvată. Reîncarcă pagina și încearcă din nou." };
    }

    revalidatePath("/facturare");
    revalidatePath("/comenzi");
    return { ok: true, invoiceId: id };
  }

  if (!UUID.test(invoiceId)) return { ok: false, message: "Factura nu mai există. Reîncarcă pagina." };

  const current = await supabase
    .from("invoices")
    .select("id, status, invoice_lines ( id )")
    .eq("id", invoiceId)
    .maybeSingle();

  if (current.error || !current.data) return { ok: false, message: "Factura nu mai există. Reîncarcă pagina." };

  const row = current.data as unknown as { status: string; invoice_lines?: { id: string }[] | null };
  if (row.status !== "draft") return refusal({ code: "23001" });

  // O LINIE SCRISA NU POATE FI SCOASA, SI ASTA SE SPUNE. Ecranul nu oferă butonul,
  // dar o pagina veche, un buton dublu apasat sau o cerere construita de mana ar putea
  // trimite mai puține linii decat are factura. A accepta in liniste ar lasa linia in
  // document si ar arata ca a dispărut, ceea ce este cel mai rău dintre cele trei
  // rezultate posibile.
  const stored = new Set((row.invoice_lines ?? []).map((l) => l.id));
  const sent = new Set(clean.map((l) => l.id).filter((id) => id !== ""));
  for (const id of stored) {
    if (!sent.has(id)) {
      return {
        ok: false,
        message:
          "O poziție care a fost deja salvată nu poate fi scoasă de pe factură, fiindcă nimic nu se șterge aici. Anulează ciorna cu un motiv și fă o factură nouă.",
        field: "lines",
      };
    }
  }

  for (const line of clean) {
    if (line.id !== "" && !stored.has(line.id)) {
      return { ok: false, message: "O poziție trimisă nu aparține acestei facturi. Reîncarcă pagina." };
    }
  }

  // ACELASI APEL SI PENTRU MODIFICARE, si pentru acelasi motiv: antetul si fiecare
  // linie erau cereri separate, deci un refuz la jumatate lasa unele linii scrise si
  // altele nu, adica o ciornă care nu este nici cea de dinainte nici cea de acum.
  const written = await supabase.rpc("save_invoice_draft", {
    p_client_id: input.clientId.trim(),
    p_lines: rpcLines(clean),
    p_invoice_id: invoiceId,
    p_project_id: projectId === "" ? null : projectId,
    p_outbound_issue_id: null,
    p_due_date: dueDate,
    p_notes: input.notes.trim() === "" ? null : input.notes.trim(),
  });
  if (written.error) return refusal(written.error);

  revalidatePath("/facturare");
  revalidatePath(`/facturare/${invoiceId}`);
  revalidatePath("/comenzi");
  return { ok: true, invoiceId };
}

/** Liniile in forma pe care o citeste public.save_invoice_draft: un sir JSON, in
 *  ORDINEA DE PE ECRAN, fiindca functia scrie `sort_order` din poziția in sir.
 *
 *  Id-ul gol rămâne gol si nu devine null: functia il citeste cu `nullif(..., '')`, deci
 *  cele doua inseamna acelasi lucru pentru ea, iar sirul gol este exact ce trimite
 *  formularul pentru o linie care nu a fost scrisa niciodata. */
function rpcLines(lines: CleanLine[]): Record<string, unknown>[] {
  return lines.map((l) => ({
    id: l.id,
    product_id: l.product_id,
    description: l.description,
    unit: l.unit,
    quantity: l.quantity,
    unit_price_mdl: l.unit_price_mdl,
    vat_rate: l.vat_rate,
  }));
}

/** Id-ul intors de functie. PostgREST intoarce un scalar fie direct, fie intr-un sir de
 *  un element, deci se citesc amandoua formele si nimic nu se inventeaza cand nu vine
 *  niciuna: un id ghicit ar duce ecranul catre o factura care nu exista. */
function idFromRpc(data: unknown): string | null {
  const value = Array.isArray(data) ? data[0] : data;
  if (typeof value !== "string") return null;
  return UUID.test(value.trim()) ? value.trim() : null;
}

export type InvoiceIssueResult = { ok: true; numberText: string } | Failure;

/**
 * Emite o ciornă: public.issue_invoice alocă numărul și îngheață documentul.
 *
 * UN SINGUR APEL, si el face totul intr-o tranzactie: ia numarul din contorul seriei
 * sub blocaj de rand, il scrie pe factura si mută starea la `issued`. Nimic din acest
 * fisier nu citeste un numar ca sa il scrie.
 *
 * O CASUTA GOALA DE "DATA EMITERII" DEVINE ZIUA DIN CHISINAU, AICI, SI NU SE LASA
 * BAZEI. Cardul P3-115, constatarea G3 a raportului
 * docs/reports/2026-09-29-critic-bug-sweep-2.md: casuta se deschide completata cu
 * chisinauToday(), dar este un camp obisnuit si nimic nu refuza una golita, deci
 * ecranul trimitea sirul gol, acest fisier il facea `null`, iar public.issue_invoice
 * cadea pe `coalesce(p_issue_date, current_date)`, adica pe ziua SERVERULUI, care
 * este UTC. Chisinaul este UTC+2 sau UTC+3, deci in primele doua sau trei ore ale
 * fiecarei zi de la Chisinau ziua serverului este IERI, iar ziua decide si data
 * scrisa pe document si SERIA in care este numerotat: o ciornă anulata la 00:30, la
 * Chisinau, pe 1 ianuarie 2027 primea data 2026-12-31 si urmatorul numar din seria
 * RC-2026 in loc de RC-2027.
 *
 * MIGRATIA 0065 A REPARAT SI CADEREA DIN BAZA, cu acelasi nume de fus, ca cele doua
 * locuri sa nu poata spune doua zile diferite. Aceasta linie rămâne fiindca o cadere
 * corectata nu este acelasi lucru cu un raspuns dat pe fata: cine citeste apelul
 * vede ce zi pleaca spre baza.
 */
export async function issueInvoice(
  invoiceId: string,
  issueDate: string,
  dueDate: string,
): Promise<InvoiceIssueResult> {
  const user = await getSessionUser();
  if (!user) return SESSION_GONE;
  if (!UUID.test(invoiceId.trim())) return { ok: false, message: "Factura nu mai există. Reîncarcă pagina." };

  const on = issueDate.trim() === "" ? chisinauToday() : parseDay(issueDate);
  if (issueDate.trim() !== "" && on === null) {
    return { ok: false, message: "Data emiterii nu este validă.", field: "issueDate" };
  }
  const due = dueDate.trim() === "" ? null : parseDay(dueDate);
  if (dueDate.trim() !== "" && due === null) {
    return { ok: false, message: "Data scadenței nu este validă.", field: "dueDate" };
  }

  const supabase = await createClient();
  if (!(await hasFacturareSettings(supabase))) return NOT_ACTIVE;

  const { data, error } = await supabase.rpc("issue_invoice", {
    p_invoice_id: invoiceId.trim(),
    p_issue_date: on,
    p_due_date: due,
  });
  if (error) return refusal(error);

  const row = (Array.isArray(data) ? data[0] : data) as
    | { series: string | null; number: number | string | null }
    | null;
  const numberText = invoiceNumberText(
    row?.series ?? null,
    row?.number === null || row?.number === undefined ? null : Number(row.number),
  );
  if (!numberText) {
    // Emiterea a reusit si numarul nu s-a putut citi din raspuns. Nu se inventeaza
    // unul: ecranul se reincarcă si citeste factura, care il are.
    return { ok: false, message: "Factura a fost emisă, dar numărul nu a putut fi citit. Reîncarcă pagina." };
  }

  revalidatePath("/facturare");
  revalidatePath(`/facturare/${invoiceId.trim()}`);
  revalidatePath("/comenzi");
  return { ok: true, numberText };
}

/**
 * Marchează plătită, cu ziua în care a fost plătită.
 *
 * ZIUA SE SCRIE LA AMIAZA UTC, si nu la miezul nopții. paid_at este un `timestamptz`
 * pe care declansatorul invoices_stamp_status il completează doar cand este null, deci
 * valoarea trimisa de aici rămâne. Amiaza UTC cade in aceeasi zi calendaristica la
 * Chișinău oricum ar sta decalajul, de la +2 la +3; miezul nopții UTC este ora 2 sau 3
 * a zilei urmatoare acolo, adica ar muta ziua pentru fiecare plată.
 *
 * DOUA ZILE SUNT REFUZATE, SI AMANDOUA SUNT O SINGURA COMPARATIE. Cardul P3-115,
 * constatarea G14 a raportului docs/reports/2026-09-29-critic-bug-sweep-2.md: parseDay
 * verifica numai FORMA `YYYY-MM-DD`, nimic nu compara ziua cu ziua emiterii sau cu
 * astazi, si baza nu avea nicio constrangere pe paid_at, deci o factură emisă astăzi
 * putea fi trecută plătită in 2019 sau in 2031.
 *
 * ZIUA DE AZI ESTE CEA DIN CHISINAU, nu cea a serverului, din exact motivul scris in
 * lib/data/format.ts: o comparatie pe ziua UTC ar refuza o plată înregistrată in
 * primele ore ale zilei de la Chișinău, fiindca acolo ziua de azi este deja mai mare.
 *
 * ECRANUL ESTE O POLITETE, IAR GARANTIA ESTE IN BAZA. Migratia 0065 pune aceeasi
 * regula in declansatorul public.invoices_validate_paid_date, care este ce vede o
 * cerere construita de mana. Propozitiile de aici exista ca sa spuna OMULUI de langa
 * casuta ce nu este in regula, ceea ce un refuz al bazei nu face.
 */
export async function markInvoicePaid(invoiceId: string, paidOn: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return SESSION_GONE;
  if (!UUID.test(invoiceId.trim())) return { ok: false, message: "Factura nu mai există. Reîncarcă pagina." };

  const day = parseDay(paidOn);
  if (day === null) {
    return { ok: false, message: "Scrie ziua în care a fost plătită factura.", field: "paidOn" };
  }
  if (day > chisinauToday()) {
    // ZILELE SE COMPARA CA SIRURI, si asa trebuie sa rămână: `YYYY-MM-DD` se ordoneaza
    // lexicografic exact ca o dată calendaristica, iar un `new Date(sir)` ar fi miezul
    // nopții UTC, adica ora 2 sau 3 la Chișinău, si ar muta ziua. Nota lui
    // chisinauToday in lib/data/format.ts descrie aceeasi capcana.
    return {
      ok: false,
      message: "Ziua plății este în viitor. O plată se înregistrează după ce a fost făcută.",
      field: "paidOn",
    };
  }

  const supabase = await createClient();
  if (!(await hasFacturareSettings(supabase))) return NOT_ACTIVE;

  const read = await readStatusAndIssueDate(supabase, invoiceId.trim());
  if (read === null) return { ok: false, message: "Factura nu mai există. Reîncarcă pagina." };
  const { status, issueDate } = read;
  if (status !== "issued") {
    // O CIORNA NU POATE FI PLATITA, si nu fiindca ecranul nu o oferă: constrangerea
    // invoices_numbered_past_draft din 0063 refuză orice stare peste ciornă fără
    // număr, deci o ciornă marcată plătită ar fi un refuz brut al bazei. Propozitia
    // de aici spune ce trebuie făcut întâi.
    return {
      ok: false,
      message:
        status === "draft"
          ? "Factura este încă ciornă. Emite-o întâi: doar o factură emisă poate fi marcată plătită."
          : "Factura nu mai poate fi marcată plătită.",
    };
  }

  // SI NU INAINTE DE ZIUA EMITERII. O factură emisă are intotdeauna o zi de emitere,
  // fiindca public.issue_invoice o scrie, dar valoarea este citita si nu presupusa:
  // null inseamna ca nu se poate compara, si atunci declansatorul din 0065 este cel
  // care decide, nu o presupunere de aici.
  if (issueDate !== null && day < issueDate) {
    return {
      ok: false,
      message: `Ziua plății este înainte de ziua emiterii, ${formatDate(issueDate)}. O factură nu poate fi plătită înainte să existe.`,
      field: "paidOn",
    };
  }

  const { error } = await supabase
    .from("invoices")
    .update({ status: "paid", paid_at: `${day}T12:00:00Z`, paid_by: user.id })
    .eq("id", invoiceId.trim());
  if (error) return refusal(error);

  revalidatePath("/facturare");
  revalidatePath(`/facturare/${invoiceId.trim()}`);
  return { ok: true };
}

export type InvoiceCancelResult = { ok: true; numberText: string | null } | Failure;

/**
 * Anulează o factură, cu motivul care este obligatoriu, este păstrat și este arătat.
 *
 * O CIORNĂ PRIMEȘTE UN NUMĂR ÎN MOMENTUL ANULĂRII, si acesta este singurul loc din
 * acest card in care se face ceva ce nu se vede direct in linia goalului. Motivul este
 * o constrangere a migratiei 0063:
 *
 *   constraint invoices_numbered_past_draft check (status = 'draft' or number is not null)
 *
 * Nicio factura nu poate purta o stare peste ciornă fără număr. O ciornă anulată este
 * o stare peste ciornă, deci ea TREBUIE să aibă un număr, iar singura cale prin care un
 * număr se dă este public.issue_invoice. Deci anularea unei ciorne este: emite, apoi
 * anulează. Ce vede operatorul este un document anulat care poartă un număr, pe listă,
 * cu motivul lui, care este exact bookkeeping obișnuit; ce nu se întâmplă niciodată
 * este o gaură în serie, si ce nu se întâmplă deloc este o stergere. Ecranul spune asta
 * în confirmare, înainte, fiindcă numărul consumat este o consecință pe care operatorul
 * are dreptul să o știe.
 *
 * CELE DOUA PASI NU SUNT O SINGURA TRANZACTIE, si asta se spune si nu se ascunde: sunt
 * doua cereri prin PostgREST. Daca a doua nu reușește, factura rămâne EMISA cu numărul
 * ei, mesajul spune exact asta, si o a doua apăsare pe Anulează o duce la capăt. Ce nu
 * se poate întâmpla este un număr pierdut.
 */
export async function cancelInvoice(invoiceId: string, reason: string): Promise<InvoiceCancelResult> {
  const user = await getSessionUser();
  if (!user) return SESSION_GONE;
  if (!UUID.test(invoiceId.trim())) return { ok: false, message: "Factura nu mai există. Reîncarcă pagina." };

  const why = reason.trim();
  if (why === "") {
    return { ok: false, message: "Scrie motivul anulării. Fără el, nimeni nu va ști de ce.", field: "reason" };
  }

  const supabase = await createClient();
  if (!(await hasFacturareSettings(supabase))) return NOT_ACTIVE;

  const status = await readStatus(supabase, invoiceId.trim());
  if (status === null) return { ok: false, message: "Factura nu mai există. Reîncarcă pagina." };
  if (status === "cancelled") return { ok: false, message: "Factura este deja anulată." };
  if (status === "paid") {
    // O FACTURA PLATITA NU SE ANULEAZA DE PE ACEST ECRAN. Linia goalului da actiuni
    // numai pentru ciornă și emisă, iar o plată încasată care se anulează este o
    // restituire, adica o decizie de contabilitate pe care acest card nu o inventează.
    return {
      ok: false,
      message: "Factura este plătită și nu se mai anulează de aici. Este o decizie de contabilitate.",
    };
  }

  let numberText: string | null = null;
  if (status === "draft") {
    // ZIUA DIN CHISINAU, TRIMISA PE FATA. Cardul P3-115, constatarea G2. Aici era
    // scris `issueInvoice(invoiceId.trim(), "", "")`: un sir gol, care devenea null,
    // care ajungea la `coalesce(p_issue_date, current_date)` in public.issue_invoice,
    // adica la ziua UTC a serverului. Ziua decide data documentului SI seria lui, deci
    // o ciornă anulata in primele ore ale unei zi de la Chisinau intra pe ziua de ieri
    // si, la trecerea dintre ani, in seria anului inchis.
    //
    // ACEASTA ESTE ACEEASI ZI PE CARE O TRIMITE Emite. FacturaScreen.doIssue trimite
    // `invoice.issueDate ?? today`, unde `today` este chisinauToday() citit pe server,
    // deci cele doua cai stampileaza acum acelasi lucru. Un singur argument.
    const issued = await issueInvoice(invoiceId.trim(), chisinauToday(), "");
    if (!issued.ok) return issued;
    numberText = issued.numberText;
  }

  const { data, error } = await supabase
    .from("invoices")
    .update({ status: "cancelled", cancel_reason: why, cancelled_by: user.id })
    .eq("id", invoiceId.trim())
    .select("series, number")
    .maybeSingle();

  if (error) {
    if (numberText !== null) {
      return {
        ok: false,
        message: `Factura a primit numărul ${numberText}, dar anularea nu a reușit. Apasă Anulează din nou.`,
      };
    }
    return refusal(error);
  }

  const row = data as { series: string | null; number: number | string | null } | null;
  revalidatePath("/facturare");
  revalidatePath(`/facturare/${invoiceId.trim()}`);
  revalidatePath("/comenzi");
  return {
    ok: true,
    numberText:
      invoiceNumberText(
        row?.series ?? null,
        row?.number === null || row?.number === undefined ? null : Number(row.number),
      ) ?? numberText,
  };
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** Starea curentă a facturii, sau null cand nu se poate citi niciun rand.
 *
 *  UN CONT FARA PROFIL ACTIV CITESTE ZERO RANDURI si primeste null, deci mesajul lui
 *  este "factura nu mai există": politicile de tip select filtreaza randuri, ceea ce
 *  este distinctia scrisa de migratia 0055, si nu exista nimic de aratat. */
async function readStatus(supabase: SupabaseClient, invoiceId: string): Promise<InvoiceStatus | null> {
  const { data, error } = await supabase
    .from("invoices")
    .select("status")
    .eq("id", invoiceId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { status: InvoiceStatus }).status;
}

/** Starea SI ziua emiterii, citite intr-o singura cerere.
 *
 *  Cardul P3-115, constatarea G14. markInvoicePaid trebuie sa compare ziua platii cu
 *  ziua emiterii, deci are nevoie de amandoua. O A DOUA CERERE PENTRU issue_date AR FI
 *  DOUA RASPUNSURI DESPRE ACELASI RAND, iar intre ele factura poate fi emisa de
 *  altcineva: se citesc odata. readStatus rămâne pentru cine are nevoie numai de stare. */
async function readStatusAndIssueDate(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<{ status: InvoiceStatus; issueDate: string | null } | null> {
  const { data, error } = await supabase
    .from("invoices")
    .select("status, issue_date")
    .eq("id", invoiceId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { status: InvoiceStatus; issue_date: string | null };
  return { status: row.status, issueDate: row.issue_date };
}
