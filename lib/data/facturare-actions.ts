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
import { hasFacturareSettings } from "./schema-capability";
import { isUnitCode } from "./units";
import { invoiceNumberText, type InvoiceStatus } from "./facturare-types";

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
    const created = await supabase.rpc("save_invoice_draft", {
      p_client_id: input.clientId.trim(),
      p_lines: rpcLines(clean),
      p_invoice_id: null,
      p_project_id: projectId === "" ? null : projectId,
      p_outbound_issue_id: outboundIssueId === "" ? null : outboundIssueId,
      p_due_date: dueDate,
      p_notes: input.notes.trim() === "" ? null : input.notes.trim(),
    });
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
 */
export async function issueInvoice(
  invoiceId: string,
  issueDate: string,
  dueDate: string,
): Promise<InvoiceIssueResult> {
  const user = await getSessionUser();
  if (!user) return SESSION_GONE;
  if (!UUID.test(invoiceId.trim())) return { ok: false, message: "Factura nu mai există. Reîncarcă pagina." };

  const on = issueDate.trim() === "" ? null : parseDay(issueDate);
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
 */
export async function markInvoicePaid(invoiceId: string, paidOn: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return SESSION_GONE;
  if (!UUID.test(invoiceId.trim())) return { ok: false, message: "Factura nu mai există. Reîncarcă pagina." };

  const day = parseDay(paidOn);
  if (day === null) {
    return { ok: false, message: "Scrie ziua în care a fost plătită factura.", field: "paidOn" };
  }

  const supabase = await createClient();
  if (!(await hasFacturareSettings(supabase))) return NOT_ACTIVE;

  const status = await readStatus(supabase, invoiceId.trim());
  if (status === null) return { ok: false, message: "Factura nu mai există. Reîncarcă pagina." };
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
    const issued = await issueInvoice(invoiceId.trim(), "", "");
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
