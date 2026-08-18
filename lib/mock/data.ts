// Datele demonstrative ale preview-ului. Un singur fisier, citit de toate ecranele.
// Nimic nu se salveaza: la reincarcarea paginii totul revine la starea de aici.
//
// Datele sunt fixe si scrise de mana, nu generate la rulare, ca cifrele de pe
// ecrane sa fie identice la fiecare demonstratie.

import type {
  Batch,
  FiredAlert,
  InboundOrder,
  Movement,
  OutboundIssue,
  Product,
  Supplier,
} from "./types";

/** Moneda unica de afisare pentru valoarea stocului. Nu se converteste nimic:
 *  valorile in MDL sunt stocate ca atare in datele de mai jos. */
export const DISPLAY_CURRENCY = "MDL";

export const SUPPLIERS: Supplier[] = [
  { id: "sup-tegola", name: "Tegola Canadese SpA", country: "Italia", currency: "EUR", contact: "ordini@tegolacanadese.it" },
  { id: "sup-bilka", name: "Bilka Steel SRL", country: "România", currency: "RON", contact: "comenzi@bilka.ro" },
  { id: "sup-gerard", name: "Gerard Roofing Systems BV", country: "Olanda", currency: "EUR", contact: "orders@gerardroofs.eu" },
  { id: "sup-knauf", name: "Knauf Insulation SRL", country: "România", currency: "RON", contact: "comenzi@knaufinsulation.ro" },
  { id: "sup-baumit", name: "Baumit România SRL", country: "România", currency: "RON", contact: "comenzi@baumit.ro" },
  { id: "sup-roben", name: "Röben Klinker GmbH", country: "Germania", currency: "EUR", contact: "bestellung@roben.de" },
  { id: "sup-rigips", name: "Saint-Gobain Rigips România", country: "România", currency: "RON", contact: "comenzi@rigips.ro" },
  { id: "sup-wavin", name: "Wavin Ekoplastik s.r.o.", country: "Cehia", currency: "EUR", contact: "orders@wavin.cz" },
];

export const PRODUCTS: Product[] = [
  // Învelitori
  { id: "p-01", sku: "SIN-BIT-001", name: "Șindrilă bituminoasă Tegola Master 3T, roșu", category: "Învelitori", unit: "m2", stock: 1240, threshold: 400, unitValueMdl: 248, supplierId: "sup-tegola" },
  { id: "p-02", sku: "SIN-BIT-002", name: "Șindrilă bituminoasă Tegola Liberty, verde", category: "Învelitori", unit: "m2", stock: 310, threshold: 350, unitValueMdl: 262, supplierId: "sup-tegola" },
  { id: "p-03", sku: "TIG-MET-001", name: "Țiglă metalică Bilka Clasic 0.5 mm, vișiniu RAL 3005", category: "Învelitori", unit: "m2", stock: 2180, threshold: 600, unitValueMdl: 189, supplierId: "sup-bilka" },
  { id: "p-04", sku: "TIG-MET-002", name: "Țiglă metalică Bilka Vintage 0.5 mm, negru RAL 9005", category: "Învelitori", unit: "m2", stock: 540, threshold: 500, unitValueMdl: 214, supplierId: "sup-bilka" },
  { id: "p-05", sku: "TIG-MET-003", name: "Țiglă metalică Gerard Milano, cărămiziu", category: "Învelitori", unit: "m2", stock: 0, threshold: 250, unitValueMdl: 397, supplierId: "sup-gerard" },

  { id: "p-25", sku: "ACC-COA-001", name: "Coamă rotundă Bilka 190 mm, vișiniu RAL 3005", category: "Învelitori", unit: "lm", stock: 240, threshold: 80, unitValueMdl: 118, supplierId: "sup-bilka" },
  { id: "p-26", sku: "ACC-SUR-001", name: "Șurub autoforant 4.8x35, cap vopsit RAL 3005", category: "Învelitori", unit: "buc", stock: 8600, threshold: 2000, unitValueMdl: 2.4, supplierId: "sup-bilka" },

  // Izolații
  { id: "p-06", sku: "VAT-MIN-001", name: "Vată minerală bazaltică Knauf DP-3, 100 mm", category: "Izolații", unit: "m3", stock: 68, threshold: 25, unitValueMdl: 2840, supplierId: "sup-knauf" },
  { id: "p-07", sku: "VAT-MIN-002", name: "Vată minerală de sticlă Knauf Unifit 035, 150 mm", category: "Izolații", unit: "rola", stock: 42, threshold: 60, unitValueMdl: 915, supplierId: "sup-knauf" },
  { id: "p-08", sku: "VAT-MIN-003", name: "Vată minerală fațadă Knauf FKD-S, 50 mm", category: "Izolații", unit: "m2", stock: 890, threshold: 300, unitValueMdl: 176, supplierId: "sup-knauf" },

  // Finisaje
  { id: "p-09", sku: "TEN-DEC-001", name: "Tencuială decorativă Baumit SilikonTop, 25 kg", category: "Finisaje", unit: "sac", stock: 96, threshold: 40, unitValueMdl: 1180, supplierId: "sup-baumit" },
  { id: "p-10", sku: "TEN-DEC-002", name: "Tencuială decorativă Baumit NanoporTop, 25 kg", category: "Finisaje", unit: "sac", stock: 28, threshold: 30, unitValueMdl: 1345, supplierId: "sup-baumit" },
  { id: "p-11", sku: "AMO-001", name: "Amorsă Baumit UniPrimer", category: "Finisaje", unit: "kg", stock: 420, threshold: 120, unitValueMdl: 64, supplierId: "sup-baumit" },

  // Placaje
  { id: "p-12", sku: "KLI-001", name: "Piatră klinker Röben Aarhus, format NF", category: "Placaje", unit: "m2", stock: 305, threshold: 150, unitValueMdl: 968, supplierId: "sup-roben" },
  { id: "p-13", sku: "KLI-002", name: "Piatră klinker Röben Melbourne, format NF", category: "Placaje", unit: "m2", stock: 118, threshold: 150, unitValueMdl: 1024, supplierId: "sup-roben" },
  { id: "p-14", sku: "KLI-003", name: "Colțar klinker Röben Aarhus", category: "Placaje", unit: "buc", stock: 640, threshold: 200, unitValueMdl: 42, supplierId: "sup-roben" },

  // Gips-carton
  { id: "p-15", sku: "PRO-GK-001", name: "Profil gips-carton CW 75, 3 m", category: "Gips-carton", unit: "lm", stock: 1860, threshold: 500, unitValueMdl: 47, supplierId: "sup-rigips" },
  { id: "p-16", sku: "PRO-GK-002", name: "Profil gips-carton UW 75, 4 m", category: "Gips-carton", unit: "lm", stock: 430, threshold: 450, unitValueMdl: 44, supplierId: "sup-rigips" },
  { id: "p-17", sku: "PLA-GK-001", name: "Placă gips-carton Rigips RB 12.5 mm", category: "Gips-carton", unit: "m2", stock: 1120, threshold: 350, unitValueMdl: 112, supplierId: "sup-rigips" },

  // Adezivi și mortare
  { id: "p-18", sku: "ADE-001", name: "Adeziv Baumit StarContact, 25 kg", category: "Adezivi și mortare", unit: "sac", stock: 210, threshold: 80, unitValueMdl: 186, supplierId: "sup-baumit" },
  { id: "p-19", sku: "ADE-002", name: "Mortar zidărie Baumit MC 55, 40 kg", category: "Adezivi și mortare", unit: "sac", stock: 64, threshold: 70, unitValueMdl: 154, supplierId: "sup-baumit" },
  { id: "p-20", sku: "ADE-003", name: "Chit de rosturi klinker Röben, gri", category: "Adezivi și mortare", unit: "kg", stock: 380, threshold: 100, unitValueMdl: 97, supplierId: "sup-roben" },

  // Sisteme pluviale
  { id: "p-21", sku: "PLU-001", name: "Jgheab semicircular Wavin 125 mm, maro", category: "Sisteme pluviale", unit: "lm", stock: 520, threshold: 180, unitValueMdl: 214, supplierId: "sup-wavin" },
  { id: "p-22", sku: "PLU-002", name: "Burlan Wavin 90 mm, maro", category: "Sisteme pluviale", unit: "lm", stock: 148, threshold: 160, unitValueMdl: 192, supplierId: "sup-wavin" },
  { id: "p-23", sku: "PLU-003", name: "Colțar exterior jgheab 125 mm", category: "Sisteme pluviale", unit: "buc", stock: 76, threshold: 40, unitValueMdl: 128, supplierId: "sup-wavin" },
  { id: "p-24", sku: "PLU-004", name: "Bridă jgheab 125 mm", category: "Sisteme pluviale", unit: "buc", stock: 0, threshold: 120, unitValueMdl: 36, supplierId: "sup-wavin" },
];

export const INBOUND_ORDERS: InboundOrder[] = [
  {
    id: "in-01", reference: "CMD-2026-0184", supplierId: "sup-bilka", currency: "RON", totalMdl: 412350,
    orderedAt: "2026-07-28", expectedAt: "2026-08-11", arrivedAt: "2026-08-11", status: "Recepționată",
    lines: [
      { productId: "p-03", quantity: 1600, unitPrice: 44.5 },
      { productId: "p-04", quantity: 420, unitPrice: 50.2 },
    ],
    history: [
      { at: "2026-07-28 09:14", status: "În așteptare", note: "Comandă transmisă furnizorului.", by: "Operator" },
      { at: "2026-08-11 14:02", status: "Recepționată", note: "Marfă recepționată integral. Loturile au fost create automat.", by: "Operator" },
    ],
  },
  {
    id: "in-02", reference: "CMD-2026-0187", supplierId: "sup-tegola", currency: "EUR", totalMdl: 268900,
    orderedAt: "2026-07-30", expectedAt: "2026-08-13", arrivedAt: "2026-08-13", status: "Recepționată",
    lines: [
      { productId: "p-01", quantity: 900, unitPrice: 11.4 },
      { productId: "p-02", quantity: 320, unitPrice: 12.1 },
    ],
    history: [
      { at: "2026-07-30 11:40", status: "În așteptare", note: "Comandă transmisă furnizorului.", by: "Operator" },
      { at: "2026-08-13 10:25", status: "Recepționată", note: "Recepție completă, fără diferențe.", by: "Operator" },
    ],
  },
  {
    id: "in-03", reference: "CMD-2026-0191", supplierId: "sup-knauf", currency: "RON", totalMdl: 186400,
    orderedAt: "2026-08-03", expectedAt: "2026-08-14", arrivedAt: "2026-08-14", status: "Recepționată",
    lines: [
      { productId: "p-06", quantity: 40, unitPrice: 728.0 },
      { productId: "p-08", quantity: 600, unitPrice: 45.1 },
    ],
    history: [
      { at: "2026-08-03 08:55", status: "În așteptare", note: "Comandă transmisă furnizorului.", by: "Operator" },
      { at: "2026-08-14 13:10", status: "Recepționată", note: "Recepție completă.", by: "Operator" },
    ],
  },
  {
    id: "in-04", reference: "CMD-2026-0195", supplierId: "sup-roben", currency: "EUR", totalMdl: 341200,
    orderedAt: "2026-08-05", expectedAt: "2026-08-16", arrivedAt: "2026-08-16", status: "Recepționată",
    lines: [
      { productId: "p-12", quantity: 260, unitPrice: 49.6 },
      { productId: "p-14", quantity: 500, unitPrice: 2.15 },
    ],
    history: [
      { at: "2026-08-05 15:20", status: "În așteptare", note: "Comandă transmisă furnizorului.", by: "Operator" },
      { at: "2026-08-16 09:45", status: "Recepționată", note: "Recepție completă. Un palet cu ambalaj deteriorat, marfa intactă.", by: "Operator" },
    ],
  },
  {
    id: "in-05", reference: "CMD-2026-0198", supplierId: "sup-baumit", currency: "RON", totalMdl: 94800,
    orderedAt: "2026-08-10", expectedAt: "2026-08-21", arrivedAt: null, status: "În așteptare",
    lines: [
      { productId: "p-09", quantity: 60, unitPrice: 302.0 },
      { productId: "p-18", quantity: 120, unitPrice: 47.6 },
    ],
    history: [
      { at: "2026-08-10 10:05", status: "În așteptare", note: "Comandă transmisă furnizorului. Livrare estimată 21 august.", by: "Operator" },
    ],
  },
  {
    id: "in-06", reference: "CMD-2026-0201", supplierId: "sup-gerard", currency: "EUR", totalMdl: 158700,
    orderedAt: "2026-08-12", expectedAt: "2026-08-25", arrivedAt: null, status: "În așteptare",
    lines: [{ productId: "p-05", quantity: 400, unitPrice: 20.35 }],
    history: [
      { at: "2026-08-12 16:30", status: "În așteptare", note: "Comandă transmisă furnizorului. Stoc epuizat la acest articol.", by: "Operator" },
    ],
  },
  {
    id: "in-07", reference: "CMD-2026-0203", supplierId: "sup-wavin", currency: "EUR", totalMdl: 72300,
    orderedAt: "2026-08-14", expectedAt: "2026-08-27", arrivedAt: null, status: "În așteptare",
    lines: [
      { productId: "p-22", quantity: 240, unitPrice: 9.85 },
      { productId: "p-24", quantity: 300, unitPrice: 1.85 },
    ],
    history: [
      { at: "2026-08-14 09:12", status: "În așteptare", note: "Comandă transmisă furnizorului.", by: "Operator" },
    ],
  },
  {
    id: "in-08", reference: "CMD-2026-0206", supplierId: "sup-rigips", currency: "RON", totalMdl: 63900,
    orderedAt: "2026-08-17", expectedAt: "2026-08-28", arrivedAt: null, status: "În așteptare",
    lines: [
      { productId: "p-16", quantity: 800, unitPrice: 11.3 },
      { productId: "p-17", quantity: 300, unitPrice: 28.7 },
    ],
    history: [
      { at: "2026-08-17 11:50", status: "În așteptare", note: "Comandă transmisă furnizorului.", by: "Operator" },
    ],
  },
];

export const BATCHES: Batch[] = [
  { id: "lot-01", productId: "p-03", inboundOrderId: "in-01", quantity: 1600, arrivedAt: "2026-08-11" },
  { id: "lot-02", productId: "p-04", inboundOrderId: "in-01", quantity: 420, arrivedAt: "2026-08-11" },
  { id: "lot-03", productId: "p-01", inboundOrderId: "in-02", quantity: 900, arrivedAt: "2026-08-13" },
  { id: "lot-04", productId: "p-02", inboundOrderId: "in-02", quantity: 320, arrivedAt: "2026-08-13" },
  { id: "lot-05", productId: "p-06", inboundOrderId: "in-03", quantity: 40, arrivedAt: "2026-08-14" },
  { id: "lot-06", productId: "p-08", inboundOrderId: "in-03", quantity: 600, arrivedAt: "2026-08-14" },
  { id: "lot-07", productId: "p-12", inboundOrderId: "in-04", quantity: 260, arrivedAt: "2026-08-16" },
  { id: "lot-08", productId: "p-14", inboundOrderId: "in-04", quantity: 500, arrivedAt: "2026-08-16" },
];

export const OUTBOUND_ISSUES: OutboundIssue[] = [
  {
    id: "out-01", reference: "IES-2026-0071", clientName: "Ion Rusu", projectName: "Acoperiș Orhei 100m2",
    issuedAt: "2026-08-12", shippedAt: "2026-08-12", status: "Expediată",
    lines: [
      { productId: "p-03", quantity: 120, salePriceMdl: 215 },
      { productId: "p-21", quantity: 48, salePriceMdl: 240 },
    ],
    history: [
      { at: "2026-08-12 08:30", status: "În așteptare expediere", note: "Bon de eliberare creat.", by: "Operator" },
      { at: "2026-08-12 15:05", status: "Expediată", note: "Marfă încărcată și plecată către șantier.", by: "Operator" },
    ],
  },
  {
    id: "out-02", reference: "IES-2026-0073", clientName: "SRL Casa Bună", projectName: "Fațadă Costești",
    issuedAt: "2026-08-13", shippedAt: "2026-08-14", status: "Expediată",
    lines: [
      { productId: "p-08", quantity: 240, salePriceMdl: 198 },
      { productId: "p-09", quantity: 22, salePriceMdl: 1320 },
      { productId: "p-18", quantity: 40, salePriceMdl: null },
    ],
    history: [
      { at: "2026-08-13 09:15", status: "În așteptare expediere", note: "Bon de eliberare creat.", by: "Operator" },
      { at: "2026-08-14 07:50", status: "Expediată", note: "Livrat cu transport propriu.", by: "Operator" },
    ],
  },
  {
    id: "out-03", reference: "IES-2026-0075", clientName: "Rapid Construct (șantier propriu)", projectName: "Casă Ialoveni",
    issuedAt: "2026-08-14", shippedAt: "2026-08-15", status: "Expediată",
    lines: [
      { productId: "p-15", quantity: 320, salePriceMdl: null },
      { productId: "p-17", quantity: 180, salePriceMdl: null },
      { productId: "p-16", quantity: 140, salePriceMdl: null },
    ],
    history: [
      { at: "2026-08-14 11:20", status: "În așteptare expediere", note: "Eliberare către șantier propriu, fără tarifare.", by: "Operator" },
      { at: "2026-08-15 08:10", status: "Expediată", note: "Predat echipei de montaj.", by: "Operator" },
    ],
  },
  {
    id: "out-04", reference: "IES-2026-0077", clientName: "Vasile Ciobanu", projectName: "Mansardă Bălți",
    issuedAt: "2026-08-16", shippedAt: "2026-08-16", status: "Expediată",
    lines: [
      { productId: "p-07", quantity: 18, salePriceMdl: 1050 },
      { productId: "p-06", quantity: 6, salePriceMdl: 3200 },
    ],
    history: [
      { at: "2026-08-16 10:00", status: "În așteptare expediere", note: "Bon de eliberare creat.", by: "Operator" },
      { at: "2026-08-16 16:40", status: "Expediată", note: "Ridicat de client de la depozit.", by: "Operator" },
    ],
  },
  {
    id: "out-05", reference: "IES-2026-0079", clientName: "SC Vertical Imob SRL", projectName: "Bloc Botanica, etapa 2",
    issuedAt: "2026-08-17", shippedAt: null, status: "În așteptare expediere",
    lines: [
      { productId: "p-12", quantity: 85, salePriceMdl: 1090 },
      { productId: "p-14", quantity: 160, salePriceMdl: 52 },
      { productId: "p-20", quantity: 60, salePriceMdl: 118 },
    ],
    history: [
      { at: "2026-08-17 13:25", status: "În așteptare expediere", note: "Bon de eliberare creat. Transport programat pentru 19 august.", by: "Operator" },
    ],
  },
  {
    id: "out-06", reference: "IES-2026-0081", clientName: "Gheorghe Lungu", projectName: "Hala Strășeni",
    issuedAt: "2026-08-18", shippedAt: null, status: "În așteptare expediere",
    lines: [
      { productId: "p-04", quantity: 260, salePriceMdl: 244 },
      { productId: "p-21", quantity: 90, salePriceMdl: 240 },
      { productId: "p-23", quantity: 12, salePriceMdl: 145 },
    ],
    history: [
      { at: "2026-08-18 09:05", status: "În așteptare expediere", note: "Bon de eliberare creat.", by: "Operator" },
    ],
  },
  {
    id: "out-07", reference: "IES-2026-0082", clientName: "Rapid Construct (șantier propriu)", projectName: "Vilă Vadul lui Vodă",
    issuedAt: "2026-08-18", shippedAt: null, status: "În așteptare expediere",
    lines: [
      { productId: "p-01", quantity: 145, salePriceMdl: null },
      { productId: "p-11", quantity: 55, salePriceMdl: null },
    ],
    history: [
      { at: "2026-08-18 14:15", status: "În așteptare expediere", note: "Eliberare către șantier propriu, fără tarifare.", by: "Operator" },
    ],
  },
];

export const FIRED_ALERTS: FiredAlert[] = [
  { id: "alr-01", productId: "p-05", firedAt: "2026-08-12 07:00", stockAtFire: 0, thresholdAtFire: 250 },
  { id: "alr-02", productId: "p-24", firedAt: "2026-08-13 07:00", stockAtFire: 0, thresholdAtFire: 120 },
  { id: "alr-03", productId: "p-02", firedAt: "2026-08-14 07:00", stockAtFire: 310, thresholdAtFire: 350 },
  { id: "alr-04", productId: "p-13", firedAt: "2026-08-15 07:00", stockAtFire: 118, thresholdAtFire: 150 },
  { id: "alr-05", productId: "p-07", firedAt: "2026-08-16 07:00", stockAtFire: 42, thresholdAtFire: 60 },
  { id: "alr-06", productId: "p-22", firedAt: "2026-08-17 07:00", stockAtFire: 148, thresholdAtFire: 160 },
  { id: "alr-07", productId: "p-10", firedAt: "2026-08-17 07:00", stockAtFire: 28, thresholdAtFire: 30 },
  { id: "alr-08", productId: "p-19", firedAt: "2026-08-18 07:00", stockAtFire: 64, thresholdAtFire: 70 },
  { id: "alr-09", productId: "p-16", firedAt: "2026-08-18 07:00", stockAtFire: 430, thresholdAtFire: 450 },
];

/** Miscarile sunt derivate din receptii si expedieri, dar sunt scrise explicit
 *  ca sa poarte contextul pe care ecranul de detaliu produs il arata. */
export const MOVEMENTS: Movement[] = [
  { id: "mv-01", productId: "p-03", direction: "in", quantity: 1600, at: "2026-08-11", reference: "CMD-2026-0184", context: "Recepție de la Bilka Steel SRL" },
  { id: "mv-02", productId: "p-04", direction: "in", quantity: 420, at: "2026-08-11", reference: "CMD-2026-0184", context: "Recepție de la Bilka Steel SRL" },
  { id: "mv-03", productId: "p-01", direction: "in", quantity: 900, at: "2026-08-13", reference: "CMD-2026-0187", context: "Recepție de la Tegola Canadese SpA" },
  { id: "mv-04", productId: "p-02", direction: "in", quantity: 320, at: "2026-08-13", reference: "CMD-2026-0187", context: "Recepție de la Tegola Canadese SpA" },
  { id: "mv-05", productId: "p-06", direction: "in", quantity: 40, at: "2026-08-14", reference: "CMD-2026-0191", context: "Recepție de la Knauf Insulation SRL" },
  { id: "mv-06", productId: "p-08", direction: "in", quantity: 600, at: "2026-08-14", reference: "CMD-2026-0191", context: "Recepție de la Knauf Insulation SRL" },
  { id: "mv-07", productId: "p-12", direction: "in", quantity: 260, at: "2026-08-16", reference: "CMD-2026-0195", context: "Recepție de la Röben Klinker GmbH" },
  { id: "mv-08", productId: "p-14", direction: "in", quantity: 500, at: "2026-08-16", reference: "CMD-2026-0195", context: "Recepție de la Röben Klinker GmbH" },

  { id: "mv-09", productId: "p-03", direction: "out", quantity: 120, at: "2026-08-12", reference: "IES-2026-0071", context: "Acoperiș Orhei 100m2" },
  { id: "mv-10", productId: "p-21", direction: "out", quantity: 48, at: "2026-08-12", reference: "IES-2026-0071", context: "Acoperiș Orhei 100m2" },
  { id: "mv-11", productId: "p-08", direction: "out", quantity: 240, at: "2026-08-14", reference: "IES-2026-0073", context: "Fațadă Costești" },
  { id: "mv-12", productId: "p-09", direction: "out", quantity: 22, at: "2026-08-14", reference: "IES-2026-0073", context: "Fațadă Costești" },
  { id: "mv-13", productId: "p-18", direction: "out", quantity: 40, at: "2026-08-14", reference: "IES-2026-0073", context: "Fațadă Costești" },
  { id: "mv-14", productId: "p-15", direction: "out", quantity: 320, at: "2026-08-15", reference: "IES-2026-0075", context: "Casă Ialoveni" },
  { id: "mv-15", productId: "p-17", direction: "out", quantity: 180, at: "2026-08-15", reference: "IES-2026-0075", context: "Casă Ialoveni" },
  { id: "mv-16", productId: "p-16", direction: "out", quantity: 140, at: "2026-08-15", reference: "IES-2026-0075", context: "Casă Ialoveni" },
  { id: "mv-17", productId: "p-07", direction: "out", quantity: 18, at: "2026-08-16", reference: "IES-2026-0077", context: "Mansardă Bălți" },
  { id: "mv-18", productId: "p-06", direction: "out", quantity: 6, at: "2026-08-16", reference: "IES-2026-0077", context: "Mansardă Bălți" },
];
