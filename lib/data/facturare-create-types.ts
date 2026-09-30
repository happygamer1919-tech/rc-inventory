// Facturare: forma ecranului de creare si de modificare. Cardul P3-110, goal G65
// partea 3.
//
// FISIER FARA "server-only", ca celelalte trei fisiere de tipuri ale facturarii:
// ecranul este un component de browser.
//
// UN SINGUR ECRAN PENTRU AMANDOUA CAILE, si de aceea un singur tip. /facturare/nou
// cu parametrul `iesire` este calea completata din Iesire, /facturare/nou fara el
// este cea aleasa de mana, iar /facturare/<id>/modifica este aceeasi forma
// incarcata de pe o ciorna salvata. Doua ecrane care ar completa acelasi formular
// altfel s-ar deosebi de la prima schimbare adusa unuia din ele.
//
// CANTITATILE SI PRETURILE SUNT SIRURI SI NU NUMERE, deliberat, exact cum sunt in
// NewIssueLine din outbound-types.ts: un camp pe jumatate tastat nu este un numar,
// iar `Number("")` este 0, adica exact valoarea care ar trece o verificare pe care
// campul gol trebuie sa o pice. Curatarea se face intr-un singur loc, in
// facturare-actions.ts, inainte de baza.

import type { UnitCode } from "./units";

/** O linie din formular. */
export type InvoiceDraftLine = {
  /**
   * Id-ul randului din public.invoice_lines, sau sir gol pentru o linie care
   * exista deocamdata numai pe ecran.
   *
   * ESTE SI CE DECIDE DACA LINIA SE POATE SCOATE. O linie cu sir gol nu a fost
   * scrisa niciodata, deci a o scoate nu sterge nimic. O linie cu id a fost scrisa,
   * iar migratia 0063 nu da nimanui drept de stergere pe public.invoice_lines si nu
   * creeaza nicio politica de stergere: nu exista cod care sa o poata scoate, si
   * ecranul spune asta romaneste in loc sa ofere un buton care ar esua.
   */
  id: string;
  /** Sir gol pentru o linie care nu este un produs din catalog: un transport. */
  productId: string;
  /** Numele produsului, ca formularul sa scrie linia unei ciorne salvate fara sa
   *  caute in catalog un produs care poate fi si dezactivat. */
  productName: string;
  description: string;
  unit: UnitCode;
  quantity: string;
  unitPrice: string;
};

/** Ce arata formularul cand se deschide. */
export type InvoiceEditorView = {
  /** Id-ul facturii cand se modifica o ciorna salvata, null cand se creeaza una. */
  invoiceId: string | null;
  /** Iesirea din care se face factura, cand se face din una. */
  fromIssue: { id: string; reference: string } | null;
  clientId: string;
  clientName: string;
  projectId: string;
  projectName: string;
  /**
   * Adevarat cand clientul si proiectul sunt CITITE si nu alese.
   *
   * Asa cere goalul pentru calea de pe o Iesire: "the client and the project read
   * from the Iesire, not typed". Un proiect apartine unui singur client, deci a
   * cere amandoua ar fi doua intrebari cu un singur raspuns si un mod de a gresi,
   * exact judecata scrisa in components/outbound/OutboundScreen.tsx.
   */
  partiesLocked: boolean;
  /** `YYYY-MM-DD`. Implicit ziua de azi in Chisinau. */
  issueDate: string;
  dueDate: string;
  notes: string;
  /** Procent, ca sir, din setarile pe care le-a stocat partea 1. */
  vatRate: string;
  lines: InvoiceDraftLine[];
  /**
   * Cum arata numarul pe care l-ar lua urmatoarea emitere din aceasta serie, pentru
   * propozitia de confirmare de la Emite.
   *
   * ESTE O CITIRE, NU O ALOCARE. Numarul se aloca numai de public.issue_invoice,
   * sub blocaj de rand, in tranzactia care emite. De aceea propozitia spune
   * "urmatorul numar din serie" si nu promite numarul: doi operatori care apasa
   * Emite in aceeasi secunda primesc doua numere consecutive, iar ecranul nu are
   * voie sa pretinda altceva.
   */
  nextNumberText: string;
  /**
   * Seria pentru care a fost citit numarul de mai sus.
   *
   * CARDUL P3-115, CONSTATAREA G8. Prezicerea se face pe server, la randare, pentru
   * ziua de emitere de atunci. Casuta Data emiterii este insa un camp obisnuit, deci
   * operatorul poate muta ziua in alt AN fara sa se mai ceara nimic serverului, si
   * atunci numarul aratat este dintr-o alta serie decat cea in care va cadea documentul.
   * Ecranul compara seria zilei alese cu aceasta si, cand nu sunt aceeasi, nu mai
   * numeste niciun numar.
   */
  nextNumberSeries: string;
  /** Prefixul seriei din Setari, ca ecranul sa poata calcula seria zilei alese. */
  seriesPrefix: string;
  /** Intra anul in numar? Aceeasi regula pe care o aplica public.invoice_series_for. */
  numberIncludesYear: boolean;
};

/** Din ce se alege, pe calea manuala. */
export type InvoiceEditorOptions = {
  clients: { id: string; name: string }[];
  projects: { id: string; name: string; clientId: string; clientName: string }[];
  products: { id: string; sku: string; name: string; unit: UnitCode }[];
};

/** Se poate face o factura din aceasta Iesire, si daca nu, de ce nu.
 *
 *  MOTIVUL ESTE INTOTDEAUNA PREZENT CAND RASPUNSUL ESTE NU. Un buton gri fara nicio
 *  propozitie langa el este defectul pentru care au fost ridicate cardurile P3-61 si
 *  P3-98, iar raportul de proiectare cere in terminii lui ca butonul sa spuna de ce
 *  este dezactivat "rather than just being grey". */
export type IssueInvoiceability = {
  canInvoice: boolean;
  /** Propozitia romaneasca de langa buton. Null exact cand se poate factura. */
  reason: string | null;
  /** Factura care exista deja pentru aceasta Iesire, cand exista una nefiind anulata. */
  existingInvoice: { id: string; numberText: string | null } | null;
  /**
   * P3-119 clauza 7, hotararea R-215. Refuzul este al MODULUI si nu al stării, deci
   * nu exista nimic ce operatorul ar putea face ca sa dispara.
   *
   * SI DE ASTA NU APARE NICIUN BUTON. Celelalte refuzuri sunt vremelnice: o poziție
   * fără preț capata un preț, o factura anulata pleaca. Acolo un buton dezactivat cu
   * propozitia lui langa el este raspunsul corect, si este ce a hotarat cardul P3-110.
   * O iesire catre un client direct nu devine facturabila NICIODATA, pe instructiunea
   * proprietarului, deci un buton acolo ar fi un buton care nu se va putea apasa
   * niciodata: obiceiul acestui proiect este ca ce nu se poate folosi nu apare.
   * `reason` rămâne si se arata, fiindca o absenta fara explicatie este o intrebare
   * fara raspuns.
   */
  neverInvoiceable: boolean;
};

/**
 * DE CE O IESIRE CATRE UN CLIENT DIRECT NU SE FACTUREAZA, in romana, o singura copie.
 *
 * Propozitia este a cardului P3-118, care a scris-o in getIssueInvoiceability. P3-119
 * clauza 7 cere ca, atunci cand se arata un motiv, el sa fie exact aceasta propozitie,
 * iar ecranul de confirmare al formularului o arata si el, deci ea nu mai poate sta
 * intr-un singur fisier de server: un component de browser nu poate importa
 * facturare-create.ts. Mutata aici, in fisierul de tipuri fara "server-only", unde o
 * pot citi amandoua.
 */
export const DIRECT_CLIENT_NOT_INVOICEABLE =
  "Ieșirea este către un client direct, deci nu se facturează: banii se încasează în afara sistemului.";
