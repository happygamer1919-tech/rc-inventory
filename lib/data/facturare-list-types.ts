// Facturare: forma listei de facturi si citirea filtrelor din URL. Cardul P3-109,
// goal G65 partea 2.
//
// FISIER FARA "server-only", ca facturare-types.ts si clients-types.ts: ecranul
// este un component de browser si are nevoie de tipuri si de intervalul lunii.
//
// FIECARE FILTRU ESTE IN URL, exact ca pe lista de clienti: o lista filtrata se
// poate trimite cuiva ca legatura si butonul de inapoi o reface intocmai. Un
// filtru care traieste numai in starea componentului este un ecran pe care nu il
// poti arata nimanui.
//
// PARAMETRII SUNT ROMANESTI SI VALORILE STARII SUNT ENGLEZESTI, ca pe /clienti,
// unde `etapa=client` si `stare=active` sunt deja tokenuri de enum in URL: o
// valoare de enum nu este text de interfata (P2-01), iar traducerea sta in
// invoiceStatusLabel si numai acolo.

import { isInvoiceStatus, type InvoiceStatus } from "./facturare-types";

/** Ce a cerut operatorul, citit din URL si completat cu luna curenta. */
export type InvoiceListQuery = {
  /** Ziua de la care, `YYYY-MM-DD`. Niciodata sir gol: lipsa devine luna curenta. */
  from: string;
  /** Ziua pana la care, inclusiv, `YYYY-MM-DD`. */
  to: string;
  /** Sir gol inseamna "Toate stările". */
  status: InvoiceStatus | "";
  /** Sir gol inseamna "Toți clienții". */
  clientId: string;
  /** Cautarea peste numarul facturii si numele clientului. */
  q: string;
};

/** Un rand de pe lista. */
export type InvoiceListRow = {
  id: string;
  /** Seria si numarul, sau null cat timp factura este ciorna. */
  series: string | null;
  number: number | null;
  status: InvoiceStatus;
  /**
   * ZIUA DUPA CARE SE FILTREAZA SI SE ORDONEAZA, `YYYY-MM-DD`.
   *
   * Este data emiterii cand factura are una. O CIORNA NU ARE, fiindca 0063 da
   * issue_date numai la Emite, si o ciorna fara nicio zi nu ar cadea in nicio
   * perioada: ar disparea de pe un ecran al carui filtru implicit este o luna,
   * adica exact munca neterminata pe care operatorul nu are voie sa o pierda.
   * Pentru ea ziua este ziua in care a fost creata, in ora Chisinaului.
   */
  date: string;
  /** Adevarat cand `date` este ziua crearii si nu ziua emiterii. */
  dateIsCreation: boolean;
  clientId: string;
  clientName: string;
  projectId: string | null;
  projectName: string | null;
  /** Totalul cu TVA, in MDL, asa cum l-au calculat declansatoarele din 0063. */
  totalMdl: number;
};

/** Clientii care au cel putin o factura, pentru filtrul de client. */
export type InvoiceClientChoice = { id: string; name: string };

/** Starile care sunt un document si o sumă datorată: emisă si plătită.
 *
 *  CARDUL P3-115, CONSTATAREA G7 a raportului
 *  docs/reports/2026-09-29-critic-bug-sweep-2.md. Singura cifra de bani de pe ecranul
 *  Facturi adună ciorne, care nu sunt documente si nu au număr, si facturi anulate,
 *  care sunt chiar declaratia ca banii NU sunt datorati. Filtrul implicit de stare
 *  este gol, adica Toate stările, deci cifra pe care un proprietar citeste ca "ce am
 *  facturat luna asta" nu era acel numar pentru nicio lună care contine o anulare.
 *
 *  AICI, INTR-O SINGURA LISTA, ca ecranul si citirea sa nu poata avea doua păreri
 *  despre ce este o factură vie. */
export const LIVE_INVOICE_STATUSES: readonly InvoiceStatus[] = ["issued", "paid"];

/** Este factura un document care poartă o sumă datorată? */
export function isLiveInvoice(status: InvoiceStatus): boolean {
  return LIVE_INVOICE_STATUSES.includes(status);
}

/** Lista, plus totalurile a ceea ce este chiar pe ecran. */
export type InvoiceListResult = {
  rows: InvoiceListRow[];
  /** Cate facturi sunt pe ecran acum, dupa fiecare filtru. */
  count: number;
  /** Cate dintre randurile de pe ecran sunt emise sau plătite. */
  liveCount: number;
  /** Suma totalurilor randurilor EMISE SAU PLATITE de pe ecran, in MDL.
   *
   *  P3-115, G7. Se numea `sumMdl` si aduna fiecare rand, ciornele si anulările
   *  incluse. Numele s-a schimbat odata cu inţelesul, dinadins: un camp care isi
   *  schimbă inţelesul si isi pastreaza numele este un camp pe care urmatorul cititor
   *  il crede pe cuvant. */
  liveSumMdl: number;
  clients: InvoiceClientChoice[];
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Filtrul de client este un identificator, iar orice altceva se ignora.
 *
 *  NU ESTE COSMETICA. Un `client=abc` ajuns in filtrul bazei face PostgREST sa
 *  raspunda 22P02 pentru un uuid nevalid, citirea intoarce null si ecranul ar
 *  spune ca facturarea nu este activa, ceea ce este fals. O adresa stricata arata
 *  deci lista nefiltrata, care este singurul lucru adevarat pe care il poate arata. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ziua scrisa `YYYY-MM-DD`, sau sir gol cand nu este o zi. */
function day(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  return DAY.test(trimmed) ? trimmed : "";
}

/**
 * Prima si ultima zi a lunii in care cade `today`.
 *
 * SE LUCREAZA PE SIRURI SI PE UTC, NICIODATA PE ORA LOCALA. `today` vine din
 * chisinauToday(), deci luna este deja cea din Chisinau; un `new Date(sir)` ar fi
 * miezul noptii UTC, adica ora 3 in Chisinau, si ar muta luna pentru o parte din
 * fiecare zi. Aceeasi capcana pe care o descrie chisinauToday in format.ts.
 *
 * Ultima zi se obtine cu ziua 0 a lunii urmatoare, care este ultima zi a lunii
 * cerute, si prin setUTCFullYear si nu prin Date.UTC, fiindca Date.UTC muta anii
 * de la 0 la 99 in 1900-1999.
 */
export function monthRange(today: string): { from: string; to: string } {
  const safe = DAY.test(today) ? today : "1970-01-01";
  const year = Number(safe.slice(0, 4));
  const month = Number(safe.slice(5, 7));
  const last = new Date(0);
  last.setUTCFullYear(year, month, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    from: `${safe.slice(0, 4)}-${safe.slice(5, 7)}-01`,
    to: `${safe.slice(0, 4)}-${safe.slice(5, 7)}-${pad(last.getUTCDate())}`,
  };
}

/**
 * Filtrele cerute, din parametrii adresei, cu luna lui `today` ca implicit.
 *
 * O SINGURA CASUTA GOALA NU GOLESTE PERIOADA: daca operatorul sterge numai `De
 * la`, capatul acela se intoarce la inceputul lunii si celalalt ramane cum era.
 * Fara asta, o casuta pe jumatate stearsa ar cere toata baza de facturi.
 *
 * O PERIOADA INTOARSA SE INTOARCE LA LOC. `De la` mai mare decat `Până la` nu
 * poate da niciun rand, deci ar arata starea goala cu ambele casute pline si fara
 * nicio explicatie; se schimba intre ele, ceea ce este ce a vrut sa spuna oricine
 * le-a scris in ordinea aceea.
 */
export function parseInvoiceQuery(
  params: {
    "de-la"?: string;
    "pana-la"?: string;
    stare?: string;
    client?: string;
    q?: string;
  },
  today: string,
): InvoiceListQuery {
  const month = monthRange(today);
  let from = day(params["de-la"]) || month.from;
  let to = day(params["pana-la"]) || month.to;
  if (from > to) [from, to] = [to, from];

  const stare = (params.stare ?? "").trim();
  const client = (params.client ?? "").trim();
  return {
    from,
    to,
    status: isInvoiceStatus(stare) ? stare : "",
    clientId: UUID.test(client) ? client : "",
    q: (params.q ?? "").trim(),
  };
}

/** Are ecranul vreun filtru pus, peste luna curenta si peste Toate stările? */
export function isFiltered(query: InvoiceListQuery, today: string): boolean {
  const month = monthRange(today);
  return (
    query.from !== month.from ||
    query.to !== month.to ||
    query.status !== "" ||
    query.clientId !== "" ||
    query.q !== ""
  );
}
