// Constantele si ajutoarele serverului fals de Resend.
//
// Un singur loc pentru port, adresa, cheia falsa si marcajul de esec, importat
// si de playwright.config.ts si de spec. Serverul insusi este un .mjs, deci nu
// poate importa de aici: primeste aceleasi valori prin mediu, de la config.

import type { APIRequestContext } from "@playwright/test";

export const RESEND_MOCK_PORT = Number(process.env.RESEND_MOCK_PORT ?? 3199);
export const RESEND_MOCK_URL = `http://127.0.0.1:${RESEND_MOCK_PORT}`;

/** Cheie falsa. Serverul fals accepta orice antet si nu il pastreaza. */
export const RESEND_MOCK_KEY = "test-mock-key-not-a-credential";

/** Expeditorul din teste. Domeniul .local nu exista si nu poate primi nimic. */
export const RESEND_MOCK_FROM = "Rapid Construct <memento@rc-inventory.local>";

/**
 * Marcajul care face serverul fals sa raspunda 500.
 *
 * Se strecoara in mesaj prin SKU-ul produsului, fiindca P2-10 cere ca SKU-ul sa
 * apara in corpul emailului. Asa esecul se cere din datele testului si aplicatia
 * nu are nicio ramura de test in ea.
 */
export const RESEND_FAIL_MARKER = "RESEND-MOCK-FAIL";

export type MockMessage = {
  at: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
  authorized: boolean;
};

type MockState = { sent: MockMessage[]; refused: MockMessage[] };

async function state(request: APIRequestContext): Promise<MockState> {
  const response = await request.get(`${RESEND_MOCK_URL}/__sent`);
  if (!response.ok()) return { sent: [], refused: [] };
  return (await response.json()) as MockState;
}

/** Mesajele acceptate care pomenesc SKU-ul dat. */
export async function sentFor(request: APIRequestContext, sku: string): Promise<MockMessage[]> {
  const { sent } = await state(request);
  return sent.filter((m) => `${m.subject}\n${m.text}`.includes(sku));
}

/** Mesajele refuzate deliberat care pomenesc SKU-ul dat. */
export async function refusedFor(request: APIRequestContext, sku: string): Promise<MockMessage[]> {
  const { refused } = await state(request);
  return refused.filter((m) => `${m.subject}\n${m.text}`.includes(sku));
}
