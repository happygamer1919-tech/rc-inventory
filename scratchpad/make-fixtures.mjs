#!/usr/bin/env node
// Generator pentru cele doua confirmari de comanda fabricate din RC-02.
// Zero dependinte: scrie PDF-ul la nivel de obiecte si operatori de continut.
//
// Documentele sunt in engleza pentru ca asa arata in realitate o confirmare
// transfrontaliera intre un furnizor din UE si un cumparator din Moldova, si
// pentru ca fontul standard Helvetica din PDF nu are diacritice romanesti.
// Denumirile de articole sunt cele comerciale ale producatorului, fara diacritice.

import { writeFileSync } from "node:fs";

const PT = { w: 595.28, h: 841.89 }; // A4
const M = 48;


// Latimi reale de avans pentru Helvetica si Helvetica-Bold, la 1000 de unitati
// pe em. Estimarea anterioara (numar de caractere x 0.5 em) suprapunea coloanele
// aliniate la dreapta, asa ca alinierea se face acum pe latimea adevarata.
const W_REG = { " ": 278, "!": 278, '"': 355, "#": 556, "$": 556, "%": 889, "&": 667, "'": 191, "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278, ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015, "[": 278, "\\": 278, "]": 278, "_": 556, "|": 260,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500 };
const W_BOLD = { " ": 278, "!": 333, '"': 474, "#": 556, "$": 556, "%": 889, "&": 722, "'": 238, "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278, ":": 333, ";": 333, "<": 584, "=": 584, ">": 584, "?": 611, "@": 975, "[": 333, "\\": 278, "]": 333, "_": 556, "|": 280,
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556, K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278, k: 556, l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333, u: 611, v: 556, w: 778, x: 556, y: 556, z: 500 };

function textWidth(str, size, bold) {
  const tbl = bold ? W_BOLD : W_REG;
  let total = 0;
  for (const ch of String(str)) total += (tbl[ch] ?? 556);
  return (total / 1000) * size;
}

const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

class Page {
  constructor() { this.ops = []; }
  text(x, y, str, { size = 9.5, bold = false, color = "0 0 0" } = {}) {
    this.ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg 1 0 0 1 ${x.toFixed(2)} ${(PT.h - y).toFixed(2)} Tm (${esc(str)}) Tj ET`);
    return this;
  }
  right(xRight, y, str, opts = {}) {
    const w = textWidth(str, opts.size ?? 9.5, !!opts.bold);
    return this.text(xRight - w, y, str, opts);
  }
  line(x1, y1, x2, y2, { width = 0.6, color = "0.75 0.75 0.75" } = {}) {
    this.ops.push(`${color} RG ${width} w ${x1.toFixed(2)} ${(PT.h - y1).toFixed(2)} m ${x2.toFixed(2)} ${(PT.h - y2).toFixed(2)} l S`);
    return this;
  }
  rect(x, y, w, h, color = "0.95 0.95 0.95") {
    this.ops.push(`${color} rg ${x.toFixed(2)} ${(PT.h - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
    return this;
  }
  build() { return this.ops.join("\n"); }
}

function buildPdf(content, title) {
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };

  const fontR = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const fontB = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const stream = add(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
  const pagesRef = objs.length + 3;
  const page = add(`<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 ${PT.w} ${PT.h}] /Resources << /Font << /F1 ${fontR} 0 R /F2 ${fontB} 0 R >> >> /Contents ${stream} 0 R >>`);
  const info = add(`<< /Title (${esc(title)}) /Producer (Rapid Construct preview fixture) /Creator (RC-02) >>`);
  const pages = add(`<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>`);
  const catalog = add(`<< /Type /Catalog /Pages ${pages} 0 R >>`);

  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  objs.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const ORANGE = "0.957 0.486 0.122";

function confirmation(d) {
  const p = new Page();
  let y = M + 6;

  // --- antet furnizor ---
  p.text(M, y, d.supplier.name, { size: 17, bold: true });
  y += 15;
  for (const l of d.supplier.address) { p.text(M, y, l, { size: 8.4, color: "0.35 0.35 0.35" }); y += 10.5; }
  p.text(M, y, `VAT ID: ${d.supplier.vat}   |   ${d.supplier.email}   |   ${d.supplier.phone}`, { size: 8.4, color: "0.35 0.35 0.35" });

  // --- bloc titlu dreapta ---
  p.right(PT.w - M, M + 12, "ORDER CONFIRMATION", { size: 14, bold: true, color: ORANGE });
  p.right(PT.w - M, M + 30, `No. ${d.number}`, { size: 10, bold: true });
  p.right(PT.w - M, M + 44, `Date: ${d.date}`, { size: 9 });
  p.right(PT.w - M, M + 57, `Page 1 of 1`, { size: 8.4, color: "0.45 0.45 0.45" });

  y = M + 104;
  p.line(M, y, PT.w - M, y, { width: 1.1, color: "0.15 0.15 0.15" });
  y += 22;

  // --- parti ---
  const colR = M + 268;
  p.text(M, y, "BILL TO", { size: 8, bold: true, color: "0.45 0.45 0.45" });
  p.text(colR, y, "DELIVER TO", { size: 8, bold: true, color: "0.45 0.45 0.45" });
  y += 13;
  d.buyer.forEach((l, i) => {
    p.text(M, y + i * 11, l, { size: 9, bold: i === 0 });
    p.text(colR, y + i * 11, (d.shipTo[i] ?? ""), { size: 9, bold: i === 0 });
  });
  y += Math.max(d.buyer.length, d.shipTo.length) * 11 + 16;

  // --- termeni ---
  p.rect(M, y - 10, PT.w - 2 * M, 46, "0.965 0.965 0.968");
  const terms = [
    ["Your order ref.", d.buyerRef],
    ["Payment terms", d.paymentTerms],
    ["Incoterms", d.incoterms],
    ["Currency", d.currency],
    ["Dispatch date", d.dispatch],
    ["Carrier", d.carrier],
  ];
  terms.forEach((t, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = M + 12 + col * 166;
    p.text(x, y + row * 18, t[0], { size: 7.6, color: "0.45 0.45 0.45" });
    p.text(x, y + 9 + row * 18, t[1], { size: 9, bold: true });
  });
  y += 54;

  // --- tabel linii ---
  const cols = { pos: M + 4, art: M + 30, desc: M + 122, qtyR: M + 344, unit: M + 356, priceR: M + 438, totalR: PT.w - M - 4 };
  p.rect(M, y - 3, PT.w - 2 * M, 18, "0.12 0.12 0.13");
  p.text(cols.pos, y + 9, "#", { size: 7.8, bold: true, color: "1 1 1" });
  p.text(cols.art, y + 9, "ARTICLE", { size: 7.8, bold: true, color: "1 1 1" });
  p.text(cols.desc, y + 9, "DESCRIPTION", { size: 7.8, bold: true, color: "1 1 1" });
  p.right(cols.qtyR, y + 9, "QTY", { size: 7.8, bold: true, color: "1 1 1" });
  p.text(cols.unit, y + 9, "UNIT", { size: 7.8, bold: true, color: "1 1 1" });
  p.right(cols.priceR, y + 9, "UNIT PRICE", { size: 7.8, bold: true, color: "1 1 1" });
  p.right(cols.totalR, y + 9, "LINE TOTAL", { size: 7.8, bold: true, color: "1 1 1" });
  y += 24;

  let net = 0;
  d.lines.forEach((l, i) => {
    const lineTotal = l.qty * l.price;
    net += lineTotal;
    p.text(cols.pos, y + 8, String(i + 1), { size: 8.8 });
    p.text(cols.art, y + 8, l.article, { size: 8.8, bold: true });
    p.text(cols.desc, y + 8, l.desc, { size: 8.8 });
    p.right(cols.qtyR, y + 8, l.qty.toLocaleString("en-US"), { size: 8.8 });
    p.text(cols.unit, y + 8, l.unit, { size: 8.8 });
    p.right(cols.priceR, y + 8, l.price.toFixed(2), { size: 8.8 });
    p.right(cols.totalR, y + 8, lineTotal.toFixed(2), { size: 8.8, bold: true });
    y += 17;
    p.line(M, y, PT.w - M, y, { width: 0.4, color: "0.87 0.87 0.87" });
  });

  // --- totaluri ---
  y += 14;
  const vat = net * d.vatRate;
  const rows = [
    ["Net amount", net.toFixed(2), false],
    [`VAT ${(d.vatRate * 100).toFixed(0)}%`, vat.toFixed(2), false],
    ["TOTAL", `${(net + vat).toFixed(2)} ${d.currency}`, true],
  ];
  rows.forEach((r, i) => {
    if (r[2]) { p.line(PT.w - M - 210, y - 5, PT.w - M, y - 5, { width: 0.9, color: "0.15 0.15 0.15" }); }
    p.right(PT.w - M - 96, y + 8, r[0], { size: r[2] ? 10.5 : 9, bold: !!r[2] });
    p.right(PT.w - M, y + 8, r[1], { size: r[2] ? 10.5 : 9, bold: !!r[2] });
    y += r[2] ? 20 : 15;
  });

  // --- subsol ---
  const fy = PT.h - M - 62;
  p.line(M, fy, PT.w - M, fy, { width: 0.6, color: "0.8 0.8 0.8" });
  p.text(M, fy + 14, "Bank details", { size: 7.6, bold: true, color: "0.45 0.45 0.45" });
  p.text(M, fy + 25, d.bank, { size: 8.2 });
  p.text(M, fy + 36, d.iban, { size: 8.2 });
  p.text(M, fy + 52, d.footer, { size: 7.4, color: "0.5 0.5 0.5" });

  return buildPdf(p.build(), `${d.supplier.name} - Order Confirmation ${d.number}`);
}

const BUYER = ["RAPID CONSTRUCT SRL", "Str. Uzinelor 21", "MD-2036 Chisinau", "Republic of Moldova", "VAT: MD1003600045821"];

const doc1 = {
  supplier: {
    name: "ROBEN Klinker GmbH",
    address: ["Klinkerstrasse 4", "26330 Zetel", "Germany"],
    vat: "DE 117 645 302",
    email: "bestellung@roben.de",
    phone: "+49 4452 88-0",
  },
  number: "RK-2026-88134",
  date: "17 August 2026",
  buyer: BUYER,
  shipTo: ["RAPID CONSTRUCT SRL", "Depozit central", "Str. Uzinelor 21", "MD-2036 Chisinau", "Republic of Moldova"],
  buyerRef: "PO-RC-2026-0209",
  paymentTerms: "30 days net",
  incoterms: "DAP Chisinau",
  currency: "EUR",
  dispatch: "26 August 2026",
  carrier: "Raben Logistics",
  vatRate: 0.0,
  lines: [
    { article: "AARHUS-NF", desc: "Klinker facing brick Aarhus, NF format", qty: 180, unit: "m2", price: 49.6 },
    { article: "MELBOURNE-NF", desc: "Klinker facing brick Melbourne, NF format", qty: 140, unit: "m2", price: 52.4 },
    { article: "AARHUS-CORNER", desc: "Klinker corner piece Aarhus", qty: 320, unit: "pcs", price: 2.15 },
    { article: "RB-JOINT-GR", desc: "Klinker jointing mortar, grey", qty: 240, unit: "kg", price: 4.95 },
  ],
  bank: "Commerzbank AG, Oldenburg",
  iban: "IBAN DE44 2804 0046 0312 8877 00   |   BIC COBADEFFXXX",
  footer: "Intra-community supply, reverse charge. Goods remain our property until full payment. This confirmation supersedes all prior quotations.",
};

const doc2 = {
  supplier: {
    name: "BILKA STEEL SRL",
    address: ["Str. Zizinului 119", "500407 Brasov", "Romania"],
    vat: "RO 14458821",
    email: "comenzi@bilka.ro",
    phone: "+40 268 501 234",
  },
  number: "BLK-2026-14507",
  date: "18 August 2026",
  buyer: BUYER,
  shipTo: ["RAPID CONSTRUCT SRL", "Depozit central", "Str. Uzinelor 21", "MD-2036 Chisinau", "Republic of Moldova"],
  buyerRef: "PO-RC-2026-0211",
  paymentTerms: "50% advance, 50% on delivery",
  incoterms: "CPT Chisinau",
  currency: "RON",
  dispatch: "29 August 2026",
  carrier: "Dumagas Transport",
  vatRate: 0.0,
  lines: [
    { article: "BLK-CLASIC-05", desc: "Metal roof tile Clasic 0.5mm, RAL 3005", qty: 850, unit: "m2", price: 44.5 },
    { article: "BLK-VINTAGE-05", desc: "Metal roof tile Vintage 0.5mm, RAL 9005", qty: 470, unit: "m2", price: 50.2 },
    { article: "BLK-RIDGE-190", desc: "Ridge cap 190mm, RAL 3005", qty: 96, unit: "lm", price: 28.9 },
    { article: "BLK-SCREW-48", desc: "Self-drilling screws 4.8x35, painted head", qty: 4200, unit: "pcs", price: 0.42 },
  ],
  bank: "Banca Transilvania, Brasov",
  iban: "IBAN RO49 BTRL 0130 1202 A912 34XX   |   BIC BTRLRO22",
  footer: "Export delivery, VAT exempt under art. 294 Fiscal Code. Claims for visible defects must be raised within 5 working days of receipt.",
};

writeFileSync("public/fixturi/confirmare-comanda-roben-RK-2026-88134.pdf", confirmation(doc1));
writeFileSync("public/fixturi/confirmare-comanda-bilka-BLK-2026-14507.pdf", confirmation(doc2));
console.log("scris: public/fixturi/confirmare-comanda-roben-RK-2026-88134.pdf");
console.log("scris: public/fixturi/confirmare-comanda-bilka-BLK-2026-14507.pdf");
