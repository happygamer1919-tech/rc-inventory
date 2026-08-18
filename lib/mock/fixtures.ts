// Cele doua confirmari de comanda fabricate, folosite ca fisiere de test la
// incarcare in RC-04, impreuna cu ce "extrage" din ele procesarea simulata.
//
// Nu se citeste nimic din PDF: nu exista OCR si nu exista extragere reala.
// Sarcina utila de mai jos este scrisa de mana si este exact ce apare in
// formularul de verificare dupa animatia de procesare. Fiecare linie trimite la
// un produs real din catalogul RC-02, pentru ca formularul foloseste catalogul
// si fixeaza unitatea de masura din produs.

import type { Currency } from "./types";

export type ExtractedLine = {
  /** Codul de articol asa cum apare pe documentul furnizorului. */
  supplierArticle: string;
  /** Descrierea de pe document. */
  supplierDescription: string;
  /** Produsul din catalog cu care a fost pus in corespondenta. */
  productId: string;
  quantity: number;
  unitPrice: number;
};

export type FixtureDocument = {
  id: string;
  /** Numele fisierului asa cum il vede operatorul. */
  fileName: string;
  /** Calea publica catre PDF-ul din repo. */
  filePath: string;
  sizeLabel: string;
  /** Ce rezulta din procesarea simulata. */
  extracted: {
    supplierId: string;
    supplierNameOnDocument: string;
    documentNumber: string;
    currency: Currency;
    orderedAt: string;
    expectedAt: string;
    paymentTerms: string;
    incoterms: string;
    lines: ExtractedLine[];
  };
};

export const FIXTURE_DOCUMENTS: FixtureDocument[] = [
  {
    id: "fix-roben",
    fileName: "confirmare-comanda-roben-RK-2026-88134.pdf",
    filePath: "/fixturi/confirmare-comanda-roben-RK-2026-88134.pdf",
    sizeLabel: "6,8 KB",
    extracted: {
      supplierId: "sup-roben",
      supplierNameOnDocument: "ROBEN Klinker GmbH",
      documentNumber: "RK-2026-88134",
      currency: "EUR",
      orderedAt: "2026-08-17",
      expectedAt: "2026-08-26",
      paymentTerms: "30 zile net",
      incoterms: "DAP Chișinău",
      lines: [
        { supplierArticle: "AARHUS-NF", supplierDescription: "Klinker facing brick Aarhus, NF format", productId: "p-12", quantity: 180, unitPrice: 49.6 },
        { supplierArticle: "MELBOURNE-NF", supplierDescription: "Klinker facing brick Melbourne, NF format", productId: "p-13", quantity: 140, unitPrice: 52.4 },
        { supplierArticle: "AARHUS-CORNER", supplierDescription: "Klinker corner piece Aarhus", productId: "p-14", quantity: 320, unitPrice: 2.15 },
        { supplierArticle: "RB-JOINT-GR", supplierDescription: "Klinker jointing mortar, grey", productId: "p-20", quantity: 240, unitPrice: 4.95 },
      ],
    },
  },
  {
    id: "fix-bilka",
    fileName: "confirmare-comanda-bilka-BLK-2026-14507.pdf",
    filePath: "/fixturi/confirmare-comanda-bilka-BLK-2026-14507.pdf",
    sizeLabel: "6,9 KB",
    extracted: {
      supplierId: "sup-bilka",
      supplierNameOnDocument: "BILKA STEEL SRL",
      documentNumber: "BLK-2026-14507",
      currency: "RON",
      orderedAt: "2026-08-18",
      expectedAt: "2026-08-29",
      paymentTerms: "50% avans, 50% la livrare",
      incoterms: "CPT Chișinău",
      lines: [
        { supplierArticle: "BLK-CLASIC-05", supplierDescription: "Metal roof tile Clasic 0.5mm, RAL 3005", productId: "p-03", quantity: 850, unitPrice: 44.5 },
        { supplierArticle: "BLK-VINTAGE-05", supplierDescription: "Metal roof tile Vintage 0.5mm, RAL 9005", productId: "p-04", quantity: 470, unitPrice: 50.2 },
        { supplierArticle: "BLK-RIDGE-190", supplierDescription: "Ridge cap 190mm, RAL 3005", productId: "p-25", quantity: 96, unitPrice: 28.9 },
        { supplierArticle: "BLK-SCREW-48", supplierDescription: "Self-drilling screws 4.8x35, painted head", productId: "p-26", quantity: 4200, unitPrice: 0.42 },
      ],
    },
  },
];

/** Documentul implicit propus cand operatorul incarca un fisier oarecare. */
export const DEFAULT_FIXTURE = FIXTURE_DOCUMENTS[0];

/** Alege fixtura dupa numele fisierului incarcat, cu revenire la cea implicita.
 *  Asa, cand Ivan trage exact unul dintre cele doua PDF-uri, vede documentul
 *  potrivit, iar orice alt fisier tot produce o demonstratie coerenta. */
export function fixtureForFileName(name: string): FixtureDocument {
  const lower = name.toLowerCase();
  return (
    FIXTURE_DOCUMENTS.find((f) => lower.includes(f.id.replace("fix-", ""))) ?? DEFAULT_FIXTURE
  );
}
