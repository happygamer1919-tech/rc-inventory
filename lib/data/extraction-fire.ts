import "server-only";

// Trimiterea documentului catre scenariul Make.
//
// Contract: docs/contracts/extraction-v2.md sectiunea 3. Corpul poarta EXACT
// sapte campuri si nimic altceva, fiindca un camp in plus este un camp pe care
// cealalta parte nu l-a acceptat.
//
// EXT-28. PANA LA ACEST CARD CORPUL PURTA EXACT SASE CAMPURI. Al saptelea este
// `page_count`, numarul de pagini NUMARAT DE NOI la incarcare, iar tot aici se
// refuza, INAINTEA oricarei trimiteri, un document cu 100 de pagini sau mai
// multe. Refuzul sta in aceasta functie si nu la apelanti: trei apelanti o cheama
// (incarcarea, retrimiterea si documentul atasat unei comenzi), iar o regula pusa
// la un apelant pazeste un singur apelant.
//
// NU ARUNCA NICIODATA. Incarcarea documentului a reusit deja cand se ajunge
// aici; daca trimiterea catre Make cade, documentul ramane incarcat si randul de
// ciorna pastreaza motivul. Aceeasi regula ca la mementouri: o integrare cazuta
// nu are voie sa se vada ca un esec al actiunii operatorului.
//
// MAKE_WEBHOOK_URL ESTE CITIT DUPA NUME. In teste este indreptat catre un
// server mic pe 127.0.0.1, exact cum P2-10 indreapta RESEND_BASE_URL, deci
// aplicatia face fetch-ul real si nu stie ca ruleaza un test.

import { createClient } from "@/lib/supabase/server";
import { DOCS_BUCKET } from "./inbound-types";
import { toDocumentUrl } from "./document-url";
// EXT-12. UN SINGUR IZVOR PENTRU FIECARE CEAS DE PE CALEA DE EXTRAGERE. Un timp
// care exista in doua fisiere este un timp care va ajunge sa nu fie de acord cu
// el insusi.
import { ACK_TIMEOUT_MS } from "./extraction-budget.mjs";
import { DOCUMENT_PAGE_LIMIT, isTooManyPages } from "./page-count.mjs";
import { hasDocumentTooLargeCode, hasExtractionUploadPageCount } from "./schema-capability";

/** Cat traieste legatura semnata. Destul pentru o extragere, nu mai mult. */
const SIGNED_URL_TTL_SECONDS = 15 * 60;

// EXT-12. ACESTA ESTE CEASUL DE CONFIRMARE SI NU BUGETUL EXTRAGERII, si cardul
// cere ca distinctia sa fie stabilita si nu presupusa. POST-ul de mai jos poarta
// callback_url IN CORP si functia se intoarce de indata ce Make raspunde 2xx: ce
// se asteapta aici este confirmarea ca Make a PRIMIT lucrarea. Rezultatul soseste
// mai tarziu, prin callback, pe bugetul lui Make.
//
// DECI NU SE RIDICA LA 120 DE SECUNDE. Ecranul operatorului sta pe el, si nota
// cardului spune exact asta. Bugetul extragerii traieste in extraction-budget.ts
// alaturi de el, in acelasi fisier, ca cele doua sa nu poata fi confundate a
// doua oara.
const TIMEOUT_MS = ACK_TIMEOUT_MS;

/** EXT-28. `errorCode` este prezent NUMAI pe refuzul nostru de dinaintea
 *  trimiterii. Orice alt esec, de transport sau de configurare, vine fara el, iar
 *  apelantii il scriu `download_failed`, exact ca pana la acest card. */
export type FireResult =
  | { ok: true; orderId: string }
  | { ok: false; reason: string; errorCode?: "document_too_large" };

function webhookUrl(): string | null {
  const raw = process.env.MAKE_WEBHOOK_URL;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

/** Originea noastra publica. Aceeasi pentru callback si pentru document. */
function siteOrigin(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  return typeof site === "string" && site.trim().length > 0
    ? site.trim().replace(/\/+$/, "")
    : "https://www.rapidconstructmd.com";
}

function callbackUrl(): string {
  const raw = process.env.RC_CALLBACK_URL;
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  return `${siteOrigin()}/api/extraction/callback`;
}

/**
 * Creeaza randul de ciorna si trimite documentul la Make.
 *
 * Randul se scrie INAINTE de trimitere, ca un callback care ajunge inaintea
 * raspunsului nostru sa gaseasca ceva pe care sa faca upsert. Ordinea inversa
 * este o cursa pe care nimeni nu o vede pana in ziua in care Make raspunde
 * repede.
 */
export async function fireExtraction(input: {
  orderId: string;
  documentPath: string;
  documentFilename: string;
  mimeType: string;
  sizeBytes: number;
  /** EXT-28. Paginile numarate de noi din bytes, sau null cand nu am putut
   *  numara cu siguranta. La retrimitere vine de pe rand, fiindca retrimiterea
   *  nu tine bytes-ii documentului. */
  pageCount: number | null;
}): Promise<FireResult> {
  const url = webhookUrl();
  if (!url) {
    return { ok: false, reason: "Variabila de mediu MAKE_WEBHOOK_URL lipseste." };
  }

  try {
    const supabase = await createClient();

    // EXT-28. NUMARUL NOSTRU INTRA PE RAND NUMAI DACA BAZA ARE COLOANA. 0043 si
    // acest cod pleaca din acelasi push si nu aterizeaza in aceeasi secunda; fara
    // poarta, upsert-ul ar primi 42703 si niciun document nu ar mai pleca spre
    // extragere pana cand migratia ateriza. Webhook-ul il poarta oricum, fiindca
    // el vine din bytes si nu din baza.
    const draft: Record<string, unknown> = {
      order_id: input.orderId,
      document_path: input.documentPath,
      document_filename: input.documentFilename,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      fired_at: new Date().toISOString(),
    };
    if (await hasExtractionUploadPageCount(supabase)) {
      draft.upload_page_count = input.pageCount;
    }

    const { error: draftError } = await supabase
      .from("extraction_drafts")
      .upsert(draft, { onConflict: "order_id" });
    if (draftError) {
      return { ok: false, reason: `Ciorna nu a putut fi creata: ${draftError.message}` };
    }

    // EXT-28. REFUZUL NOSTRU, INAINTEA ORICAREI TRIMITERI.
    //
    // 100 DE PAGINI SAU MAI MULT NU PLEACA. Plafonul este al celeilalte parti si
    // al nostru este acelasi numar, deliberat: al lor ramane plasa de siguranta,
    // al nostru este verificarea ieftina, fiindca nu costa o legatura semnata, o
    // descarcare si un apel de model.
    //
    // UN NUMAR NECUNOSCUT NU REFUZA. null inseamna ca nu am putut numara cu
    // siguranta, iar un document al carui numar de pagini nu il stim nu este un
    // document mare.
    //
    // RANDUL SE SCRIE AICI, NU NUMAI LA APELANTI. Documentul atasat unei comenzi
    // nu citeste rezultatul acestei functii, iar un refuz care nu ajunge pe rand
    // ar lasa ciorna "in lucru" pentru totdeauna.
    //
    // POARTA ETICHETEI, din motivul lui hasReconciliationFailedCode: pana cand
    // 0042 este aplicata baza nu cunoaste `document_too_large`, iar scrierea lui
    // ar da 22P02. In fereastra aceea comportamentul este cel de astazi: documentul
    // pleaca, si plafonul celeilalte parti ramane singurul.
    if (
      isTooManyPages(input.pageCount) &&
      (await hasDocumentTooLargeCode(() =>
        supabase
          .from("extraction_drafts")
          .select("order_id")
          .eq("error_code", "document_too_large")
          .limit(1),
      ))
    ) {
      const reason =
        `Documentul are ${input.pageCount} de pagini. Se trimit la extragere numai ` +
        `documente cu mai puțin de ${DOCUMENT_PAGE_LIMIT} de pagini.`;
      await supabase
        .from("extraction_drafts")
        .update({ status: "failed", error_code: "document_too_large", reason })
        .eq("order_id", input.orderId);
      return { ok: false, reason, errorCode: "document_too_large" };
    }

    const { data: signed, error: signError } = await supabase.storage
      .from(DOCS_BUCKET)
      .createSignedUrl(input.documentPath, SIGNED_URL_TTL_SECONDS);

    if (signError || !signed?.signedUrl) {
      return {
        ok: false,
        reason: `Legatura semnata nu a putut fi generata: ${signError?.message ?? "raspuns gol"}`,
      };
    }

    // EXT-08. DOCUMENT_URL TRECE PRIN RUTA NOASTRA, NU DIRECT PRIN STORAGE.
    //
    // Forma, bucket-ul, calea, jetonul si TTL-ul raman identice; se schimba
    // numai originea. Ce se castiga este singurul lucru pe care Storage nu il
    // da: un contract de esec pe care Make il poate citi. Storage raspunde 400
    // si acelasi cod "InvalidJWT" si pentru o legatura expirata si pentru una
    // stricata, iar Make raporteaza amandoua ca aceeasi eroare de date.
    //
    // Daca ruta NU s-ar aplica aici, contractul ar fi adevarat pentru cele patru
    // documente de proba si fals pentru fiecare document real, ceea ce este mai
    // rau decat sa nu existe: cealalta parte l-ar programa si ar cadea in
    // productie.
    const documentUrl = toDocumentUrl(signed.signedUrl, siteOrigin());
    if (documentUrl === null) {
      return {
        ok: false,
        reason: "Legatura semnata nu are forma asteptata si nu a fost trimisa mai departe.",
      };
    }

    // FARA `?? ""`. Un secret gol nu este un secret: se trimitea un antet
    // X-RC-Secret vid, Make raspundea 401, si ecranul spunea "Make a raspuns
    // 401" in loc sa spuna care variabila lipseste. Refuzul aici numeste
    // variabila, exact ca verificarea lui MAKE_WEBHOOK_URL de mai sus.
    const secret = process.env.MAKE_WEBHOOK_SECRET;
    if (!secret) {
      return { ok: false, reason: "Variabila de mediu MAKE_WEBHOOK_SECRET lipseste." };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      // EXACT sapte campuri. Contract sectiunea 3.
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RC-Secret": secret,
        },
        body: JSON.stringify({
          order_id: input.orderId,
          document_url: documentUrl,
          document_filename: input.documentFilename,
          mime_type: input.mimeType,
          // EXT-28. PREZENT MEREU, null CAND NU AM PUTUT NUMARA. Contractul,
          // regula globala 2.1: absent inseamna null, niciodata o cheie lipsa si
          // niciodata zero. Cealalta parte refuza pe el inainte sa descarce.
          page_count: input.pageCount,
          size_bytes: input.sizeBytes,
          callback_url: callbackUrl(),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).trim().slice(0, 200);
        return {
          ok: false,
          reason: `Make a raspuns ${response.status}.${detail ? ` ${detail}` : ""}`,
        };
      }
      return { ok: true, orderId: input.orderId };
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? `Make nu a raspuns in ${TIMEOUT_MS / 1000} secunde.`
        : `Trimiterea a esuat: ${error instanceof Error ? error.message : String(error)}`;
    return { ok: false, reason };
  }
}
