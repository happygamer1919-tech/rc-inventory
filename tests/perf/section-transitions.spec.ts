// P3-117, Item 1a. MASURAREA SI NIMIC ALTCEVA.
//
// Rapid Construct spune ca schimbarea de sectiune dureaza doua pana la patru
// secunde. Cardul pune un cronometru pe asta si se opreste: nu repara nimic,
// nu atinge niciun ecran, nu deschide al doilea pull request. Cardurile de
// cauza vin dupa, dintr-un pull request de AUTHOR, scrise din numerele de aici.
//
// NICIUN PRAG NU ESTE AFIRMAT AICI. Afirmatia "sub 2000 ms" este a epicului si
// aterizeaza cu ultimul card de cauza. Un card de baseline care ar cadea pe
// propria lui rulare fiindca aplicatia este lenta, adica fiindca a gasit exact
// ce cauta, nu ar putea niciodata sa inregistreze numarul, care este intregul
// livrabil.
//
// CE SE MASOARA, MAI EXACT. Aplicatia nu are niciun loading.tsx, in niciun
// segment. In App Router asta inseamna ca adresa din bara se schimba abia cand
// raspunsul RSC al noii rute a sosit si s-a comis: ecranul vechi ramane pe loc
// pana atunci. Deci "de la clic pana la schimbarea caii" ESTE tranzitia pe care
// o simte operatorul, cap la cap, si nu o jumatate de ea. Se confirma dupa aceea
// ca intrarea de meniu a ajuns marcata `aria-current="page"`, adica noul arbore
// chiar s-a randat in client, nu doar adresa s-a schimbat.

import { expect, test } from "@playwright/test";
import {
  EroareMediuPerf,
  LINIE_RAPORT,
  SECTIUNI_PERF,
  VARIABILE_PERF,
  citesteMediulPerf,
  construiesteRaport,
  p75,
  verificaMediulPerf,
  type MasuratoarePerf,
  type MediuPerf,
} from "./support/report";

/* -------------------------------------------------- acceptanta (b) -- */

// FARA BROWSER SI FARA BAZA DE DATE. Cazul nu cere fixtura `page`, deci
// Playwright nu porneste niciun Chromium pentru el, si nu atinge nicio conexiune.
test("perf: lipsa unei variabile de mediu opreste rularea cu un mesaj care numeste variabila", () => {
  const complet = {
    RC_PERF_BASE_URL: "http://localhost:3103",
    RC_PERF_EMAIL: "cineva@exemplu.local",
    RC_PERF_PASSWORD: "parola-de-proba-nefolosita",
  };

  // Mediul complet trece: altfel cazul de mai jos ar putea sa treaca din motivul gresit.
  expect(verificaMediulPerf({ ...complet })).toEqual({ cod: 0, mesaj: "" });

  for (const lipsa of VARIABILE_PERF) {
    const mediu: MediuPerf = { ...complet };
    delete mediu[lipsa];

    const rezultat = verificaMediulPerf(mediu);

    // Se OPRESTE, nu avertizeaza.
    expect(rezultat.cod, `${lipsa} absenta trebuie sa dea un cod diferit de zero`).not.toBe(0);

    // Numeste variabila care lipseste.
    expect(rezultat.mesaj).toContain(lipsa);

    // SI NU CONTINE NICIO VALOARE, nici ale celorlalte doua, care sunt setate.
    for (const [nume, valoare] of Object.entries(complet)) {
      if (nume === lipsa) continue;
      expect(
        rezultat.mesaj,
        `mesajul pentru ${lipsa} nu are voie sa poarte valoarea lui ${nume}`,
      ).not.toContain(valoare);
    }
  }

  // Sirul gol este absenta, nu o valoare: altfel o variabila setata pe gol ar
  // trece de paza si ar cadea abia in browser, unde mesajul nu mai ajuta.
  const peGol = verificaMediulPerf({ ...complet, RC_PERF_PASSWORD: "   " });
  expect(peGol.cod).not.toBe(0);
  expect(peGol.mesaj).toContain("RC_PERF_PASSWORD");
});

/* -------------------------------------------------- acceptanta (c) -- */

test("perf: raportul nu tipareste niciodata adresa de baza, emailul sau parola", () => {
  // Santinele: siruri pe care nimic din cod nu le poate produce din intamplare.
  const SANTINELA_ADRESA = "http://santinela-adresa-9f3a1c.local:4321";
  const SANTINELA_EMAIL = "santinela-email-7b2d4e@exemplu.invalid";
  const SANTINELA_PAROLA = "santinela-parola-5c8f6a";

  const config = citesteMediulPerf({
    RC_PERF_BASE_URL: SANTINELA_ADRESA,
    RC_PERF_EMAIL: SANTINELA_EMAIL,
    RC_PERF_PASSWORD: SANTINELA_PAROLA,
  });

  // Mediul chiar a fost citit, deci santinelele sunt in mana raportului si ar
  // avea ce sa scape. Un caz care nu dovedeste asta nu dovedeste nimic.
  expect(config.email).toBe(SANTINELA_EMAIL);
  expect(config.parola).toBe(SANTINELA_PAROLA);

  // Fixtura fixa de durate, una per sectiune.
  const masuratori: MasuratoarePerf[] = SECTIUNI_PERF.map((s, i) => ({
    nume: s.nume,
    durate: [120, 340, 180, 990, 410, 275, 1520, 630, 205, 880].map((d) => d + i),
  }));

  const iesire = construiesteRaport(masuratori);
  const totul = iesire.join("\n");

  for (const santinela of [SANTINELA_ADRESA, SANTINELA_EMAIL, SANTINELA_PAROLA]) {
    expect(totul, "o santinela a ajuns in iesirea tiparita").not.toContain(santinela);
  }

  // Si iesirea este chiar raportul cerut: fix sase linii, forma fixata de (a),
  // in ordinea sectiunilor, fara Rapoarte si fara a saptea linie.
  expect(iesire).toHaveLength(6);
  expect(iesire.map((l) => l.split(" p75=")[0])).toEqual(SECTIUNI_PERF.map((s) => s.nume));
  for (const linie of iesire) expect(linie).toMatch(LINIE_RAPORT);
  expect(totul).not.toContain("Rapoarte");

  // Al optulea din zece valori sortate este p75 prin rang apropiat. Pentru
  // prima sectiune: 120 180 205 275 340 410 630 880 990 1520, deci 880.
  expect(p75(masuratori[0].durate)).toBe(880);
});

/* -------------------------------------------------- acceptanta (a) -- */

test("perf: p75 al tranzitiei de ruta pentru fiecare dintre cele sase sectiuni", async ({
  page,
}) => {
  // Sase sectiuni ori N navigari ori doua tranzitii fiecare, pe o aplicatie
  // despre care cardul spune ca ia doua pana la patru secunde per tranzitie.
  test.setTimeout(20 * 60 * 1000);

  let config;
  try {
    config = citesteMediulPerf(process.env);
  } catch (e) {
    if (e instanceof EroareMediuPerf) throw new Error(e.message);
    throw e;
  }

  const adresa = (cale: string) => `${config.adresaDeBaza}${cale}`;

  // `aside nav`, si nu pagina intreaga: tabloul de bord si ecranul CRM au
  // propriile lor legaturi catre aceleasi ecrane, iar un locator nelimitat ar
  // cadea pe modul strict pe unele pagini si ar masura un alt clic pe altele.
  // Este si selectorul pe care crm-landing.spec il foloseste deja pentru meniu.
  const meniu = (eticheta: string) =>
    page.locator("aside nav").getByRole("link", { name: eticheta, exact: true });

  /** Un clic de meniu, cap la cap. Intoarce durata in milisecunde. */
  async function navigheaza(eticheta: string, cale: string): Promise<number> {
    const link = meniu(eticheta);
    await expect(link).toBeVisible();

    const inceput = performance.now();
    await link.click();
    // Fara loading.tsx, calea se schimba abia cand noul arbore s-a comis.
    await page.waitForURL((u) => new URL(u).pathname === cale, { timeout: 60_000 });
    const durata = performance.now() - inceput;

    // Confirmarea ca s-a randat in client, nu doar ca adresa s-a schimbat.
    await expect(meniu(eticheta)).toHaveAttribute("aria-current", "page");
    return durata;
  }

  // O SINGURA AUTENTIFICARE pentru toata masurarea, asa cum cere clauza 1.
  await page.goto(adresa("/autentificare"));
  await expect(page.getByTestId("login-form")).toBeVisible();
  await page.locator("#email").fill(config.email);
  await page.locator("#password").fill(config.parola);
  await page.getByTestId("login-submit").click();
  await page.waitForURL((u) => new URL(u).pathname === "/", { timeout: 60_000 });
  await expect(page.getByTestId("topbar-role")).toBeVisible();

  const masuratori: MasuratoarePerf[] = [];

  for (const sectiune of SECTIUNI_PERF) {
    const durate: number[] = [];

    for (let i = 0; i < config.rulari; i += 1) {
      // Asezarea pe originea clicului masurat. NU se cronometreaza: numai
      // piciorul cerut de card, cel dinspre tabloul de bord catre sectiune,
      // intra in numar.
      if (new URL(page.url()).pathname !== sectiune.caleOrigine) {
        await navigheaza(sectiune.etichetaOrigine, sectiune.caleOrigine);
      }

      durate.push(await navigheaza(sectiune.eticheta, sectiune.cale));
    }

    masuratori.push({ nume: sectiune.nume, durate });
  }

  const raport = construiesteRaport(masuratori);

  // Cele sase linii, si nimic altceva, pe iesirea standard.
  for (const linie of raport) console.log(linie);

  expect(raport).toHaveLength(SECTIUNI_PERF.length);
  expect(raport).toHaveLength(6);
  for (const linie of raport) expect(linie).toMatch(LINIE_RAPORT);
  expect(raport.map((l) => l.split(" p75=")[0])).toEqual(SECTIUNI_PERF.map((s) => s.nume));

  // Fiecare sectiune are chiar N masuratori: o navigare pierduta ar face o
  // percentila calculata pe mai putine valori decat spune linia ei.
  for (const m of masuratori) expect(m.durate).toHaveLength(config.rulari);

  // SI NICIO AFIRMATIE DE PRAG. Vezi nota din capul fisierului: este a epicului.
});
