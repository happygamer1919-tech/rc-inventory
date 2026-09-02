import "server-only";

// Trimiterea documentului catre scenariul Make.
//
// Contract: docs/contracts/extraction-v2.md sectiunea 3. Corpul poarta EXACT
// sase campuri si nimic altceva, fiindca un camp in plus este un camp pe care
// cealalta parte nu l-a acceptat.
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

/** Cat traieste legatura semnata. Destul pentru o extragere, nu mai mult. */
const SIGNED_URL_TTL_SECONDS = 15 * 60;
const TIMEOUT_MS = 15_000;

export type FireResult =
  | { ok: true; orderId: string }
  | { ok: false; reason: string };

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
}): Promise<FireResult> {
  const url = webhookUrl();
  if (!url) {
    return { ok: false, reason: "Variabila de mediu MAKE_WEBHOOK_URL lipseste." };
  }

  try {
    const supabase = await createClient();

    const { error: draftError } = await supabase.from("extraction_drafts").upsert(
      {
        order_id: input.orderId,
        document_path: input.documentPath,
        document_filename: input.documentFilename,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        fired_at: new Date().toISOString(),
      },
      { onConflict: "order_id" },
    );
    if (draftError) {
      return { ok: false, reason: `Ciorna nu a putut fi creata: ${draftError.message}` };
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
      // EXACT sase campuri. Contract sectiunea 3.
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
