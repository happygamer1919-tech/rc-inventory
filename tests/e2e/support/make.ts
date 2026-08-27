// Constantele si ajutoarele serverului fals de Make.
//
// Un singur loc pentru port, adresa si secrete false, importat si de
// playwright.config.ts si de spec. Serverul insusi este un .mjs si primeste
// aceleasi valori prin mediu, de la config.

import type { APIRequestContext } from "@playwright/test";

export const MAKE_MOCK_PORT = Number(process.env.MAKE_MOCK_PORT ?? 3198);
export const MAKE_MOCK_URL = `http://127.0.0.1:${MAKE_MOCK_PORT}`;
export const MAKE_WEBHOOK_URL = `${MAKE_MOCK_URL}/webhook`;

/** Secrete false. Deschid exact nimic: serverul fals accepta orice antet. */
export const MAKE_WEBHOOK_SECRET = "test-webhook-secret-not-a-credential";
export const MAKE_CALLBACK_SECRET = "test-callback-secret-not-a-credential";

/** Cele SASE campuri pe care contractul le permite in corpul trimiterii. */
export const FIRE_FIELDS = [
  "callback_url",
  "document_filename",
  "document_url",
  "mime_type",
  "order_id",
  "size_bytes",
].sort();

export type FiredRequest = {
  at: string;
  hasSecretHeader: boolean;
  keys: string[];
  orderId: string | null;
  documentFilename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  hasDocumentUrl: boolean;
  callbackUrl: string | null;
};

export async function firedRequests(request: APIRequestContext): Promise<FiredRequest[]> {
  const r = await request.get(`${MAKE_MOCK_URL}/__fired`);
  if (!r.ok()) return [];
  return ((await r.json()) as { fired: FiredRequest[] }).fired;
}

/** Trimiterile pentru un anume order_id. */
export async function firedFor(
  request: APIRequestContext,
  orderId: string,
): Promise<FiredRequest[]> {
  return (await firedRequests(request)).filter((f) => f.orderId === orderId);
}
