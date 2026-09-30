// P3-113, goal G69 partea 2. SECTIUNILE ECRANULUI DE SETARI, numite o singura data.
//
// Raportul de proiectare docs/reports/2026-09-30-author-setari-design.md a cerut un
// sub-meniu de secțiuni pe /setari. Lista lor sta aici, si nu in ecran, din acelasi
// motiv pentru care sta si lista de rute in lib/nav.ts: meniul, pagina si
// specificatia citesc aceeasi lista, deci nu pot ajunge sa spuna lucruri diferite.
//
// ADRESA ESTE UN PARAMETRU DE INTEROGARE, `?sectiune=`, si nu o sub-cale.
// Trei motive, in ordinea greutatii:
//   1. RC are deja exact acest mecanism de doua ori, pe fisa clientului si pe fisa
//      proiectului, unde fila aleasa este `?fila=` (components/clients/ClientTabs.tsx).
//      Al doilea mecanism pentru aceeasi idee ar fi un al doilea lucru de invatat.
//   2. /setari NU ARE VOIE SA REDIRECTEZE si trebuie sa raspunda la adresa lui goala:
//      tests/e2e/auth.spec.ts cere ca adresa sa ramana /setari, iar zece fisiere de
//      test isi adauga o categorie de pe adresa goala. Un parametru absent este o
//      stare implicita; o sub-cale ar fi cerut o redirectare sau o a doua pagina.
//   3. labelForPath si ALL_ROUTES din lib/nav.ts citesc numai calea, deci titlul din
//      bara de sus si baterea de legaturi moarte din tests/e2e/headers.spec.ts
//      acopera fiecare adresa adaugata de acest card FARA nicio inregistrare noua.
//      O sub-cale ar fi ieșit din amandoua in tacere.

/** Numele parametrului din adresa care alege secțiunea. */
export const SETTINGS_SECTION_PARAM = "sectiune";

export type SettingsSectionId = "toate" | "catalog" | "facturare" | "optiuni";

export type SettingsSection = {
  id: SettingsSectionId;
  /** Eticheta din sub-meniu, romaneste. */
  label: string;
  /** O linie care spune ce tine secțiunea, pusa pe legatura ca `title`. */
  hint: string;
};

// TOATE ESTE PRIMA SI ESTE IMPLICITUL, si asta este o abatere DELIBERATA de la o
// propoziție a raportului de proiectare, scrisa aici ca sa nu para o scapare.
//
// Raportul recomanda ca adresa goala sa deschida NUMAI secțiunea de vocabular. Nu se
// poate: tests/e2e/facturare-settings.spec.ts isi deschide ecranul prin ajutorul
// `openSettings`, care cere `settings-facturare` VIZIBIL dupa un simplu
// `goto("/setari")`, iar cardul acesta nu are voie sa atinga niciun test existent.
// Raportul a numarat constrangerea pe categorii si nu a deschis fisierul de
// facturare, deci constrangerea lui este corecta si incompleta.
//
// Ce se pastreaza din intenția raportului: pe adresa goala vocabularul catalogului
// este PRIMUL lucru citit, sub-meniul exista, iar fiecare secțiune are adresa ei.
export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "toate",
    label: "Toate setările",
    hint: "Toate secțiunile, una sub alta",
  },
  {
    id: "catalog",
    label: "Vocabularul catalogului",
    hint: "Categoriile și unitățile de măsură cu care este scris catalogul",
  },
  {
    id: "facturare",
    label: "Facturare",
    hint: "Seria facturilor, cota TVA implicită și datele firmei",
  },
  {
    id: "optiuni",
    label: "Opțiuni produse",
    hint: "Combinațiile de model, serie și grosime oferite pe formularul de produs",
  },
];

/** Adresa unei secțiuni. Pentru `toate` este adresa goala, care nu redirecteaza nicaieri. */
export function settingsSectionHref(id: SettingsSectionId): string {
  return id === "toate" ? "/setari" : `/setari?${SETTINGS_SECTION_PARAM}=${id}`;
}

/**
 * Secțiunea cerută de adresa. O valoare necunoscuta cade pe `toate` si nu da eroare:
 * cineva a trimis o legatura veche sau a scris in bara de adrese, exact drumul pe
 * care il ia deja o filă necunoscuta pe fisa clientului.
 */
export function parseSettingsSection(
  raw: string | string[] | undefined,
): SettingsSectionId {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const found = SETTINGS_SECTIONS.find((s) => s.id === value);
  return found ? found.id : "toate";
}
