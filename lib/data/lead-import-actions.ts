"use server";

// P3-101, goal G58. VERIFICAREA SI SCRIEREA IMPORTULUI DE LEADURI.
//
// DOUA ACTIUNI SI NU UNA: `planLeadImport` spune ce s-ar intampla si nu scrie
// nimic, `runLeadImport` scrie. Pasul "Verifică" din G58 cere exact separarea
// aceasta: numerele se vad INAINTE ca ceva sa ajunga in baza.
//
// PLANUL SE RECALCULEAZA PE SERVER LA SCRIERE, si nu se ia de la browser. Un
// plan trimis de client este o afirmatie a clientului despre ce este dublat, si
// dublatul se decide dupa randurile din baza. Ecranul trimite ce a citit din
// fisier si ce a ales operatorul; restul se recalculeaza aici.
//
// NUMAI ADMINISTRATORUL, exact ca la crearea unui singur lead. createClientRecord
// raspunde OWNER_ONLY oricui nu este owner, deci un import deschis operatorilor ar
// largi cine poate scrie date de client, cu cinci mii de randuri deodata. Intrebarea
// a plecat la proprietar (mailbox q085) si pana la raspuns se aplica implicitul
// recomandat: numai administratorul.
//
// NIMIC NU SE STERGE SI NIMIC NU SE SUPRASCRIE. Singura scriere pe un client care
// exista deja este `fillEmpty` de mai jos, care CITESTE randul, calculeaza numai
// coloanele goale si scrie numai pe acelea. Denumirea, etapa si data de reluare nu
// sunt in lista deloc.

import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { hasClientLeaduri, hasClientNextAction } from "./schema-capability";
import { addClientNote, createClientRecord } from "./client-actions";
import { createContact } from "./contact-actions";
import { listClientOwnerChoices } from "./clients";
import { loadOrRefuse, readAllClients } from "./import-clients-read";
import { rawRowAt } from "./import-shared";
import type { ActionResult } from "./inbound-types";
import { isClientSource, type ClientSource } from "./clients-types";
import {
  buildOwnerIndex,
  normaliseEmail,
  normalisePhone,
  type ColumnMapping,
  type ImportField,
  type PreparedLead,
  IMPORT_FIELDS,
  IMPORT_MAX_ROWS,
  importNoteBody,
} from "./lead-import-types";
import {
  buildPlan,
  duplicateReason,
  mergeWithinFile,
  type DuplicateChoices,
  type ExistingClient,
  type FillField,
  type LeadImportPlan,
  FILL_FIELDS,
} from "./lead-import-plan";

const OWNER_ONLY: ActionResult<never> = {
  ok: false,
  message: "Doar administratorul poate importa leaduri.",
};

const TOO_MANY: ActionResult<never> = {
  ok: false,
  message: `Fișierul are prea multe rânduri. Maximul este ${IMPORT_MAX_ROWS}.`,
};

/** Ce trimite ecranul: randurile citite din fisier si potrivirea coloanelor. */
export type LeadImportRequest = {
  rows: string[][];
  /** Linia din Excel a fiecarui rand de date (liniile goale se numara), ca "Rândul N"
   *  sa fie cel pe care operatorul il vede in foaie. Lipsa inseamna randuri una dupa alta. */
  lines?: number[];
  /** Cate un camp sau null pentru fiecare coloana, in ordinea coloanelor. */
  mapping: (ImportField | null)[];
  /** Sursa scrisa o singura data si pusa pe randurile care nu au una a lor. */
  fallbackSource: string;
};

/** Rezultatul scrierii, exact numerele din rezumatul cerut de G58.
 *
 *  CELE TREI NUMERE ADUNA RANDURILE CITITE. Cardul P3-115, constatarea G18 a raportului
 *  docs/reports/2026-09-29-critic-bug-sweep-2.md: fiecare rand din fisier ajunge in exact
 *  unul dintre `created`, `filled` si `skipped`, iar runLeadImport verifica asta la fiecare
 *  import. Inainte, doua randuri puteau ieși din socoteala: un dublat din acelasi fisier
 *  ales pentru completare care nu schimba nimic nu intra in niciunul, si un lead creat a
 *  carui nota nu s-a salvat intra in doua. */
export type LeadImportOutcome = {
  created: number;
  filled: number;
  skipped: number;
  /** Randurile nepreluate, cu motivul lor, pentru fisierul descarcabil. */
  skippedRows: { line: number; reason: string; raw: string[] }[];
  /** Ce s-a intamplat si merita spus, dar nu este un rand nepreluat: o nota de import
   *  care nu s-a salvat pe un lead care A FOST creat, si un rezumat care nu se potriveste
   *  cu fisierul. `line` este 0 cand avertismentul este despre tot importul. */
  warnings: { line: number; reason: string }[];
};

function readMapping(raw: (ImportField | null)[]): ColumnMapping {
  // Un camp care nu este in lista noastra nu exista, si un client care trimite
  // altceva primeste "nu importa coloana asta" in loc sa scrie intr-o coloana
  // pe care nimeni nu a numit-o.
  const known = new Set<string>(IMPORT_FIELDS);
  const seen = new Set<string>();
  return raw.map((field) => {
    if (field === null || !known.has(field) || seen.has(field)) return null;
    seen.add(field);
    return field;
  });
}

function readFallbackSource(raw: string): ClientSource | "" {
  const value = raw.trim();
  return value !== "" && isClientSource(value) ? value : "";
}

/**
 * Clientii deja stocati, redusi la ce trebuie pentru a recunoaste un dublat.
 *
 * SE CITESC TOTI, si asta este o alegere si nu o scapare: dublatul se cauta dupa
 * telefon normalizat, iar normalizarea se face in cod, nu in baza. O interogare
 * care ar cauta numarul asa cum este scris in fisier ar rata exact cazul pentru
 * care normalizarea exista. Lista este de ordinul sutelor de randuri si se citesc
 * patru coloane plus cele completabile, nu randul intreg.
 */
async function loadExisting(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<ExistingClient[]> {
  const leaduri = await hasClientLeaduri(supabase);
  const next = await hasClientNextAction(supabase);

  const columns = [
    "id",
    "name",
    "phone",
    "email",
    "address",
    "fiscal_code",
    "notes",
    ...(leaduri ? ["interest", "source", "owner_id"] : []),
    ...(next ? ["next_action"] : []),
  ].join(",");

  const rows = await readAllClients(supabase, columns);

  // NIMIC DESPRE PERSOANELE DE CONTACT NU SE CITESTE AICI, si asta este constatarea G17
  // a raportului docs/reports/2026-09-29-critic-bug-sweep-2.md, reparata de cardul P3-115.
  //
  // CE ERA AICI: o citire din tabela contactelor care cerea coloana identificatorului de
  // client FARA NICIUN FILTRU si fara nicio limita, adica FIECARE RAND DE CONTACT DIN BAZA,
  // la fiecare import, ca sa se răspundă la o intrebare despre cei doi sau trei clienti pe
  // care fisierul ii atinge. Id-urile clientilor erau calculate pe linia de deasupra si erau
  // folosite numai ca sa se testeze ca sirul nu este gol; linia aceea a plecat cu citirea.
  //
  // FORMA APELULUI NU ESTE SCRISA AICI, DINADINS. Cazul G70 (G17) din
  // tests/e2e/lead-import.spec.ts citeste acest fisier si cere ca fiecare citire din tabela
  // contactelor sa poarte un filtru pe identificatorul clientului; un comentariu care ar
  // cita apelul scos ar arata verificarii exact ce ea caută. Aceeasi capcana pe care o
  // descrie verificarea de stergere din tests/e2e/facturare-create.spec.ts, cazul 6.
  //
  // DE CE NU ESTE DE AJUNS UN FILTRU PE ID-URILE DE MAI SUS, care este reparatia pe care
  // constatarea o propune: acele id-uri sunt TOTI clientii, fiindca citirea clientilor este
  // dinadins nefiltrata, deci un filtru pe ei ar citi exact aceleasi randuri. Ar fi fost mai
  // explicit si nimic mai mult.
  //
  // CE SE FACE IN SCHIMB: intrebarea se pune DUPA ce planul stie cu care clienti s-a
  // potrivit fisierul, pentru acei clienti si numai pentru ei, in
  // addContactNameFillable mai jos. Asa citirea scade de la toata agenda de contacte la
  // cateva randuri, si aceea este chiar propozitia constatarii.
  //
  // SI DECI `contactName` NU MAI INTRA IN `empty` DE AICI. Lista de mai jos poarta numai
  // câmpurile care SUNT coloane pe public.clients si care s-au citit chiar acum; persoana
  // de contact este un rand in public.contacts si se decide separat.
  //
  // CITIREA CLIENTILOR RAMANE NEFILTRATA si asta este o alegere cu motivul scris in
  // antetul functiei: dublatul se caută dupa telefon NORMALIZAT, iar normalizarea se face
  // in cod, deci o interogare care ar caută numarul asa cum este scris in fisier ar rata
  // exact cazul pentru care normalizarea exista.
  return rows.map((row) => {
    const value = (column: string): string => (row[column] ?? "").trim();
    const empty: FillField[] = [];
    const check: [FillField, string][] = [
      ["phone", "phone"],
      ["email", "email"],
      ["address", "address"],
      ["fiscalCode", "fiscal_code"],
      ["notes", "notes"],
      ...(leaduri
        ? ([
            ["interest", "interest"],
            ["source", "source"],
            ["ownerId", "owner_id"],
          ] as [FillField, string][])
        : []),
      ...(next ? ([["nextAction", "next_action"]] as [FillField, string][]) : []),
    ];
    for (const [field, column] of check) if (value(column) === "") empty.push(field);

    return {
      id: row.id as string,
      name: row.name ?? "",
      phoneKey: normalisePhone(value("phone")),
      emailKey: normaliseEmail(value("email")),
      empty,
    };
  });
}

/**
 * Persoana de contact se poate completa? Intrebat NUMAI despre clientii cu care
 * fisierul s-a potrivit.
 *
 * CARDUL P3-115, CONSTATAREA G17. Aceasta este a doua jumatate a repararii, si aici este
 * locul in care ea devine posibila: planul stie deja cu care clienti stocati s-a potrivit
 * fisierul, deci intrebarea "are clientul acesta vreo persoana de contact" se poate pune
 * pentru cativa clienti, in loc sa se citeasca toata agenda de contacte inainte sa se stie
 * despre cine este vorba. Un fisier de zece randuri care atinge doi clienti citeste acum
 * contactele acelor doi.
 *
 * SE COMPLETEAZA NUMAI PE UN CLIENT CARE NU ARE NICIUNA, care este regula nemodificata a
 * lui G58: un client cu contacte are deja pe cineva scris acolo, iar a adauga inca unul
 * dintr-un fisier nu este completarea unui gol.
 *
 * SI NUMAI CAND FISIERUL CHIAR OFERA UN NUME, aceeasi conditie pe care buildPlan o aplica
 * fiecarui alt camp completabil: un camp pe care randul nu il are nu este de completat.
 *
 * DUBLATII DIN ACELASI FISIER NU TREC PE AICI, si nici nu au nevoie: randul cu care se
 * potrivesc nu exista in baza, deci nu are contacte, iar `fillable` pentru ei se calculeaza
 * din campurile goale ale randului de mai sus.
 *
 * SCRIEREA RE-INTREABA OricUM, pe un singur client, chiar inainte sa creeze contactul
 * (fillEmpty mai jos). Deci chiar daca acest plan ar spune greşit ca se poate completa,
 * niciun al doilea contact principal nu s-ar scrie. Planul este ce vede operatorul; aceea
 * este garantia.
 */
async function addContactNameFillable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  plan: LeadImportPlan,
  prepared: Map<number, PreparedLead>,
): Promise<void> {
  const matched = plan.entries.filter(
    (entry): entry is Extract<typeof entry, { kind: "duplicate" }> =>
      entry.kind === "duplicate" && entry.against.kind === "stored",
  );
  if (matched.length === 0) return;

  const ids = [...new Set(matched.map((entry) => (entry.against as { id: string }).id))];
  const { data, error } = await supabase.from("contacts").select("client_id").in("client_id", ids);
  // O CITIRE CARE NU REUSESTE NU ADAUGA NIMIC. Persoana de contact rămâne necompletabila,
  // ceea ce este partea sigura: a presupune "nu are contacte" ar propune o completare pe
  // un client despre care nu s-a aflat nimic.
  if (error) return;

  const withContact = new Set<string>();
  for (const row of (data ?? []) as { client_id: string }[]) withContact.add(row.client_id);

  for (const entry of matched) {
    const clientId = (entry.against as { id: string }).id;
    if (withContact.has(clientId)) continue;
    const lead = prepared.get(entry.line);
    if (!lead || (lead.contactName ?? "").trim() === "") continue;
    if (!entry.fillable.includes("contactName")) entry.fillable.push("contactName");
  }
}

/** Responsabilii: indexul pentru citirea fisierului si numele pentru previzualizare. */
async function ownerInputs() {
  const choices = await listClientOwnerChoices();
  return {
    owners: buildOwnerIndex(choices),
    ownerNames: new Map(choices.map((o) => [o.id, o.fullName])),
  };
}

/** Planul, calculat pe server, fara nicio scriere. */
export async function planLeadImport(
  request: LeadImportRequest,
): Promise<ActionResult<LeadImportPlan>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;
  if (request.rows.length > IMPORT_MAX_ROWS) return TOO_MANY;

  const supabase = await createClient();
  const existing = await loadOrRefuse(() => loadExisting(supabase));
  if (!existing.ok) return existing;
  const { plan, prepared } = buildPlan({
    rows: request.rows,
    lines: request.lines,
    mapping: readMapping(request.mapping),
    ...(await ownerInputs()),
    fallbackSource: readFallbackSource(request.fallbackSource),
    existing: existing.value,
  });
  await addContactNameFillable(supabase, plan, prepared);

  return { ok: true, value: plan };
}

/** Coloana din baza a fiecarui camp completabil. `contactName` lipseste: el nu
 *  este o coloana, ci un rand in public.contacts. */
const FILL_COLUMN: Record<Exclude<FillField, "contactName">, string> = {
  phone: "phone",
  email: "email",
  interest: "interest",
  source: "source",
  ownerId: "owner_id",
  nextAction: "next_action",
  notes: "notes",
  address: "address",
  fiscalCode: "fiscal_code",
};

/**
 * Completeaza NUMAI campurile goale ale unui client care exista deja.
 *
 * RANDUL SE CITESTE INAINTE DE SCRIERE, chiar aici, si nu se scrie nicio coloana
 * pe care citirea nu a gasit-o goala. Lista campurilor venita de la ecran este o
 * cerere, nu o permisiune: daca intre pasul "Verifică" si apasarea butonului
 * cineva a completat un camp, camera aceea nu se mai atinge.
 *
 * Denumirea, etapa si data de reluare nu pot fi atinse de aici deloc: nu sunt in
 * FILL_COLUMN, deci nu exista niciun drum catre ele.
 */
async function fillEmpty(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string,
  lead: PreparedLead,
  wanted: FillField[],
): Promise<{ filled: boolean; message?: string }> {
  const leaduri = await hasClientLeaduri(supabase);
  const next = await hasClientNextAction(supabase);

  const readable = FILL_FIELDS.filter((field) => {
    if (field === "contactName") return false;
    if (["interest", "source", "ownerId"].includes(field)) return leaduri;
    if (field === "nextAction") return next;
    return true;
  }) as Exclude<FillField, "contactName">[];

  const { data, error } = await supabase
    .from("clients")
    .select(["id", ...readable.map((f) => FILL_COLUMN[f])].join(","))
    .eq("id", clientId)
    .single();
  if (error || !data) return { filled: false, message: "Clientul nu mai există." };

  const stored = data as unknown as Record<string, string | null>;
  const patch: Record<string, string> = {};
  for (const field of readable) {
    if (!wanted.includes(field)) continue;
    const value = (lead[field] ?? "").trim();
    if (value === "") continue;
    if ((stored[FILL_COLUMN[field]] ?? "").trim() !== "") continue;
    patch[FILL_COLUMN[field]] = value;
  }

  let filled = false;
  if (Object.keys(patch).length > 0) {
    const { error: writeError } = await supabase.from("clients").update(patch).eq("id", clientId);
    if (writeError) return { filled: false, message: writeError.message };
    filled = true;
  }

  // Persoana de contact, numai cand clientul nu are niciuna. Prin actiunea care
  // exista deja, nu printr-o a doua cale de scriere in public.contacts.
  const contactName = (lead.contactName ?? "").trim();
  if (wanted.includes("contactName") && contactName !== "") {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id")
      .eq("client_id", clientId)
      .limit(1);
    if ((contacts ?? []).length === 0) {
      const created = await createContact({
        clientId,
        name: contactName,
        role: "",
        phone: "",
        email: "",
        isPrimary: true,
        notes: "",
        active: true,
      });
      if (created.ok) filled = true;
    }
  }

  return { filled };
}

/**
 * Scrie importul si intoarce numerele rezumatului.
 *
 * O EROARE PE UN RAND NU OPRESTE RESTUL, care este regula lui G58: randul intra
 * in lista celor nepreluate cu motivul lui si fisierul merge mai departe.
 */
export async function runLeadImport(
  request: LeadImportRequest & {
    choices: DuplicateChoices;
    fileName: string;
    /** Ziua scrisa in nota, `YYYY-MM-DD`, calculata de ecran in fusul lui. */
    day: string;
  },
): Promise<ActionResult<LeadImportOutcome>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;
  if (request.rows.length > IMPORT_MAX_ROWS) return TOO_MANY;

  const supabase = await createClient();
  const existing = await loadOrRefuse(() => loadExisting(supabase));
  if (!existing.ok) return existing;
  const { plan, prepared } = buildPlan({
    rows: request.rows,
    lines: request.lines,
    mapping: readMapping(request.mapping),
    ...(await ownerInputs()),
    fallbackSource: readFallbackSource(request.fallbackSource),
    existing: existing.value,
  });
  // P3-115, G17: aceeasi intrebare, pusa despre aceiasi clienti, in amandoua caile. Daca
  // ar fi pusa numai in planLeadImport, ecranul ar oferi completarea persoanei de contact si
  // scrierea nu ar sti ca a fost cerută.
  await addContactNameFillable(supabase, plan, prepared);

  // Intai completarile din interiorul fisierului, cat timp niciun rand nu a fost
  // scris: randul de mai sus nu exista in baza, deci se completeaza planul lui.
  const mergedLines = mergeWithinFile(plan, prepared, request.choices);
  let filled = mergedLines.size;

  let created = 0;
  const skippedRows: { line: number; reason: string; raw: string[] }[] = [];
  // AVERTISMENTELE NU SUNT UN AL PATRULEA INTELES AL LUI "NEPRELUAT". Cardul P3-115,
  // constatarea G18, a doua scurgere din aceeasi suma: un lead care A FOST CREAT dar a carui
  // nota de import nu s-a salvat era numarat in `created` SI pus in randurile nepreluate,
  // deci era numarat de doua ori si cele trei numere treceau peste numarul randurilor din
  // fisier. Randul acela nu este nepreluat: clientul exista. Ce lipseste este nota, si aceea
  // este un avertisment, asa ca merge intr-o lista a lui, langa cele trei numere.
  const warnings: { line: number; reason: string }[] = [];
  const noteBody = importNoteBody(request.fileName, request.day);
  const rawAt = (line: number) => rawRowAt(request.rows, request.lines, 1, line);

  for (const entry of plan.entries) {
    if (entry.kind === "error") {
      skippedRows.push({ line: entry.line, reason: entry.reason, raw: entry.raw });
      continue;
    }

    if (entry.kind === "duplicate") {
      const choice = request.choices[entry.line] ?? "skip";
      if (choice !== "fill" || entry.against.kind === "file") {
        // Un dublat din acelasi fisier a fost deja tratat mai sus, si oricum nu
        // se scrie ca rand propriu: aici este doar contabilizat ca nepreluat.
        //
        // SI DACA MAI SUS NU A SCHIMBAT NIMIC, ESTE NEPRELUAT. Cardul P3-115, constatarea
        // G18: aici se scria `if (choice !== "fill")`, deci un dublat din acelasi fisier
        // ales pentru completare nu ajungea niciodata in `skippedRows`, iar mergeWithinFile
        // il numara numai daca schimbase ceva. Randul care nu schimbase nimic nu intra in
        // niciunul din cele trei numere si nu apărea nici in fisierul randurilor
        // nepreluate: nu se putea pune fata in fata cu foaia de calcul, care este singurul
        // lucru pe care operatorul il face dupa un import.
        //
        // mergeWithinFile SPUNE ACUM CARE RANDURI, nu cate, deci intrebarea se poate pune.
        if (choice !== "fill") {
          skippedRows.push({ line: entry.line, reason: duplicateReason(entry), raw: rawAt(entry.line) });
        } else if (entry.against.kind === "file" && !mergedLines.has(entry.line)) {
          skippedRows.push({
            line: entry.line,
            reason: `Dublat cu rândul ${entry.against.line}, "${entry.against.name}", care are deja completate câmpurile din fișier.`,
            raw: rawAt(entry.line),
          });
        }
        continue;
      }
      const lead = prepared.get(entry.line);
      if (!lead) {
        // UN RAND FARA DATE PREGATITE NU DISPARE. Nu se poate ajunge aici pe niciun drum
        // cunoscut, fiindca prepared poarta fiecare rand care nu este o eroare, dar un
        // `continue` mut ar fi exact forma pe care are G18 si de aceea nu se lasa aşa.
        skippedRows.push({
          line: entry.line,
          reason: "Rândul nu a putut fi pregătit pentru scriere.",
          raw: rawAt(entry.line),
        });
        continue;
      }
      const result = await fillEmpty(supabase, entry.against.id, lead, entry.fillable);
      if (result.filled) filled += 1;
      else
        skippedRows.push({
          line: entry.line,
          reason:
            result.message ??
            `Dublat cu "${entry.against.name}", care are deja completate câmpurile din fișier.`,
          raw: rawAt(entry.line),
        });
      continue;
    }

    const lead = prepared.get(entry.line);
    if (!lead) {
      // Acelasi motiv ca mai sus: niciun rand nu iese din socoteala in liniste.
      skippedRows.push({
        line: entry.line,
        reason: "Rândul nu a putut fi pregătit pentru scriere.",
        raw: rawAt(entry.line),
      });
      continue;
    }

    const result = await createClientRecord({
      name: lead.name,
      type: lead.type,
      fiscalCode: lead.fiscalCode,
      address: lead.address,
      phone: lead.phone,
      email: lead.email,
      notes: lead.notes,
      active: true,
      stage: lead.stage,
      followUpDate: lead.followUpDate,
      source: lead.source,
      interest: lead.interest,
      ownerId: lead.ownerId,
      nextAction: lead.nextAction,
      contactName: lead.contactName,
      firstStage: true,
    });

    if (!result.ok) {
      // CLIENTUL EXISTA DEJA cand un pas de dupa insert a esuat (etapa, persoana de
      // contact): nu este un rand nepreluat si nu se pune in fisierul de erori, fiindca
      // incarcat din nou ar crea un al doilea client. Se numara ca creat si se spune
      // ce lipseste, cu mesajul pasului.
      if (result.saved?.clientId) {
        created += 1;
        warnings.push({ line: entry.line, reason: result.message });
        const partialNote = await addClientNote(result.saved.clientId, noteBody);
        if (!partialNote.ok)
          warnings.push({
            line: entry.line,
            reason: `Nota de import nu s-a salvat. ${partialNote.message}`,
          });
        continue;
      }
      skippedRows.push({ line: entry.line, reason: result.message, raw: rawAt(entry.line) });
      continue;
    }
    created += 1;

    // NOTA TRECE PRIN addClientNote, calea care exista deja (G45). O scriere
    // directa in public.client_notes ar fi un al doilea drum catre acelasi tabel.
    // O nota care nu se salveaza NU anuleaza leadul: clientul exista.
    //
    // SI DE ACEEA ESTE UN AVERTISMENT, NU UN RAND NEPRELUAT. Cardul P3-115, constatarea
    // G18: randul era pus in `skippedRows`, deci era numarat si in `created` si in
    // `skipped`, iar cele trei numere depaseau numarul randurilor din fisier. Se vede in
    // continuare pe ecran, cu linia si cu motivul, dar langa numere si nu intre ele.
    const note = await addClientNote(result.value.id, noteBody);
    if (!note.ok)
      warnings.push({
        line: entry.line,
        reason: `Leadul a fost creat, dar nota de import nu s-a salvat. ${note.message}`,
      });
  }

  // CELE TREI NUMERE ADUNA FISIERUL, SI ASTA SE VERIFICA AICI.
  //
  // Cardul P3-115, constatarea G18. Invariantul este simplu de enunțat si era rupt de doua
  // drumuri deodata: fiecare rand citit din fisier ajunge in exact unul dintre `created`,
  // `filled` si `skipped`. Fara el, rezumatul nu se poate pune fata in fata cu foaia de
  // calcul, care este singurul lucru pe care operatorul il face dupa un import.
  //
  // DE CE O VERIFICARE IN COD SI NU NUMAI UN TEST: cele trei numere se adună pe cinci
  // drumuri diferite prin bucla de mai sus, iar un al saselea drum adaugat cu bune intenții
  // este exact cum a apărut aceasta constatare. Un test acoperă drumurile la care s-a
  // gandit cineva; linia asta le acoperă pe toate, la fiecare import.
  //
  // NU OPRESTE IMPORTUL SI NU ARUNCA. Scrierile s-au intamplat deja si sunt corecte: ce ar
  // fi greşit este numai socoteala. Se noteaza ca avertisment, cu numerele in el, ca
  // dezacordul sa fie vizibil in loc sa fie tacut.
  const accounted = created + filled + skippedRows.length;
  if (accounted !== request.rows.length) {
    warnings.push({
      line: 0,
      reason:
        `Rezumatul nu se potrivește cu fișierul: ${request.rows.length} rânduri citite, ` +
        `${created} create plus ${filled} completate plus ${skippedRows.length} nepreluate ` +
        `fac ${accounted}. Numerele de mai sus sunt corecte pentru ce s-a scris; socoteala nu.`,
    });
  }

  revalidatePath("/clienti");
  return {
    ok: true,
    value: { created, filled, skipped: skippedRows.length, skippedRows, warnings },
  };
}
