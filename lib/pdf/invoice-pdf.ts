import "server-only";

// Factura ca PDF. Cardul P3-272, decizia lui Max din 2026-10-13: "yes add the PDF
// button, romanian only, with logo".
//
// CITESTE DIN InvoiceDetail SI NU CALCULEAZA NIMIC. Totalurile sunt cele scrise de
// declansatoarele din 0063, banii trec prin formatNumberExact si formatMoneyExact din
// lib/data/format.ts, procentul prin formatRate: PDF-ul nu are un al doilea formatator
// si nu poate ajunge sa scrie alt numar decat ecranul.
//
// UN FONT CU DIACRITICE ESTE IN REPO, NU UNUL STANDARD. Fonturile standard ale unui PDF
// (Helvetica) nu au ș și ț, deci textul ar fi iesit cu semne gresite. DejaVu Sans
// Condensed (lib/pdf/fonts, licenta alaturata) le are pe toate; pdfkit pastreaza in
// fisier numai semnele folosite, deci PDF-ul ramane mic.
//
// FARA BROWSER FARA CAP: pdfkit este JavaScript pur si merge in functia obisnuita de pe
// Vercel. Fonturile si sigla se citesc de pe disc, iar next.config.ts le include in
// pachetul rutei.
//
// CAMPURILE GOALE SE OMIT. Datele furnizorului sunt inca completate pe jumatate: un
// "Telefon:" fara nimic dupa el ar fi o eticheta orfana pe un document fiscal.

import { readFile } from "node:fs/promises";
import path from "node:path";
import PDFDocument from "pdfkit";
import {
  formatDate,
  formatMoneyExact,
  formatNumberExact,
  formatQtyNumber,
  formatRate,
} from "@/lib/data/format";
import { unitLabel } from "@/lib/data/units";
import { invoiceNumberText } from "@/lib/data/facturare-types";
import { invoiceLineLabel, type InvoiceDetail } from "@/lib/data/facturare-detail-types";

const FONT_DIR = path.join(process.cwd(), "lib", "pdf", "fonts");
const FONT_REGULAR = path.join(FONT_DIR, "DejaVuSansCondensed.ttf");
const FONT_BOLD = path.join(FONT_DIR, "DejaVuSansCondensed-Bold.ttf");
const LOGO = path.join(process.cwd(), "public", "brand", "rapid-construct-logo.png");

const MARGIN = 40;
const INK = "#1a1a1a";
const MUTED = "#666666";
const LINE = "#d6d6d6";
const SOFT = "#f3f3f3";
const ORANGE = "#f47c1f";
const RED = "#b42318";

/** Latimile coloanelor tabelului, in puncte. Suma este latimea utila a paginii A4 (515). */
const COLUMNS = [
  { key: "nr", label: "Nr.", width: 24, align: "left" },
  { key: "name", label: "Denumire", width: 191, align: "left" },
  { key: "unit", label: "UM", width: 38, align: "left" },
  { key: "qty", label: "Cantitate", width: 58, align: "right" },
  { key: "price", label: "Preț unitar", width: 76, align: "right" },
  { key: "vat", label: "TVA", width: 44, align: "right" },
  { key: "total", label: "Total", width: 84, align: "right" },
] as const;

const CELL_PAD = 4;

/** Randurile unui bloc de parte: eticheta si valoarea, fara cele goale. */
function filled(rows: [string, string][]): [string, string][] {
  return rows.filter(([, value]) => value.trim() !== "");
}

export async function renderInvoicePdf(invoice: InvoiceDetail): Promise<Buffer> {
  const [regular, bold, logo] = await Promise.all([
    readFile(FONT_REGULAR),
    readFile(FONT_BOLD),
    readFile(LOGO),
  ]);

  const numberText = invoiceNumberText(invoice.series, invoice.number) ?? "";
  const issuerName = invoice.issuer.name.trim();
  const cancelled = invoice.status === "cancelled";

  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    info: {
      Title: `Factură ${numberText}`.trim(),
      Author: issuerName === "" ? "Rapid Construct" : issuerName,
      Subject: `Factură pentru ${invoice.client.name}`,
    },
  });
  doc.registerFont("regular", regular);
  doc.registerFont("bold", bold);

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const pageWidth = doc.page.width - MARGIN * 2;
  const bottom = doc.page.height - MARGIN;

  /** Marcajul ANULATĂ, in diagonala, pe fiecare pagina a unei facturi anulate. */
  function stamp() {
    if (!cancelled) return;
    const x = doc.x;
    const y = doc.y;
    const cx = doc.page.width / 2;
    const cy = doc.page.height / 2;
    doc.save();
    doc.rotate(-35, { origin: [cx, cy] });
    doc.fillColor(RED).fillOpacity(0.14).font("bold").fontSize(110);
    doc.text("ANULATĂ", 0, cy - 62, { width: doc.page.width, align: "center", lineBreak: false });
    doc.restore();
    doc.x = x;
    doc.y = y;
  }
  doc.on("pageAdded", stamp);
  stamp();

  // ------------------------------------------------------------------ antet --
  const logoWidth = 128;
  doc.image(logo, MARGIN, MARGIN, { width: logoWidth });

  doc.fillColor(INK).font("bold").fontSize(22);
  doc.text("FACTURĂ", MARGIN, MARGIN, { width: pageWidth, align: "right" });
  if (numberText !== "") {
    doc.font("bold").fontSize(12).text(`Nr. ${numberText}`, MARGIN, doc.y + 1, {
      width: pageWidth,
      align: "right",
    });
  }
  doc.font("regular").fontSize(9.5).fillColor(MUTED);
  doc.text(`Data emiterii: ${formatDate(invoice.issueDate)}`, MARGIN, doc.y + 4, {
    width: pageWidth,
    align: "right",
  });
  if (invoice.dueDate) {
    doc.text(`Data scadenței: ${formatDate(invoice.dueDate)}`, MARGIN, doc.y + 1, {
      width: pageWidth,
      align: "right",
    });
  }

  let y = Math.max(doc.y, MARGIN + logoWidth * (331 / 752)) + 14;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + pageWidth, y).lineWidth(1.5).strokeColor(ORANGE).stroke();
  y += 14;

  // ------------------------------------------------------------------ parti --
  const gap = 24;
  const colWidth = (pageWidth - gap) / 2;

  function party(title: string, name: string, rows: [string, string][], x: number, top: number): number {
    doc.fillColor(MUTED).font("bold").fontSize(8.5);
    doc.text(title.toUpperCase(), x, top, { width: colWidth, characterSpacing: 0.6 });
    doc.fillColor(INK).font("bold").fontSize(11);
    doc.text(name.trim() === "" ? "-" : name, x, doc.y + 3, { width: colWidth });
    for (const [label, value] of filled(rows)) {
      doc.font("regular").fontSize(9).fillColor(MUTED);
      doc.text(`${label}: `, x, doc.y + 2, { width: colWidth, continued: true });
      doc.fillColor(INK).text(value, { width: colWidth });
    }
    return doc.y;
  }

  const issuer = invoice.issuer;
  const leftEnd = party(
    "Furnizor",
    issuer.name,
    [
      ["IDNO", issuer.fiscalCode],
      ["Cod TVA", issuer.vatCode],
      ["Adresă", issuer.address],
      ["Bancă", issuer.bank],
      ["IBAN", issuer.iban],
      ["Telefon", issuer.phone],
      ["E-mail", issuer.email],
    ],
    MARGIN,
    y,
  );
  const rightEnd = party(
    "Cumpărător",
    invoice.client.name,
    [
      ["IDNO", invoice.client.fiscalCode],
      ["Adresă", invoice.client.address],
    ],
    MARGIN + colWidth + gap,
    y,
  );
  y = Math.max(leftEnd, rightEnd) + 18;

  // ---------------------------------------------------------------- tabelul --
  function drawHeaderRow(top: number): number {
    const height = 20;
    doc.rect(MARGIN, top, pageWidth, height).fillColor(SOFT).fill();
    let x = MARGIN;
    doc.font("bold").fontSize(8.5).fillColor(INK);
    for (const column of COLUMNS) {
      doc.text(column.label, x + CELL_PAD, top + 6, {
        width: column.width - CELL_PAD * 2,
        align: column.align,
        lineBreak: false,
      });
      x += column.width;
    }
    return top + height;
  }

  function cells(line: InvoiceDetail["lines"][number], index: number): string[] {
    return [
      String(index + 1),
      invoiceLineLabel(line),
      unitLabel(line.unit),
      formatQtyNumber(line.quantity),
      formatNumberExact(line.unitPriceMdl),
      formatRate(line.vatRate),
      formatNumberExact(line.lineTotalMdl),
    ];
  }

  y = drawHeaderRow(y);
  doc.font("regular").fontSize(9);
  invoice.lines.forEach((line, index) => {
    const values = cells(line, index);
    doc.font("regular").fontSize(9);
    const nameHeight = doc.heightOfString(values[1]!, { width: COLUMNS[1].width - CELL_PAD * 2 });
    const rowHeight = Math.max(nameHeight, 11) + CELL_PAD * 2;

    if (y + rowHeight > bottom) {
      doc.addPage();
      y = drawHeaderRow(MARGIN);
    }

    let x = MARGIN;
    doc.fillColor(INK);
    COLUMNS.forEach((column, i) => {
      doc.text(values[i]!, x + CELL_PAD, y + CELL_PAD, {
        width: column.width - CELL_PAD * 2,
        align: column.align,
      });
      x += column.width;
    });
    y += rowHeight;
    doc.moveTo(MARGIN, y).lineTo(MARGIN + pageWidth, y).lineWidth(0.5).strokeColor(LINE).stroke();
  });

  // ------------------------------------------------------------------ totaluri --
  const totalsWidth = 230;
  const totalsX = MARGIN + pageWidth - totalsWidth;
  const totalsHeight = 70;
  y += 12;
  if (y + totalsHeight > bottom) {
    doc.addPage();
    y = MARGIN;
  }

  function totalRow(label: string, value: string, top: number, strong: boolean) {
    doc.font(strong ? "bold" : "regular").fontSize(strong ? 12 : 10);
    doc.fillColor(strong ? INK : MUTED).text(label, totalsX, top, {
      width: totalsWidth / 2,
      lineBreak: false,
    });
    doc.fillColor(INK).text(value, totalsX + totalsWidth / 2, top, {
      width: totalsWidth / 2,
      align: "right",
      lineBreak: false,
    });
  }

  totalRow("Subtotal", formatMoneyExact(invoice.subtotalMdl), y, false);
  totalRow("TVA", formatMoneyExact(invoice.vatTotalMdl), y + 17, false);
  doc.moveTo(totalsX, y + 37).lineTo(totalsX + totalsWidth, y + 37).lineWidth(1).strokeColor(INK).stroke();
  totalRow("Total de plată", formatMoneyExact(invoice.totalMdl), y + 44, true);
  y += totalsHeight;

  // --------------------------------------------------- nota si anularea --
  function textBlock(title: string, body: string, color: string) {
    const height =
      doc.font("regular").fontSize(9.5).heightOfString(body, { width: pageWidth }) + 8 + 14;
    if (y + height > bottom) {
      doc.addPage();
      y = MARGIN;
    }
    doc.font("bold").fontSize(8.5).fillColor(color);
    doc.text(title.toUpperCase(), MARGIN, y, { width: pageWidth, characterSpacing: 0.6 });
    doc.font("regular").fontSize(9.5).fillColor(INK);
    doc.text(body, MARGIN, doc.y + 3, { width: pageWidth });
    y = doc.y + 14;
  }

  if (cancelled) {
    textBlock("Factură anulată", invoice.cancelReason?.trim() || "Fără motiv scris.", RED);
  }
  if (invoice.notes && invoice.notes.trim() !== "") {
    textBlock("Notă", invoice.notes.trim(), MUTED);
  }

  doc.end();
  return finished;
}
