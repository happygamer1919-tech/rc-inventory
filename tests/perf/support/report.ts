// P3-117, Item 1a. Partea PURA a masurarii tranzitiilor intre sectiuni.
//
// Tot ce se poate decide fara browser si fara baza de date sta aici: lista
// sectiunilor, citirea mediului, refuzul productiei, percentila si construirea
// liniilor de raport. Specul de langa acest fisier conduce browserul si nimic
// mai mult.
//
// DE CE SEPARAT. Acceptanta (b) si (c) ale cardului cer doua cazuri care se
// dovedesc FARA browser si FARA baza de date, ca sa ruleze in CI pe orice
// masina. Un caz care ar trebui sa porneasca Chromium ca sa afle ce scrie un
// mesaj de eroare nu este acel caz.
//
// ROMANA FARA DIACRITICE IN ACEST DOSAR, deliberat si nu din neglijenta. Regula
// depozitului cere diacritice in interfata, adica in ce citeste proprietarul pe
// ecran. Aici nu este interfata: sunt mesaje de terminal si nume de sectiuni
// tiparite intr-un jurnal de CI, iar acceptanta (a) a cardului fixeaza forma
// liniei cu expresia `^(Tablou de bord|Inventar|Iesiri materiale|CRM|Facturi|
// Setari) p75=\d+ms n=\d+$`, care NU are diacritice. Vecinul direct,
// tests/e2e/support/accounts.ts, scrie la fel.

/** O sectiune masurata: de unde se pleaca, unde se ajunge, cum se numeste in raport. */
export type SectiunePerf = {
  /** Numele din raport. Fara diacritice: asa il cere expresia din acceptanta (a). */
  nume: string;
  /** Calea sectiunii masurate. */
  cale: string;
  /** Eticheta din meniul lateral pe care se da clic. Cu diacritice: este text de interfata. */
  eticheta: string;
  /** Calea de la care porneste clicul masurat. */
  caleOrigine: string;
  /** Eticheta din meniu a originii, pentru revenirea nemasurata. */
  etichetaOrigine: string;
};

const TABLOU = { cale: "/", eticheta: "Tablou de bord" };
const INVENTAR = { cale: "/inventar", eticheta: "Inventar" };

/**
 * CELE SASE SECTIUNI, SI SUNT SASE SI NU CINCI (D2 al cardului).
 *
 * Cererea lui Ivan numeste Stoc, Iesiri materiale, CRM, Rapoarte si Setari.
 * Doua dintre cele cinci nu sunt rute in aceasta aplicatie:
 *
 *   - NU EXISTA /stoc. Ecranul se cheama Inventar si Inventar ESTE Stoc, deci
 *     se masoara sub numele lui real.
 *   - NU EXISTA NICIO RUTA Rapoarte. Este SARITA, nu inventata si nu masurata
 *     impotriva unei pagini care nu exista. Cand ruta va exista, linia ei de
 *     mai jos este o singura linie.
 *
 * Facturi si Tablou de bord exista, sunt sectiuni principale pe care operatorul
 * le foloseste zilnic, deci se masoara.
 *
 * ORIGINEA CLICULUI MASURAT. Cardul cere "navigheaza la ea de pe tabloul de bord
 * de N ori". Pentru cinci sectiuni originea este chiar tabloul de bord. Pentru
 * tabloul de bord insusi nu poate fi el insusi, fiindca un clic pe sectiunea in
 * care te afli deja nu este o tranzitie; se masoara atunci intoarcerea de pe
 * Inventar, care este acelasi fel de tranzitie client, pe acelasi meniu.
 */
export const SECTIUNI_PERF: readonly SectiunePerf[] = [
  {
    nume: "Tablou de bord",
    cale: TABLOU.cale,
    eticheta: TABLOU.eticheta,
    caleOrigine: INVENTAR.cale,
    etichetaOrigine: INVENTAR.eticheta,
  },
  {
    nume: "Inventar",
    cale: INVENTAR.cale,
    eticheta: INVENTAR.eticheta,
    caleOrigine: TABLOU.cale,
    etichetaOrigine: TABLOU.eticheta,
  },
  {
    nume: "Iesiri materiale",
    cale: "/iesiri",
    eticheta: "Ieșiri materiale",
    caleOrigine: TABLOU.cale,
    etichetaOrigine: TABLOU.eticheta,
  },
  {
    nume: "CRM",
    cale: "/crm",
    eticheta: "CRM",
    caleOrigine: TABLOU.cale,
    etichetaOrigine: TABLOU.eticheta,
  },
  {
    nume: "Facturi",
    cale: "/facturare",
    eticheta: "Facturi",
    caleOrigine: TABLOU.cale,
    etichetaOrigine: TABLOU.eticheta,
  },
  {
    nume: "Setari",
    cale: "/setari",
    eticheta: "Setări",
    caleOrigine: TABLOU.cale,
    etichetaOrigine: TABLOU.eticheta,
  },
];

/** Forma exacta a unei linii de raport, asa cum o fixeaza acceptanta (a). */
export const LINIE_RAPORT =
  /^(Tablou de bord|Inventar|Iesiri materiale|CRM|Facturi|Setari) p75=\d+ms n=\d+$/;

/** Cele trei variabile de mediu. Niciuna nu are valoare implicita. */
export const VARIABILE_PERF = [
  "RC_PERF_BASE_URL",
  "RC_PERF_EMAIL",
  "RC_PERF_PASSWORD",
] as const;

export type VariabilaPerf = (typeof VARIABILE_PERF)[number];

/**
 * GAZDELE DE PRODUCTIE, pe care aceasta masurare refuza sa le deschida.
 *
 * Clauza 3 a cardului: "NICIUN TERMINAL NU DESCHIDE PRODUCTIA". Paza existenta,
 * scripts/assert-not-prod.mjs, citeste adresa proiectului Supabase din mediul
 * procesului, si aceea nu spune nimic despre ce baza foloseste o aplicatie
 * DEJA DESPLASATA pe care browserul doar o viziteaza. Deci masurarea isi are
 * propria lista, cu acelasi rationament pe care il scrie production-refs.mjs: o
 * gazda publica nu este un secret, iar o lista citita din mediu ar fi dezactivata
 * exact de mediul gol al oricarui terminal nou.
 *
 * Subdomeniile sunt prinse si ele: un "www." in fata nu schimba ce baza de date
 * sta in spate.
 */
export const GAZDE_PRODUCTIE = ["app.rapidconstruct.md", "rapidconstructmd.com"];

export type ConfiguratiePerf = {
  adresaDeBaza: string;
  email: string;
  parola: string;
  rulari: number;
};

/**
 * Mediul din care se citesc cele patru variabile.
 *
 * SI NU `NodeJS.ProcessEnv`. Acel tip cere `NODE_ENV`, fiindca Next il declara
 * obligatoriu, deci un obiect scris de mana intr-un test, cu exact cele trei
 * variabile pe care cazul le priveste, nu i se potriveste si `tsc --noEmit`
 * cade pe el. Cazurile numite din acceptanta (b) si (c) au nevoie sa construiasca
 * mediul lor, cu o variabila stearsa, deci tipul este cel larg. `process.env` i
 * se potriveste mai departe.
 */
export type MediuPerf = Record<string, string | undefined>;

/** Numarul implicit de navigari masurate per sectiune, peste care trece RC_PERF_RUNS. */
export const RULARI_IMPLICITE = 10;

export class EroareMediuPerf extends Error {
  constructor(mesaj: string) {
    super(mesaj);
    this.name = "EroareMediuPerf";
  }
}

function gol(valoare: string | undefined): boolean {
  return typeof valoare !== "string" || valoare.trim().length === 0;
}

/**
 * Citeste cele trei variabile din mediu.
 *
 * NICIO VALOARE IMPLICITA SI NICIO VALOARE IN MESAJ. Mesajul numeste variabila
 * care lipseste, niciodata continutul vreuneia dintre ele: un mesaj de eroare
 * ajunge intr-un jurnal de CI pe care il poate citi oricine.
 */
export function citesteMediulPerf(mediu: MediuPerf): ConfiguratiePerf {
  for (const nume of VARIABILE_PERF) {
    if (gol(mediu[nume])) {
      throw new EroareMediuPerf(
        `Variabila de mediu ${nume} lipseste. Masurarea nu are valori implicite: seteaza ${VARIABILE_PERF.join(", ")} in mediu inainte de a rula perf:sections. Nicio valoare nu este tiparita nicaieri.`,
      );
    }
  }

  const adresaDeBaza = (mediu.RC_PERF_BASE_URL as string).trim();

  let gazda: string;
  try {
    gazda = new URL(adresaDeBaza).hostname.toLowerCase();
  } catch {
    throw new EroareMediuPerf(
      "Variabila de mediu RC_PERF_BASE_URL nu este o adresa valida. Se asteapta o adresa completa, de forma http://gazda:port sau https://gazda.",
    );
  }

  const esteProductie = GAZDE_PRODUCTIE.some(
    (p) => gazda === p || gazda.endsWith(`.${p}`),
  );
  if (esteProductie) {
    throw new EroareMediuPerf(
      "Variabila de mediu RC_PERF_BASE_URL arata catre aplicatia de PRODUCTIE. Masurarea se autentifica si randeaza randuri de client, deci refuza sa porneasca. Ruleaza impotriva unei previzualizari sau a stivei locale din CI.",
    );
  }

  return {
    adresaDeBaza: adresaDeBaza.replace(/\/+$/, ""),
    email: (mediu.RC_PERF_EMAIL as string).trim(),
    parola: mediu.RC_PERF_PASSWORD as string,
    rulari: citesteNumarulDeRulari(mediu),
  };
}

/** N, implicit 10, peste care trece RC_PERF_RUNS. O valoare fara sens este refuzata, nu rotunjita tacit. */
export function citesteNumarulDeRulari(mediu: MediuPerf): number {
  const brut = mediu.RC_PERF_RUNS;
  if (gol(brut)) return RULARI_IMPLICITE;
  const n = Number((brut as string).trim());
  if (!Number.isInteger(n) || n < 1) {
    throw new EroareMediuPerf(
      "Variabila de mediu RC_PERF_RUNS nu este un numar intreg mai mare decat zero.",
    );
  }
  return n;
}

/**
 * Verifica mediul si intoarce un cod de iesire, pentru cazul numit din
 * acceptanta (b): lipsa unei variabile OPRESTE rularea, nu o avertizeaza.
 */
export function verificaMediulPerf(mediu: MediuPerf): {
  cod: number;
  mesaj: string;
} {
  try {
    citesteMediulPerf(mediu);
    return { cod: 0, mesaj: "" };
  } catch (e) {
    if (e instanceof EroareMediuPerf) return { cod: 1, mesaj: e.message };
    throw e;
  }
}

/** O sectiune masurata si duratele ei, in milisecunde. */
export type MasuratoarePerf = {
  nume: string;
  durate: number[];
};

/**
 * Percentila 75 prin rang apropiat, pe valori sortate crescator.
 *
 * P75 SI NU O MEDIE, si cardul spune de ce: o medie ascunde coada lenta, care
 * este exact lucrul de care se plange proprietarul. Rangul apropiat, si nu o
 * interpolare, fiindca numarul raportat ramane astfel o masuratoare care chiar
 * s-a intamplat si nu o valoare intre doua.
 */
export function p75(valori: readonly number[]): number {
  if (valori.length === 0) {
    throw new Error("p75 a primit zero masuratori: nu exista percentila a nimicului.");
  }
  const sortate = [...valori].sort((a, b) => a - b);
  const index = Math.ceil(0.75 * sortate.length) - 1;
  return Math.round(sortate[index]);
}

/**
 * Liniile pe care le tipareste masurarea, si NIMIC ALTCEVA.
 *
 * Exact cate sectiuni, o linie fiecare, in ordinea din SECTIUNI_PERF. Fara antet
 * si fara subsol: acceptanta (a) cere fix sase linii de raport, iar contextul
 * rularii, adica sha-ul, samanta si data, se scrie in notele cardului, unde ii
 * este locul, si nu pe iesirea standard.
 *
 * Niciuna dintre cele trei variabile nu ajunge aici. Nu este o omisiune care se
 * poate strecura inapoi: cazul numit din acceptanta (c) o dovedeste cu valori
 * santinela.
 */
export function construiesteRaport(masuratori: readonly MasuratoarePerf[]): string[] {
  return masuratori.map((m) => `${m.nume} p75=${p75(m.durate)}ms n=${m.durate.length}`);
}
