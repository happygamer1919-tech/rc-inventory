import "server-only";

// Trimiterea prin Resend. Un singur loc in care se face cererea HTTP.
//
// NU ARUNCA NICIODATA. Fiecare cale de esec se intoarce ca { ok: false, reason }
// si apelantul o scrie pe randul de memento. Regula cardului P2-10 este ca o
// trimitere esuata nu anuleaza miscarea de stoc, iar cea mai simpla cale sa
// respecti asta este ca functia sa nu poata rupe firul apelantului.
//
// RESEND_API_KEY SE CITESTE DUPA NUME SI NU AJUNGE NICAIERI ALTUNDEVA. Nu apare
// in mesajul de eroare, nu apare in jurnal, nu ajunge in randul de memento.
// Corpul de eroare intors de Resend se taie la 200 de caractere si se pune in
// motiv: este raspunsul serverului, nu cererea, deci nu contine antetul de
// autorizare.
//
// RESEND_BASE_URL EXISTA PENTRU TESTE, si nu este o ramura de test in codul de
// productie. Este configuratie: implicit https://api.resend.com, iar suita o
// indreapta catre un server mic pornit de Playwright pe 127.0.0.1. Asa se
// verifica exact calea reala, cu fetch, cu antete si cu tratarea unui raspuns
// non-2xx, si nimic nu pleaca de pe masina. Alternativa, o ramura "if TEST",
// ar fi lasat netestata tocmai partea care poate cadea in productie.
//
// EXPEDITORUL este domeniul de intampinare Resend pana cand domeniul clientului
// este verificat. Mutarea este o schimbare de mediu si apartine cardului P2-12,
// nu unui card nou.

import type { SendResult } from "./types";

const DEFAULT_BASE_URL = "https://api.resend.com";
const DEFAULT_FROM = "Rapid Construct <onboarding@resend.dev>";

/** Cate milisecunde se asteapta raspunsul. O trimitere nu tine ecranul in loc. */
const TIMEOUT_MS = 10_000;

export type EmailMessage = {
  to: string[];
  subject: string;
  text: string;
  html: string;
};

function baseUrl(): string {
  const raw = process.env.RESEND_BASE_URL;
  const value = typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : DEFAULT_BASE_URL;
  return value.replace(/\/+$/, "");
}

function sender(): string {
  const raw = process.env.RESEND_FROM;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : DEFAULT_FROM;
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (typeof key !== "string" || key.trim().length === 0) {
    return {
      ok: false,
      reason: "Variabila de mediu RESEND_API_KEY lipseste, deci emailul nu a fost trimis.",
    };
  }

  if (message.to.length === 0) {
    return {
      ok: false,
      reason: "Nu exista niciun cont de administrator activ cu adresa de email, deci nu are cui fi trimis.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl()}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: sender(),
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Raspunsul serverului, taiat. Cererea, care poarta cheia, nu se atinge.
      const detail = (await response.text().catch(() => "")).trim().slice(0, 200);
      return {
        ok: false,
        reason: `Resend a raspuns ${response.status}.${detail.length > 0 ? ` ${detail}` : ""}`,
      };
    }

    const payload = (await response.json().catch(() => null)) as { id?: unknown } | null;
    const id = typeof payload?.id === "string" ? payload.id : "";
    return { ok: true, id };
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? `Resend nu a raspuns in ${TIMEOUT_MS / 1000} secunde.`
        : `Trimiterea a esuat: ${error instanceof Error ? error.message : String(error)}`;
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
  }
}
