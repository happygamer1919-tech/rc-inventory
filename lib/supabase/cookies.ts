// Optiunile cookie-ului de sesiune, intr-un singur loc.
//
// CRIT-13. Trei clienti Supabase scriu ACELASI cookie: cel de browser din
// client.ts, cel de server din server.ts si cel din proxy.ts. Daca optiunile se
// pun pe unul singur, atributele cookie-ului ajung sa depinda de care cerere l-a
// scris ultima, ceea ce este mai rau decat sa nu le pui deloc, pentru ca arata
// corect exact atat cat sa nu fie verificat.
//
// SECURE: cookie-ul poarta tokenul de acces si pe cel de reimprospatare. Fara
// atributul Secure, browserul l-ar trimite si pe o cerere http simpla catre
// acelasi host. Productia raspunde numai pe https si trimite HSTS, deci
// fereastra este ingusta, dar un cookie de sesiune poarta atributul indiferent
// cat de ingusta este fereastra de azi.
//
// Pe http://localhost atributul Secure este acceptat de toate browserele
// curente, fiindca localhost este considerat context sigur. Nu exista deci
// nicio ramificatie pe mediu aici, si asta este intentionat: o conditie pe mediu
// ar face ca productia sa se comporte altfel decat ce au verificat testele.
//
// HTTPONLY RAMANE FALS SI NU ESTE O SCAPARE. Clientul de browser
// @supabase/ssr trebuie sa citeasca sesiunea din cookie ca sa poata reimprospata
// tokenul, deci httpOnly true ar rupe autentificarea. Riscul acceptat este
// scris in docs/reports/critic-wave1.md, ca sa fie o decizie, nu o omisiune.

import type { CookieOptions } from "@supabase/ssr";

export const COOKIE_OPTIONS: CookieOptions = {
  secure: true,
  sameSite: "lax",
};
