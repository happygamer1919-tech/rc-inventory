// P3-65. CLASELE DE TELEFON ALE FORMULARELOR SI PANOURILOR, intr-un singur loc.
//
// Acelasi mecanism ca invelisul (P3-60) si listele (P3-64): fiecare clasa de aici
// poarta max-md, deci se aplica doar sub 768px, iar peste 768px nimic nu se
// schimba. ACELASI DOM, nu o a doua copie ascunsa, fiindca spec-urile numara
// randurile dupa data-testid si o copie ar dubla fiecare numar pe desktop.
//
// Tailwind citeste clasele si din fisierele .ts, deci sirurile de aici ajung in
// CSS exact ca cele scrise direct in componente.

/** Panoul lateral sau formularul: pe telefon ia toata latimea ecranului. */
export const PHONE_SHEET = "max-md:w-full";

/** Butonul de inchidere al panoului: 44px pe telefon, nu 32px. */
export const PHONE_CLOSE = "max-md:h-11 max-md:w-11";

/** Un rand de campuri alaturate: pe telefon, unul sub altul. */
export const PHONE_STACK = "max-md:grid-cols-1";

/** O tinta de atingere de 44px, pentru butoane si legaturi scrise de mana. */
export const PHONE_TAP = "max-md:min-h-11";

// P3-97, constatarea F14. UN CAMP SCRIS DE MANA, care nu trece prin Input sau
// Select din primitives si deci nu mosteneste tratamentul lor. Doua lucruri
// deodata, fiindca pe telefon nu are rost unul fara celalalt: 44px inaltime, si
// text de 16px, sub care iOS Safari mareste pagina la atingerea campului.
//
// Aceasta clasa a trait pana acum numai in ClientsScreen.tsx, ca al saselea
// nume local de acolo. Fisa de verificare a extragerii are nevoie exact de
// aceeasi combinatie, deci se muta aici in loc sa fie scrisa a doua oara.
export const PHONE_CONTROL = `${PHONE_TAP} max-md:text-base`;

/** O legatura in text sau intr-un rand: pe telefon o tinta de 44px, nu doar textul. */
export const PHONE_LINK = "max-md:inline-flex max-md:min-h-11 max-md:items-center";

/** O bifa: tinta este tot randul etichetei, nu patratelul de 16px. */
export const PHONE_CHECK = "max-md:min-h-11";

/** Banda de file: pe telefon se rupe pe doua randuri, nu deruleaza lateral. */
export const PHONE_TABS = "max-md:flex-wrap";

/** O fila din banda: 44px pe telefon. */
export const PHONE_TAB = "max-md:min-h-11";

/** Randul eticheta si valoare de pe o fisa: pe telefon eticheta sta deasupra. */
export const PHONE_ROW_PAIR = "max-md:flex-col max-md:items-start max-md:gap-1";
export const PHONE_ROW_LABEL = "max-md:w-auto";
export const PHONE_ROW_VALUE = "max-md:min-w-0 max-md:max-w-full max-md:[overflow-wrap:anywhere]";

// Tabelele din panouri, file si formulare: pe telefon fiecare rand devine un card,
// exact ca in P3-64. Eticheta fiecarei celule este textul antetului coloanei ei,
// pus pe celula in data-label si desenat din CSS, deci textul celulei ramane cel
// de azi. Clasa de tabel se pune pe un element care CONTINE tabelul.
export const PHONE_TABLE =
  "max-md:[&_table]:block max-md:[&_thead]:hidden max-md:[&_tbody]:grid max-md:[&_tbody]:gap-3 max-md:[&_tbody:not(:empty)]:p-4";
export const PHONE_ROW =
  "max-md:grid max-md:grid-cols-2 max-md:gap-x-4 max-md:gap-y-3 max-md:rounded-[12px] max-md:border max-md:border-rc-line max-md:p-4";
export const PHONE_CELL =
  "max-md:block max-md:min-w-0 max-md:border-b-0 max-md:p-0 max-md:text-left max-md:[overflow-wrap:anywhere] max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-rc-muted max-md:before:content-[attr(data-label)]";
export const PHONE_WIDE = `${PHONE_CELL} max-md:col-span-2`;
/** Celula de actiuni, fara antet: pe toata latimea cardului si fara eticheta. */
export const PHONE_ACTIONS_CELL =
  "max-md:col-span-2 max-md:block max-md:border-b-0 max-md:p-0 max-md:text-left";

// P3-100. UN TEXT LUNG DINTR-UN RAND: pe telefon se rupe, nu se taie. Doua
// fisiere scriau numele acesta, deci el intra aici; valoarea este cea din
// app/(app)/page.tsx, neschimbata. Un apel care porneste de la `truncate` mai
// adauga si `max-md:overflow-visible` la locul lui, cum face deja randul de pe
// tabloul de bord, fiindca nu orice text lung are nevoie de asta.
export const PHONE_WRAP = "max-md:whitespace-normal max-md:[overflow-wrap:anywhere]";
