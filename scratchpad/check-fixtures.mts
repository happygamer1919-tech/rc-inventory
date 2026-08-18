import { FIXTURE_DOCUMENTS } from "../lib/mock/fixtures.ts";
import { PRODUCTS, SUPPLIERS } from "../lib/mock/data.ts";
import { existsSync } from "node:fs";

const pid = new Map(PRODUCTS.map((p) => [p.id, p]));
const sid = new Set(SUPPLIERS.map((s) => s.id));
let bad = 0;
for (const f of FIXTURE_DOCUMENTS) {
  const onDisk = existsSync("public" + f.filePath);
  console.log(`${f.id}: fisier pe disc ${onDisk ? "DA" : "NU"}  furnizor ${sid.has(f.extracted.supplierId) ? "OK" : "LIPSA"}  linii ${f.extracted.lines.length}`);
  if (!onDisk) bad++;
  if (!sid.has(f.extracted.supplierId)) bad++;
  for (const l of f.extracted.lines) {
    const p = pid.get(l.productId);
    if (!p) { console.log(`   LIPSA produs ${l.productId} pentru ${l.supplierArticle}`); bad++; continue; }
    console.log(`   ${l.supplierArticle.padEnd(16)} -> ${p.sku.padEnd(12)} ${l.quantity} ${p.unit}`);
    // furnizorul liniei trebuie sa fie furnizorul documentului
    if (p.supplierId !== f.extracted.supplierId) { console.log(`   NEPOTRIVIRE furnizor pe ${p.sku}`); bad++; }
  }
}
console.log(bad === 0 ? "\nfixturi: OK, 0 probleme" : `\nfixturi: ${bad} PROBLEME`);
