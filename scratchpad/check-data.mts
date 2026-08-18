// Verificare rapida a datelor RC-02. Importa data.ts direct, cu extensie,
// pentru ca stripping-ul de tipuri din Node nu rezolva importuri fara extensie.
import { PRODUCTS, SUPPLIERS, BATCHES, MOVEMENTS, FIRED_ALERTS, INBOUND_ORDERS, OUTBOUND_ISSUES } from "../lib/mock/data.ts";

const val = PRODUCTS.reduce((s, p) => s + p.stock * p.unitValueMdl, 0);
const low = PRODUCTS.filter((p) => p.stock <= p.threshold);
const out = PRODUCTS.filter((p) => p.stock === 0);

console.log("produse             :", PRODUCTS.length);
console.log("furnizori           :", SUPPLIERS.length);
console.log("categorii           :", [...new Set(PRODUCTS.map((p) => p.category))].length);
console.log("unitati distincte   :", [...new Set(PRODUCTS.map((p) => p.unit))].sort().join(", "));
console.log("valoare stoc total  :", new Intl.NumberFormat("ro-MD", { maximumFractionDigits: 0 }).format(val), "MDL");
console.log("stoc redus          :", low.length, "->", low.map((p) => p.sku).join(", "));
console.log("epuizate            :", out.length, "->", out.map((p) => p.sku).join(", "));
console.log("intrari in astept.  :", INBOUND_ORDERS.filter((o) => o.status === "În așteptare").length);
console.log("intrari receptionate:", INBOUND_ORDERS.filter((o) => o.status === "Recepționată").length);
console.log("iesiri in astept.   :", OUTBOUND_ISSUES.filter((o) => o.status === "În așteptare expediere").length);
console.log("iesiri expediate    :", OUTBOUND_ISSUES.filter((o) => o.status === "Expediată").length);
console.log("loturi              :", BATCHES.length);
console.log("miscari             :", MOVEMENTS.length);
console.log("alerte declansate   :", FIRED_ALERTS.length);

// Integritate referentiala: fiecare id trebuie sa existe.
const pid = new Set(PRODUCTS.map((p) => p.id));
const sid = new Set(SUPPLIERS.map((s) => s.id));
const oid = new Set(INBOUND_ORDERS.map((o) => o.id));
const bad: string[] = [];
for (const p of PRODUCTS) if (!sid.has(p.supplierId)) bad.push(`produs ${p.sku} -> furnizor lipsa ${p.supplierId}`);
for (const o of INBOUND_ORDERS) {
  if (!sid.has(o.supplierId)) bad.push(`intrare ${o.reference} -> furnizor lipsa`);
  for (const l of o.lines) if (!pid.has(l.productId)) bad.push(`intrare ${o.reference} -> produs lipsa ${l.productId}`);
}
for (const o of OUTBOUND_ISSUES) for (const l of o.lines) if (!pid.has(l.productId)) bad.push(`iesire ${o.reference} -> produs lipsa ${l.productId}`);
for (const b of BATCHES) {
  if (!pid.has(b.productId)) bad.push(`lot ${b.id} -> produs lipsa`);
  if (!oid.has(b.inboundOrderId)) bad.push(`lot ${b.id} -> comanda lipsa`);
}
for (const m of MOVEMENTS) if (!pid.has(m.productId)) bad.push(`miscare ${m.id} -> produs lipsa`);
for (const a of FIRED_ALERTS) if (!pid.has(a.productId)) bad.push(`alerta ${a.id} -> produs lipsa`);

// Fiecare comanda receptionata trebuie sa aiba lot pentru fiecare linie.
for (const o of INBOUND_ORDERS.filter((x) => x.status === "Recepționată")) {
  for (const l of o.lines) {
    if (!BATCHES.some((b) => b.inboundOrderId === o.id && b.productId === l.productId)) {
      bad.push(`comanda receptionata ${o.reference} nu are lot pentru ${l.productId}`);
    }
  }
}
// Nicio comanda in asteptare nu are voie sa aiba lot: lotul se creeaza la receptie.
for (const b of BATCHES) {
  const o = INBOUND_ORDERS.find((x) => x.id === b.inboundOrderId);
  if (o && o.status !== "Recepționată") bad.push(`lot ${b.id} atasat unei comenzi neReceptionate`);
}
// Fiecare alerta declansata trebuie sa priveasca un produs care chiar era sub prag.
for (const a of FIRED_ALERTS) if (a.stockAtFire > a.thresholdAtFire) bad.push(`alerta ${a.id} declansata peste prag`);

console.log("\nintegritate         :", bad.length === 0 ? "OK, 0 probleme" : `${bad.length} PROBLEME`);
for (const b of bad) console.log("   -", b);
