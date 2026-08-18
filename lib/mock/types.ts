// Tipurile stratului de date demonstrative. Un singur depozit, un singur
// utilizator, fara autentificare. Nu exista baza de date si nu exista API:
// fiecare ecran citeste din acest modul.

/** Cele sapte unitati de masura folosite in catalog. Fiecare produs are exact una,
 *  fixata la nivel de produs si neschimbabila la introducere. Regula aceasta face
 *  parte din ce se vinde clientului. */
export type Unit = "m2" | "lm" | "buc" | "sac" | "kg" | "rola" | "m3";

export type Currency = "EUR" | "RON";

export type Category =
  | "Învelitori"
  | "Izolații"
  | "Finisaje"
  | "Placaje"
  | "Gips-carton"
  | "Sisteme pluviale"
  | "Adezivi și mortare";

export type Supplier = {
  id: string;
  name: string;
  country: string;
  currency: Currency;
  contact: string;
};

export type Product = {
  id: string;
  sku: string;
  name: string;
  category: Category;
  /** Unitatea fixa a produsului. Nu se poate schimba la introducere. */
  unit: Unit;
  /** Stoc curent, exprimat in unitatea produsului. */
  stock: number;
  /** Pragul de recomanda. Stoc sub sau egal cu pragul inseamna stoc redus. */
  threshold: number;
  /** Valoarea unitara stocata in MDL. Nu se converteste nimic la rulare:
   *  nu exista sursa de curs valutar in faza 1. */
  unitValueMdl: number;
  supplierId: string;
};

export type InboundStatus = "În așteptare" | "Recepționată";
export type OutboundStatus = "În așteptare expediere" | "Expediată";

export type OrderLine = {
  productId: string;
  quantity: number;
  /** Pret unitar in moneda comenzii. */
  unitPrice: number;
};

export type StatusEvent = {
  at: string;
  status: string;
  note: string;
  by: string;
};

export type InboundOrder = {
  id: string;
  reference: string;
  supplierId: string;
  currency: Currency;
  /** Valoarea totala stocata si in MDL, ca numar fix in datele demonstrative. */
  totalMdl: number;
  orderedAt: string;
  expectedAt: string;
  arrivedAt: string | null;
  status: InboundStatus;
  lines: OrderLine[];
  history: StatusEvent[];
};

/** Un lot exista per linie de comanda intrata si se creeaza la receptie. */
export type Batch = {
  id: string;
  productId: string;
  inboundOrderId: string;
  quantity: number;
  arrivedAt: string;
};

export type OutboundIssue = {
  id: string;
  reference: string;
  clientName: string;
  projectName: string;
  issuedAt: string;
  shippedAt: string | null;
  status: OutboundStatus;
  lines: OutboundLine[];
  history: StatusEvent[];
};

export type OutboundLine = {
  productId: string;
  quantity: number;
  /** Pretul de vanzare este optional: Rapid Construct elibereaza des material
   *  catre propriul santier fara sa il tarifeze. */
  salePriceMdl: number | null;
};

export type Movement = {
  id: string;
  productId: string;
  direction: "in" | "out";
  quantity: number;
  at: string;
  /** Comanda de intrare sau proiectul catre care a plecat materialul. */
  reference: string;
  context: string;
};

export type FiredAlert = {
  id: string;
  productId: string;
  firedAt: string;
  stockAtFire: number;
  thresholdAtFire: number;
};

export type ReminderChannels = {
  email: boolean;
  sms: boolean;
};
