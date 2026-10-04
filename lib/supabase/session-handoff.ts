// P3-135. PREDAREA SESIUNII DE LA PROXY CATRE RANDARE.
//
// Proxy-ul verifica deja, pe fiecare cerere, tokenul (auth.getUser()) si
// profilul (profiles). Pana la acest card randarea facea apoi aceleasi doua
// apeluri inca o data, in layout, si inca o data in ecranele care cer
// utilizatorul. Aici proxy-ul preda ce a verificat, intr-un antet de cerere.
//
// ANTETUL ESTE SEMNAT, ALTFEL AR FI O GAURA. Un antet de cerere poate fi trimis
// de oricine, inclusiv de browser, iar o cale exclusa de matcher-ul din proxy.ts
// ajunge la randare fara sa fi trecut prin proxy. Un antet nesemnat cu "role:
// owner" ar fi deci o ridicare de rol la indemana oricui. De aceea antetul
// poarta o semnatura HMAC SHA-256 cu o cheie care exista numai pe server, si o
// expirare scurta. Randarea il accepta numai daca semnatura se verifica si nu a
// expirat; in orice alt caz face verificarea completa, ca inainte.
//
// CHEIA este SUPABASE_SERVICE_ROLE_KEY, deja prezenta in fiecare mediu in care
// ruleaza aplicatia (lib/env-required.ts). Nu se trimite niciodata browserului
// si nu apare in antet; mesajul semnat poarta un prefix propriu, deci semnatura
// nu poate fi confundata cu nicio alta folosire a cheii. Fara cheie, proxy-ul nu
// semneaza nimic si randarea face verificarea completa: o cheie lipsa costa
// viteza, niciodata acces.
//
// Fisierul nu importa next/headers: il foloseste si proxy-ul.

import type { AppRole, SessionUser } from "./types";

export const SESSION_HANDOFF_HEADER = "x-rc-session";

/** Cat timp ramane valabil un antet semnat. O cerere se randeaza in secunde. */
const TTL_MS = 60_000;

const CONTEXT = "rc-session-handoff-v1.";

const ROLES: readonly AppRole[] = ["owner", "account_manager"];

type Payload = SessionUser & { exp: number };

let keyPromise: Promise<CryptoKey | null> | null = null;

function signingKey(): Promise<CryptoKey | null> {
  if (!keyPromise) {
    const raw = process.env.SUPABASE_SERVICE_ROLE_KEY;
    keyPromise =
      typeof raw === "string" && raw.trim().length > 0
        ? crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(raw.trim()),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign", "verify"],
          )
        : Promise.resolve(null);
  }
  return keyPromise;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Semneaza utilizatorul verificat de proxy. Intoarce null cand cheia lipseste,
 * caz in care proxy-ul nu pune antetul si randarea verifica singura.
 */
export async function signSessionHandoff(user: SessionUser): Promise<string | null> {
  const key = await signingKey();
  if (!key) return null;
  const payload: Payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    fullName: user.fullName,
    exp: Date.now() + TTL_MS,
  };
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(CONTEXT + body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * Utilizatorul din antet, numai daca semnatura se verifica, nu a expirat si
 * forma este cea asteptata. Orice altceva intoarce null, iar apelantul face
 * verificarea completa.
 */
export async function verifySessionHandoff(token: string | null | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const key = await signingKey();
  if (!key) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const signature = fromBase64Url(sig);
  const bodyBytes = fromBase64Url(body);
  if (!signature || !bodyBytes) return null;

  // crypto.subtle.verify compara in timp constant.
  const valid = await crypto.subtle.verify("HMAC", key, signature, new TextEncoder().encode(CONTEXT + body));
  if (!valid) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.exp !== "number" || p.exp < Date.now()) return null;
  if (typeof p.id !== "string" || p.id.length === 0) return null;
  if (!ROLES.includes(p.role as AppRole)) return null;
  if (p.email !== null && typeof p.email !== "string") return null;
  if (p.fullName !== null && typeof p.fullName !== "string") return null;

  return {
    id: p.id,
    email: p.email as string | null,
    role: p.role as AppRole,
    fullName: p.fullName as string | null,
  };
}
