#!/usr/bin/env node
// scripts/guide/seed.mjs
// Card P3-320. Umple stiva LOCALA de test cu datele inventate din
// scripts/guide/fixtures.mjs, ca pozele ghidului sa arate ecrane pline, cu firme,
// oameni si adrese care nu exista.
//
// NUMAI PE STIVA LOCALA. Ruleaza in .github/workflows/guide-screenshots.yml dupa
// scripts/seed-test-accounts.mjs. Refuza orice SUPABASE_URL care nu este localhost
// si ruleaza paza scripts/assert-not-prod.mjs inainte de orice scriere.
//
// CONVENTIA DATELOR DE TEST (scripts/seed-test-accounts.mjs): id-uri FIXE, scriere
// prin upsert, NICIUN DELETE. Facturile si devizele trec prin starile lor in ordinea
// pe care o cer declansatoarele din 0025 si 0063: intai ciorna, apoi liniile, apoi
// starea finala. O factura care nu mai este ciorna nu se rescrie la a doua rulare.
//
// Nicio valoare secreta nu este scrisa in jurnal.

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCOUNT_NAMES,
  ALERTS,
  CLIENTS,
  CONTACTS,
  DEVIZE,
  INBOUND,
  INVOICES,
  ISSUER,
  NOTES,
  OUTBOUND,
  PRODUCTS,
  PROJECTS,
  SUPPLIERS,
  TASKS,
  chisinauDay,
  chisinauMoment,
} from "./fixtures.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function fail(code, message) {
  console.error(`seed-guide: ${message}`);
  process.exit(code);
}

function required(name) {
  const v = process.env[name];
  if (!v || v.trim().length === 0) fail(2, `variabila de mediu ${name} lipseste`);
  return v.trim();
}

const SUPABASE_URL = required("SUPABASE_URL").replace(/\/$/, "");
const SERVICE_ROLE_KEY = required("SUPABASE_SERVICE_ROLE_KEY");

// Paza: numai localhost, apoi paza comuna a suitei.
for (const name of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
  const value = process.env[name];
  if (!value) continue;
  const host = new URL(value).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    fail(2, `${name} arata spre ${host}. Datele inventate se scriu numai pe o stiva locala, niciodata pe productie.`);
  }
}
const guard = spawnSync(process.execPath, [join(ROOT, "scripts/assert-not-prod.mjs")], { stdio: "inherit" });
if (guard.status !== 0) fail(2, "scripts/assert-not-prod.mjs a refuzat");

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

async function rest(method, path, body, prefer) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: prefer ? { ...headers, Prefer: prefer } : headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${method} ${path.split("?")[0]}: ${res.status} ${text}`);
  }
  return res.status === 204 ? null : res.json().catch(() => null);
}

async function upsert(table, rows, label, conflict = "id", resolution = "merge-duplicates") {
  if (rows.length === 0) return;
  try {
    await rest("POST", `${table}?on_conflict=${conflict}`, rows, `resolution=${resolution},return=minimal`);
  } catch (err) {
    fail(3, `nu s-a putut scrie ${label}: ${err.message}`);
  }
  console.log(`seed-guide: ${label}: ${rows.length}`);
}

async function userId(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, { headers });
  if (!res.ok) fail(3, `nu s-au putut citi conturile: ${res.status}`);
  const body = await res.json();
  const users = Array.isArray(body) ? body : (body.users ?? []);
  const id = users.find((u) => u.email === email)?.id;
  if (!id) fail(3, `contul ${email} nu exista. Ruleaza intai scripts/seed-test-accounts.mjs.`);
  return id;
}

const byKey = (rows) => Object.fromEntries(rows.map((r) => [r.key, r]));

async function main() {
  const owner = await userId(required("TEST_OWNER_EMAIL"));
  const manager = await userId(required("TEST_MANAGER_EMAIL"));
  const people = { owner, account_manager: manager };

  // Numele afisate ale conturilor de test, inventate si ele.
  for (const [role, id] of Object.entries(people)) {
    await rest("PATCH", `profiles?id=eq.${id}`, { full_name: ACCOUNT_NAMES[role] }, "return=minimal").catch((err) =>
      fail(3, `profilul ${role}: ${err.message}`),
    );
  }

  // Firma care emite facturile. Randul unic exista din 0063.
  await rest("PATCH", "invoice_settings?id=eq.true", { ...ISSUER, updated_by: owner }, "return=minimal").catch((err) =>
    fail(3, `setarile de facturare: ${err.message}`),
  );

  const categories = await rest("GET", "categories?select=id,name");
  const categoryId = (name) => {
    const hit = categories.find((c) => c.name === name);
    if (!hit) fail(3, `categoria "${name}" nu exista. Migratiile nu au rulat?`);
    return hit.id;
  };

  await upsert(
    "suppliers",
    SUPPLIERS.map((s) => ({ id: s.id, name: s.name, type: "company", phone: s.phone, email: s.email, address: s.address, active: true, created_by: owner })),
    "furnizori",
  );

  const product = byKey(PRODUCTS);
  await upsert(
    "products",
    PRODUCTS.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      category_id: categoryId(p.category),
      unit: p.unit,
      threshold: p.threshold,
      unit_value_mdl: p.value,
      supplier_id: SUPPLIERS[p.supplier].id,
      active: true,
    })),
    "produse",
  );

  // Catalogul de acoperisuri pus de migratia 0049 are aproape 80 de produse fara
  // stoc. Pe copia de test ele ar umple Memento stoc si tabloul de bord si ar
  // impinge marcajele lectiilor afara din poza. Se DEZACTIVEAZA, pe stiva locala si
  // numai aici, nu se sterg: raman vizibile cu filtrul "Active și inactive".
  await rest("PATCH", "products?sku=not.like.TEST-*&active=is.true", { active: false }, "return=minimal").catch((err) =>
    fail(3, `catalogul din migratii: ${err.message}`),
  );
  console.log("seed-guide: produsele din migratii dezactivate pe stiva locala");

  const client = byKey(CLIENTS);
  await upsert(
    "clients",
    CLIENTS.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      stage: c.stage,
      fiscal_code: c.fiscal_code ?? null,
      address: c.address,
      phone: c.phone,
      email: c.email,
      notes: null,
      source: c.source,
      interest: c.interest,
      owner_id: owner,
      follow_up_date: c.follow_up_in_days === undefined ? null : chisinauDay(c.follow_up_in_days),
      next_action: c.next_action ?? null,
      next_action_at: c.next_action_in_days === undefined ? null : chisinauDay(c.next_action_in_days),
      active: true,
      created_by: owner,
    })),
    "clienti si leaduri",
  );

  // Istoricul etapelor, ca fisa leadului sa arate cum a ajuns unde este.
  const lead = client.lead;
  await upsert(
    "status_history",
    [
      { id: "61de0000-0000-4000-8000-000000001031", entity_type: "client", entity_id: lead.id, from_status: null, to_status: "cold", changed_by: owner, created_at: chisinauMoment(-12) },
      { id: "61de0000-0000-4000-8000-000000001032", entity_type: "client", entity_id: lead.id, from_status: "cold", to_status: "follow_up", changed_by: owner, created_at: chisinauMoment(-3) },
    ],
    "istoricul leadului",
    "id",
    "ignore-duplicates",
  );

  await upsert(
    "contacts",
    CONTACTS.map((c) => ({ id: c.id, client_id: client[c.client].id, name: c.name, role: c.role, phone: c.phone, email: c.email, is_primary: c.is_primary, active: true })),
    "persoane de contact",
  );

  await upsert(
    "client_notes",
    NOTES.map((n) => ({ id: n.id, client_id: client[n.client].id, body: n.body, created_by: owner, created_at: chisinauMoment(-n.days, 9) })),
    "note",
  );

  const project = byKey(PROJECTS);
  await upsert(
    "projects",
    PROJECTS.map((p) => ({
      id: p.id,
      client_id: client[p.client].id,
      name: p.name,
      status: p.status,
      address: p.address,
      start_date: chisinauDay(p.start_in_days),
      planned_end_date: chisinauDay(p.end_in_days),
      budget_mdl: p.budget,
      active: true,
      created_by: owner,
    })),
    "proiecte",
  );
  const projectHistory = [];
  PROJECTS.forEach((p, i) => {
    p.history.forEach((h, j) => {
      projectHistory.push({
        id: `61de0000-0000-4000-8000-0000000014${i}${j}`,
        entity_type: "project",
        entity_id: p.id,
        from_status: h.from,
        to_status: h.to,
        changed_by: owner,
        created_at: chisinauMoment(-h.days),
      });
    });
  });
  await upsert("status_history", projectHistory, "istoricul proiectelor", "id", "ignore-duplicates");

  // Comenzile de la furnizori. Linia si lotul au id-uri derivate din comanda.
  const lineId = (orderId, i) => `${orderId.slice(0, 24)}${String(i + 1).padStart(2, "0")}${orderId.slice(26)}`;
  const lotId = (orderId, i) => `${orderId.slice(0, 24)}b${i + 1}${orderId.slice(26)}`;
  await upsert(
    "inbound_orders",
    INBOUND.map((o) => ({
      id: o.id,
      reference: o.reference,
      supplier_name: SUPPLIERS[o.supplier].name,
      currency: "MDL",
      total_mdl: o.lines.reduce((s, [, q, price]) => s + q * price, 0),
      status: o.status,
      ordered_at: chisinauMoment(o.ordered_in_days),
      expected_at: o.expected_in_days === undefined ? null : chisinauMoment(o.expected_in_days),
      arrived_at: o.status === "arrived" ? chisinauMoment(o.arrived_in_days) : null,
      created_by: owner,
    })),
    "comenzi de la furnizori",
  );
  await upsert(
    "order_lines",
    INBOUND.flatMap((o) => o.lines.map(([key, quantity, price], i) => ({ id: lineId(o.id, i), inbound_order_id: o.id, product_id: product[key].id, quantity, unit_price: price }))),
    "liniile comenzilor",
  );
  await upsert(
    "batches",
    INBOUND.filter((o) => o.status === "arrived").flatMap((o) =>
      o.lines.map(([key, quantity], i) => ({ id: lotId(o.id, i), product_id: product[key].id, inbound_order_id: o.id, order_line_id: lineId(o.id, i), quantity, arrived_at: chisinauMoment(o.arrived_in_days) })),
    ),
    "loturi de stoc",
  );

  // Devizele: ciorna, liniile, apoi starea finala (0025 refuza linii pe un deviz care nu este ciorna).
  const devizRows = DEVIZE.map((d) => ({ id: d.id, project_id: project[d.project].id, version: d.version, name: d.name, margin_percent: 0, currency: "MDL", created_by: owner }));
  const existingDevize = await rest("GET", `devize?select=id,status&id=in.(${DEVIZE.map((d) => d.id).join(",")})`);
  const fresh = devizRows.filter((d) => !existingDevize.some((e) => e.id === d.id));
  await upsert("devize", fresh.map((d) => ({ ...d, status: "draft" })), "devize (ciorne)");
  await upsert(
    "deviz_lines",
    DEVIZE.filter((d) => fresh.some((f) => f.id === d.id)).flatMap((d) =>
      d.lines.map(([key, quantity, price], i) => ({ id: lineId(d.id, i), deviz_id: d.id, product_id: product[key].id, quantity, unit_price_mdl: price, sort_order: i + 1 })),
    ),
    "liniile devizelor",
  );
  for (const d of DEVIZE.filter((x) => x.status !== "draft" && fresh.some((f) => f.id === x.id))) {
    await rest("PATCH", `devize?id=eq.${d.id}`, { status: d.status }, "return=minimal").catch((err) => fail(3, `devizul ${d.name}: ${err.message}`));
  }
  console.log("seed-guide: devize in starea finala");

  // Iesirile catre proiect.
  await upsert(
    "outbound_issues",
    OUTBOUND.map((o) => ({
      id: o.id,
      reference: o.reference,
      issue_mode: "project",
      project_id: project[o.project].id,
      status: o.status,
      issued_at: chisinauMoment(o.issued_in_days, 7),
      shipped_at: o.status === "shipped" ? chisinauMoment(o.shipped_in_days, 12) : null,
      created_by: owner,
    })),
    "iesiri",
  );
  await upsert(
    "outbound_lines",
    OUTBOUND.flatMap((o) => o.lines.map(([key, quantity, price], i) => ({ id: lineId(o.id, i), outbound_issue_id: o.id, product_id: product[key].id, quantity, sale_price_mdl: price }))),
    "liniile iesirilor",
  );

  // Alertele de stoc trimise. Un rand pe produs, deci cheia este product_id.
  await upsert(
    "reminders",
    ALERTS.map((a) => ({
      product_id: product[a.product].id,
      email_enabled: true,
      is_armed: false,
      last_fired_at: chisinauMoment(-a.days, 6),
      last_stock_at_fire: a.stock,
      last_threshold_at_fire: a.threshold,
      last_send_error: a.error,
    })),
    "alerte de stoc",
    "product_id",
  );

  await upsert(
    "tasks",
    TASKS.map((t) => {
      const [entityType, entityKey] = t.entity;
      const entityId = entityType === "client" ? client[entityKey].id : project[entityKey].id;
      return {
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        due_date: chisinauDay(t.due_in_days),
        assignee_id: people[t.assignee],
        entity_type: entityType,
        entity_id: entityId,
        created_by: owner,
      };
    }),
    "sarcini",
  );

  // Facturile. Una noua intra ca ciorna, cu liniile; cele emise trec apoi in
  // emisa si, una, in platita. O factura existenta nu se rescrie.
  const existingInvoices = await rest("GET", `invoices?select=id,status&id=in.(${INVOICES.map((f) => f.id).join(",")})`);
  const counters = new Map();
  for (const inv of INVOICES) {
    const issueDay = inv.issue_in_days === undefined ? null : chisinauDay(inv.issue_in_days);
    const series = issueDay ? `RC-${issueDay.slice(0, 4)}` : null;
    if (series) counters.set(series, Math.max(counters.get(series) ?? 1, inv.number + 1));
    if (existingInvoices.some((e) => e.id === inv.id)) continue;
    await rest(
      "POST",
      "invoices",
      [{ id: inv.id, client_id: client[inv.client].id, project_id: inv.project ? project[inv.project].id : null, status: "draft", currency: "MDL", due_date: chisinauDay(inv.due_in_days), created_by: owner }],
      "return=minimal",
    ).catch((err) => fail(3, `factura ${inv.key}: ${err.message}`));
    await rest(
      "POST",
      "invoice_lines",
      inv.lines.map(([key, quantity, price, description], i) => ({
        id: lineId(inv.id, i),
        invoice_id: inv.id,
        product_id: key ? product[key].id : null,
        description: description ?? null,
        quantity,
        unit: key ? product[key].unit : "pcs",
        unit_price_mdl: price,
        vat_rate: 20,
        sort_order: i + 1,
      })),
      "return=minimal",
    ).catch((err) => fail(3, `liniile facturii ${inv.key}: ${err.message}`));
    if (inv.status === "draft") continue;
    await rest(
      "PATCH",
      `invoices?id=eq.${inv.id}`,
      { status: "issued", series, number: inv.number, issue_date: issueDay, due_date: chisinauDay(inv.due_in_days), issued_at: chisinauMoment(inv.issue_in_days, 9), issued_by: owner },
      "return=minimal",
    ).catch((err) => fail(3, `emiterea facturii ${inv.key}: ${err.message}`));
    if (inv.status === "paid") {
      await rest("PATCH", `invoices?id=eq.${inv.id}`, { status: "paid", paid_at: `${chisinauDay(inv.paid_in_days)}T12:00:00Z`, paid_by: owner }, "return=minimal").catch((err) =>
        fail(3, `plata facturii ${inv.key}: ${err.message}`),
      );
    }
  }
  console.log(`seed-guide: facturi: ${INVOICES.length}`);
  // Contorul seriei merge mai departe de numerele folosite aici, ca o factura emisa
  // din ecran sa nu ia un numar deja dat.
  await upsert(
    "invoice_number_series",
    [...counters].map(([series, next]) => ({ series, next_number: next })),
    "contorul seriei de facturi",
    "series",
  );

  console.log("seed-guide: gata. Toate datele sunt inventate.");
}

main().catch((err) => fail(1, err?.message ?? String(err)));
