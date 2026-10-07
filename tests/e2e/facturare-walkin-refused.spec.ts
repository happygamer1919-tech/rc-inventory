import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { saveUnlessNeverInvoiceable } from "@/lib/data/facturare-issue-gate";
import {
  DIRECT_CLIENT_NOT_INVOICEABLE,
  type IssueInvoiceability,
} from "@/lib/data/facturare-create-types";
import { ownerAccount, type TestAccount } from "./support/accounts";

// facturare-walkin-refused.spec - linia de acceptanta a cardului P3-171.
//
// O VANZARE DIRECTA NU SE FACTUREAZA NICIODATA, hotararea R-215. Pana la acest card
// regula statea numai in citirea care ascunde butonul. Aici se dovedeste pe cele doua
// niveluri care scriu:
//
//   SERVERUL. Primele doua cazuri sunt pure: nu ating nici browserul, nici baza. Ele
//   dau portii lui saveInvoiceDraft o citire si o salvare inlocuite, ca sa se vada ca
//   salvarea NU este chemata pentru o vanzare directa si este chemata pentru o Iesire
//   pe proiect.
//
//   BAZA. Ultimele doua cheama public.save_invoice_draft direct, prin PostgREST, cu
//   jetonul unui cont adevarat, adica exact cererea construita de mana pe care o
//   descrie defectul. Au nevoie de stiva locala Supabase, deci ruleaza numai in CI.
//
// DATELE DE TEST NU SE STERG NICIODATA, conventia P2-07. Iesirile si clientii creati
// aici rama pe loc, cu prefixul TEST.

/* ------------------------------------------------------ serverul, pur -- */

function answer(over: Partial<IssueInvoiceability>): IssueInvoiceability {
  return { canInvoice: true, reason: null, existingInvoice: null, neverInvoiceable: false, ...over };
}

test("iesire directa: salvarea ciornei refuza cu propozitia romaneasca si nu cheama RPC-ul", async () => {
  const asked: string[] = [];
  let saves = 0;
  const result = await saveUnlessNeverInvoiceable(
    "11111111-1111-4111-8111-111111111111",
    async (id) => {
      asked.push(id);
      return answer({ canInvoice: false, reason: DIRECT_CLIENT_NOT_INVOICEABLE, neverInvoiceable: true });
    },
    async () => {
      saves += 1;
      return "nu trebuia chemat";
    },
  );

  expect(result).toEqual({ refused: DIRECT_CLIENT_NOT_INVOICEABLE });
  expect(saves, "RPC-ul nu este chemat pentru o vanzare directa").toBe(0);
  expect(asked, "citirea este intrebata despre chiar Iesirea trimisa").toEqual([
    "11111111-1111-4111-8111-111111111111",
  ]);

  // POARTA ESTE CHIAR CEA FOLOSITA DE saveInvoiceDraft, cu citirea
  // getIssueInvoiceability si nu cu o copie a regulii.
  const source = readFileSync("lib/data/facturare-actions.ts", "utf8");
  expect(source).toMatch(/saveUnlessNeverInvoiceable\(\s*outboundIssueId === "" \? null : outboundIssueId,\s*getIssueInvoiceability,/);
});

test("iesire pe proiect: salvarea ciornei ajunge la RPC ca inainte", async () => {
  let saves = 0;
  const onProject = await saveUnlessNeverInvoiceable(
    "22222222-2222-4222-8222-222222222222",
    async () => answer({}),
    async () => {
      saves += 1;
      return { data: "id-ul ciornei", error: null };
    },
  );
  expect(onProject).toEqual({ saved: { data: "id-ul ciornei", error: null } });

  // CELELALTE REFUZURI ALE CITIRII SUNT PENTRU BUTON SI NU OPRESC SALVAREA: o Iesire
  // pe proiect care are deja o factura ajunge la RPC, iar indexul din 0064 raspunde.
  const withInvoice = await saveUnlessNeverInvoiceable(
    "33333333-3333-4333-8333-333333333333",
    async () => answer({ canInvoice: false, reason: "Există deja o factură pentru această ieșire." }),
    async () => {
      saves += 1;
      return "salvat";
    },
  );
  expect(withInvoice).toEqual({ saved: "salvat" });

  // O factura fara Iesire nu intreaba nimic.
  let reads = 0;
  const noIssue = await saveUnlessNeverInvoiceable(
    null,
    async () => {
      reads += 1;
      return null;
    },
    async () => {
      saves += 1;
      return "salvat";
    },
  );
  expect(noIssue).toEqual({ saved: "salvat" });
  expect(reads, "fara Iesire nu se citeste nicio Iesire").toBe(0);
  expect(saves, "toate cele trei salvari au ajuns la RPC").toBe(3);
});

/* ------------------------------------------------------------- baza -- */

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "facturare-walkin-refused.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY si " +
        "SUPABASE_SERVICE_ROLE_KEY. In CI sunt exportate de pasul 'Export local Supabase credentials'.",
    );
  }
  return { origin: new URL(url).origin, anon, service };
}

type Rest = { status: number; ok: boolean; rows: Record<string, unknown>[]; text: string };

async function rest(path: string, headers: Record<string, string>, method = "GET", body?: unknown): Promise<Rest> {
  const response = await fetch(`${env().origin}/rest/v1/${path}`, {
    method,
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text().catch(() => "");
  let rows: Record<string, unknown>[] = [];
  try {
    const parsed = JSON.parse(text);
    rows = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    rows = [];
  }
  return { status: response.status, ok: response.ok, rows, text };
}

function asService(path: string, method = "GET", body?: unknown): Promise<Rest> {
  const { service } = env();
  return rest(path, { apikey: service, Authorization: `Bearer ${service}` }, method, body);
}

function asUser(token: string, path: string, method = "GET", body?: unknown): Promise<Rest> {
  return rest(path, { apikey: env().anon, Authorization: `Bearer ${token}` }, method, body);
}

async function accessToken(account: TestAccount): Promise<string> {
  const { origin, anon } = env();
  const response = await fetch(`${origin}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string };
  if (!response.ok || !body.access_token) throw new Error(`autentificarea API a raspuns ${response.status}`);
  return body.access_token;
}

async function newClient(token: string, label: string): Promise<string> {
  const created = await asUser(token, "clients?select=id", "POST", { name: `TEST P3-171 ${label} ${RUN}` });
  expect(created.ok, `clientul de test nu a putut fi creat: ${created.text}`).toBe(true);
  return String(created.rows[0]!.id);
}

/** Iesiri scrise direct, cu cheia service_role: ce se probeaza este partea facturii,
 *  iar public.save_invoice_draft nu citeste niciodata pozitiile unei Iesiri. */
async function newIssue(body: Record<string, unknown>, label: string): Promise<string> {
  const created = await asService("outbound_issues?select=id", "POST", {
    reference: `IES-TEST-P3-171-${RUN}-${label}-${randomUUID().slice(0, 8)}`,
    ...body,
  });
  expect(created.ok, `iesirea de test nu a putut fi creata: ${created.text}`).toBe(true);
  return String(created.rows[0]!.id);
}

/** public.save_invoice_draft, chemata exact cum o cheama saveInvoiceDraft. */
function saveDraft(token: string, body: Record<string, unknown>): Promise<Rest> {
  return asUser(token, "rpc/save_invoice_draft", "POST", {
    p_lines: [
      { id: "", product_id: null, description: "Linie de test P3-171", unit: "pcs", quantity: 1, unit_price_mdl: 10, vat_rate: 20 },
    ],
    p_invoice_id: null,
    p_project_id: null,
    p_outbound_issue_id: null,
    p_due_date: null,
    p_notes: null,
    ...body,
  });
}

async function invoicesWhere(token: string, filter: string): Promise<Record<string, unknown>[]> {
  const got = await asUser(token, `invoices?select=id,status,outbound_issue_id&${filter}`);
  expect(got.ok, `facturile nu au putut fi citite: ${got.text}`).toBe(true);
  return got.rows;
}

test.describe("P3-171, baza: save_invoice_draft si vanzarea directa", () => {
  test.describe.configure({ timeout: 120_000 });

  test("baza: save_invoice_draft refuza o iesire directa si nu scrie nicio factura", async () => {
    const token = await accessToken(ownerAccount());
    const client = await newClient(token, "ghiseu");
    const walkin = await newIssue(
      { issue_mode: "direct_client", client_id: client, pickup_date: "2026-10-05" },
      "W",
    );

    const saved = await saveDraft(token, { p_client_id: client, p_outbound_issue_id: walkin });
    expect(saved.ok, `o vanzare directa a primit o ciorna: ${saved.text}`).toBe(false);
    expect(saved.text, "eroarea poarta codul si cuvantul pe care le citeste refusal()").toContain("P0001");
    expect(saved.text).toContain("direct_client");

    expect(await invoicesWhere(token, `outbound_issue_id=eq.${walkin}`), "nicio factura pe vanzarea directa").toHaveLength(0);
    expect(await invoicesWhere(token, `client_id=eq.${client}`), "nicio factura pentru clientul ei").toHaveLength(0);
  });

  test("baza: save_invoice_draft scrie in continuare ciorna unei iesiri pe proiect", async () => {
    const token = await accessToken(ownerAccount());
    const client = await newClient(token, "proiect");
    const project = await asUser(token, "projects?select=id", "POST", {
      client_id: client,
      name: `TEST Șantier P3-171 ${RUN}`,
    });
    expect(project.ok, `proiectul de test nu a putut fi creat: ${project.text}`).toBe(true);
    const projectId = String(project.rows[0]!.id);
    const issue = await newIssue({ project_id: projectId }, "P");

    const saved = await saveDraft(token, {
      p_client_id: client,
      p_project_id: projectId,
      p_outbound_issue_id: issue,
    });
    expect(saved.ok, `ciorna unei iesiri pe proiect a fost refuzata: ${saved.text}`).toBe(true);

    const rows = await invoicesWhere(token, `outbound_issue_id=eq.${issue}`);
    expect(rows, "exact o ciorna pe iesirea pe proiect").toHaveLength(1);
    expect(rows[0]!.status).toBe("draft");
  });
});
