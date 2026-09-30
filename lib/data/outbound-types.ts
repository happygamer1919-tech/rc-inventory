// Tipurile si constantele iesirilor, fara nimic de server.
//
// Acelasi motiv ca la inbound-types: un component de client care ia de aici o
// valoare nu trebuie sa traga in bundle un modul marcat "server-only", iar un
// fisier "use server" nu are voie sa exporte decat functii async.

export type OutboundStatus = "awaiting_shipment" | "shipped";

/** Cele doua feluri de iesire, cardul P3-118 si hotararea R-215. Tokenuri
 *  englezesti, P2-01: valoarea stocata nu este text de interfata. Cuvintele
 *  romanesti "Proiect" si "Client direct" sunt ale cardurilor P3-119 si P3-120 si
 *  nu se scriu in acest card, care nu atinge niciun ecran. */
export type OutboundMode = "project" | "direct_client";

/** Etichetele romanesti din faza 1, cu diacriticele lor. */
export const OUTBOUND_STATUS_LABEL: Record<OutboundStatus, string> = {
  awaiting_shipment: "În așteptare expediere",
  shipped: "Expediată",
};

/** Cuvintele romanesti ale celor doua moduri, cardul P3-119 clauza 1.
 *
 *  AICI SI NU IN COMPONENT, langa etichetele de status si pentru acelasi motiv:
 *  cardul P3-120 arata modul in liste si pe fisa iesirii, deci a doua oara. Doua
 *  copii ale aceluiasi cuvant sunt doua locuri de tinut la zi, si un `Record` pe
 *  uniune este singura forma pe care `npx tsc --noEmit` o refuza cand se adauga un
 *  mod si cineva uita eticheta.
 *
 *  P3-118 a lasat anume acest gol: "Cuvintele romanesti Proiect si Client direct
 *  sunt ale cardurilor P3-119 si P3-120 si nu se scriu in acest card". */
export const OUTBOUND_MODE_LABEL: Record<OutboundMode, string> = {
  project: "Proiect",
  direct_client: "Client direct",
};

export type OutboundLine = {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  unit: import("./units").UnitCode;
  quantity: number;
  salePriceMdl: number | null;
};

export type OutboundIssue = {
  id: string;
  reference: string;
  /** P3-10: destinatia ca inregistrare, pentru legaturi. Null cat timp randul
   *  istoric nu a fost reconciliat de P3-04. */
  projectId: string | null;
  clientId: string | null;
  clientName: string;
  projectName: string;
  issuedAt: string;
  shippedAt: string | null;
  status: OutboundStatus;
  lines: OutboundLine[];
  history: import("./inbound-types").StatusEvent[];
};

export type NewIssueLine = {
  productId: string;
  quantity: string;
  salePriceMdl: string;
  /** P3-118. OPTIONALA, si asta nu este o slabiciune. Unitatea traieste pe
   *  produs, in products.unit, si fiecare ecran o citeste de acolo prin
   *  unitLabel. Cand un apelant o trimite totusi, ea este verificata contra lui
   *  ALL_UNITS de lib/data/outbound-mode.ts, deviatia D3. Nu se STOCHEAZA pe
   *  poziție: o a doua reprezentare a unitatii ar fi chiar defectul pe care
   *  P3-04b l-a inchis pentru destinatie. */
  unit?: string;
};

export type NewIssueInput = {
  /** P3-118, hotararea R-215. Care fel de iesire. Lipsa inseamna "project",
   *  fiindca asta a fost singurul fel pana la 2026-09-30 si fiecare apelant
   *  scris inainte de acest card vrea exact acel fel. Alegerea "Tip ieșire" pe
   *  ecran este cardul P3-119. */
  mode?: OutboundMode;
  /** P3-04: destinatia este un proiect, nu doua siruri. Numele de client si de
   *  proiect se citesc de pe proiect in migratia 0018, nu se trimit de aici,
   *  ca cele doua reprezentari sa nu poata descrie destinatii diferite cat timp
   *  exista amandoua.
   *
   *  P3-118: obligatoriu in modul "project" si interzis in modul
   *  "direct_client", prin outbound_issues_project_mode_shape si
   *  outbound_issues_direct_client_mode_shape din migratia 0067. */
  projectId?: string;
  /** P3-118. Clientul CRM care ridica materialul, obligatoriu in modul
   *  "direct_client". Un RAND si niciodata un nume scris de mana, R-215. */
  clientId?: string;
  /** P3-118. Ziua ridicarii, yyyy-mm-dd, exact sirul pe care il da
   *  components/ui/DateField.tsx. Obligatorie in modul "direct_client".
   *  Singura autoritate asupra faptului ca ziua exista in calendar este coloana
   *  `date` din PostgreSQL. */
  pickupDate?: string;
  /** Calea de rezerva, folosita numai cat timp migratiile fazei 3 nu sunt
   *  aplicate si nu exista niciun proiect de ales. Vezi lib/data/outbound.ts. */
  clientName?: string;
  projectName?: string;
  lines: NewIssueLine[];
};

export type OutboundDetail = {
  issue: OutboundIssue | null;
  /**
   * P3-110, goal G65 partea 3. Se poate face o factura din aceasta iesire, si daca nu,
   * de ce nu.
   *
   * NULL INSEAMNA CA MIGRATIA 0063 NU ESTE APLICATA, si atunci butonul "Creează
   * factură" nu apare deloc: regula veche a acestui proiect este ca nimic din ce nu se
   * poate folosi nu apare pe ecran.
   */
  invoiceability: import("./facturare-create-types").IssueInvoiceability | null;
};
