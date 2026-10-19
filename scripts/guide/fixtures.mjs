// scripts/guide/fixtures.mjs
// Card P3-320. DATELE INVENTATE din care se fac pozele ghidului.
//
// Totul de aici este inventat: firmele, oamenii, adresele, telefoanele si
// emailurile. Nimic nu este copiat din productie si nimic nu se citeste de acolo.
// npm run check:guide-privacy citeste fisierul acesta si pica daca:
//   - un nume de pe lista docs/guide/real-names.txt apare in el,
//   - un telefon nu are forma +373 00 000 NNN (prefixul 00 nu este al niciunui
//     operator din Moldova, deci numarul nu poate suna la nimeni),
//   - un email nu se termina in .example (domeniu rezervat, RFC 2606).
//
// CONVENTIA DATELOR DE TEST din scripts/seed-test-accounts.mjs, la litera:
// numele firmelor, proiectelor si produselor incep cu TEST, id-urile sunt FIXE,
// iar scripts/guide/seed.mjs nu sterge nimic.
//
// Datele calendaristice sunt relative la ziua in care ruleaza seed-ul (ziua de la
// Chisinau), ca ecranul Azi si scadentele sa arate la fel la fiecare rulare.

/** Id fix si recognoscibil: 61de... ("guide"), apoi numarul randului. */
function gid(n) {
  return `61de0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

// ---------------------------------------------------------------------------
// Firma care emite facturile (Setari, Date firma).
// ---------------------------------------------------------------------------
export const ISSUER = {
  issuer_name: "TEST Firma Exemplu SRL",
  issuer_fiscal_code: "1000000000000",
  issuer_address: "str. Exemplului 1, Chișinău",
  issuer_bank: "TEST Banca Exemplu",
  issuer_iban: "MD00TE000000000000000000",
  issuer_vat_code: "0000000",
  issuer_phone: "+373 00 000 100",
  issuer_email: "contact@firma-exemplu.example",
};

// Numele afisate ale celor doua conturi de test (seed-test-accounts.mjs le creeaza).
export const ACCOUNT_NAMES = {
  owner: "Maria Exemplu",
  account_manager: "Victor Exemplu",
};

// ---------------------------------------------------------------------------
// Furnizori si produse. Stocul iese din loturi minus iesiri, ca in aplicatie.
// ---------------------------------------------------------------------------
export const SUPPLIERS = [
  { id: gid(201), name: "TEST Furnizor Exemplu SRL", phone: "+373 00 000 201", email: "vanzari@furnizor-exemplu.example", address: "str. Depozitelor 5, Chișinău" },
  { id: gid(202), name: "TEST Depozit Model SRL", phone: "+373 00 000 202", email: "comenzi@depozit-model.example", address: "str. Industrială 9, Bălți" },
];

// stock = loturi - iesiri. Pragurile sunt alese ca Memento stoc sa arate cele trei
// stari: Suficient, Sub prag si Epuizat.
export const PRODUCTS = [
  { key: "tigla", id: gid(301), sku: "TEST-GH-01", name: "TEST Țiglă metalică Model", category: "Acoperișuri și tablă", unit: "m2", threshold: 50, value: 145, supplier: 0 },
  { key: "profil", id: gid(302), sku: "TEST-GH-02", name: "TEST Profil gips-carton CW 50", category: "Gips-carton și profile", unit: "pcs", threshold: 40, value: 38, supplier: 1 },
  { key: "ciment", id: gid(303), sku: "TEST-GH-03", name: "TEST Ciment Exemplu 40 kg", category: "Cimenturi și mortare", unit: "bag", threshold: 30, value: 95, supplier: 1 },
  { key: "membrana", id: gid(304), sku: "TEST-GH-04", name: "TEST Membrană hidroizolantă", category: "Hidroizolații", unit: "roll", threshold: 5, value: 620, supplier: 0 },
  { key: "vata", id: gid(305), sku: "TEST-GH-05", name: "TEST Vată minerală 100 mm", category: "Izolații termice", unit: "m2", threshold: 60, value: 52, supplier: 0 },
  { key: "surub", id: gid(306), sku: "TEST-GH-06", name: "TEST Șurub autoforant 4,8x35", category: "Feronerie și fixări", unit: "pcs", threshold: 500, value: 1.2, supplier: 1 },
];

// ---------------------------------------------------------------------------
// Clienti si leaduri. Un lead este un client cu etapa diferita de "client".
// ---------------------------------------------------------------------------
export const CLIENTS = [
  {
    key: "client",
    id: gid(101),
    name: "TEST Acoperișuri Exemplu SRL",
    type: "company",
    stage: "client",
    fiscal_code: "1000000000101",
    address: "str. Exemplului 12, Chișinău",
    phone: "+373 00 000 101",
    email: "office@acoperisuri-exemplu.example",
    source: "recomandare",
    interest: "Acoperișuri pentru blocuri de locuit",
  },
  {
    key: "client2",
    id: gid(102),
    name: "TEST Construcții Model SRL",
    type: "company",
    stage: "client",
    fiscal_code: "1000000000102",
    address: "bd. Modelului 40, Chișinău",
    phone: "+373 00 000 104",
    email: "birou@constructii-model.example",
    source: "site",
    interest: "Hale și depozite",
  },
  {
    key: "lead",
    id: gid(103),
    name: "TEST Ion Exemplu",
    type: "individual",
    stage: "follow_up",
    follow_up_in_days: -1,
    next_action: "Sună pentru măsurători",
    next_action_in_days: 0,
    address: "str. Livezilor 3, Ialoveni",
    phone: "+373 00 000 105",
    email: "ion@exemplu.example",
    source: "telefon",
    interest: "Acoperiș din țiglă metalică, 140 mp",
  },
  {
    key: "lead_quoted",
    id: gid(104),
    name: "TEST Pensiunea Exemplu",
    type: "company",
    stage: "quoted",
    next_action: "Revine cu răspuns la ofertă",
    next_action_in_days: 0,
    address: "str. Pădurii 8, Codru",
    phone: "+373 00 000 106",
    email: "rezervari@pensiunea-exemplu.example",
    source: "vizita",
    interest: "Izolație și hidroizolație pentru terasă",
  },
  {
    key: "lead_nurture",
    id: gid(105),
    name: "TEST Elena Model",
    type: "individual",
    stage: "nurture",
    next_action: "Trimite catalogul de țiglă",
    next_action_in_days: 7,
    address: "str. Teilor 21, Stăuceni",
    phone: "+373 00 000 107",
    email: "elena@model.example",
    source: "site",
    interest: "Mansardă, vată minerală 80 mp",
  },
  {
    key: "lead_nurture2",
    id: gid(106),
    name: "TEST Grădinița Exemplu",
    type: "company",
    stage: "nurture",
    next_action: "Verifică bugetul pe anul viitor",
    next_action_in_days: 21,
    address: "str. Copiilor 2, Orhei",
    phone: "+373 00 000 108",
    email: "director@gradinita-exemplu.example",
    source: "recomandare",
    interest: "Renovare acoperiș",
  },
  {
    key: "lead_cold",
    id: gid(107),
    name: "TEST Vasile Demo",
    type: "individual",
    stage: "cold",
    address: "str. Viilor 14, Cricova",
    phone: "+373 00 000 109",
    email: "vasile@demo.example",
    source: "altul",
    interest: "Gard și porți",
  },
];

export const CONTACTS = [
  { id: gid(111), client: "client", name: "Ana Model", role: "Director", phone: "+373 00 000 102", email: "ana@acoperisuri-exemplu.example", is_primary: true },
  { id: gid(112), client: "client", name: "Ion Demo", role: "Șef de șantier", phone: "+373 00 000 103", email: "santier@acoperisuri-exemplu.example", is_primary: false },
  { id: gid(113), client: "client2", name: "Dan Exemplu", role: "Achiziții", phone: "+373 00 000 110", email: "achizitii@constructii-model.example", is_primary: true },
];

// Notele clientului: cele mai noi primele pe ecran. `days` = cu cate zile in urma.
export const NOTES = [
  { id: gid(121), client: "client", days: 9, body: "Întâlnire pe șantier. Acoperișul are 240 mp, panta 30 de grade." },
  { id: gid(122), client: "client", days: 4, body: "Oferta trimisă pe email. Așteptăm confirmarea până vineri." },
  { id: gid(123), client: "lead_quoted", days: 6, body: "A cerut oferta pentru terasă și hidroizolație." },
];

// ---------------------------------------------------------------------------
// Proiecte, devize, intrari si iesiri.
// ---------------------------------------------------------------------------
export const PROJECTS = [
  {
    key: "project",
    id: gid(401),
    client: "client",
    name: "TEST Acoperiș bloc str. Exemplului",
    status: "active",
    address: "str. Exemplului 12, Chișinău",
    start_in_days: -30,
    end_in_days: 30,
    budget: 180000,
    // Drumul pana la starea de acum, pentru fila Istoric.
    history: [
      { days: 40, from: null, to: "lead" },
      { days: 35, from: "lead", to: "offer" },
      { days: 32, from: "offer", to: "contract" },
      { days: 30, from: "contract", to: "active" },
    ],
  },
  {
    key: "project_offer",
    id: gid(402),
    client: "client2",
    name: "TEST Mansardă casa Model",
    status: "offer",
    address: "str. Teilor 21, Stăuceni",
    start_in_days: 14,
    end_in_days: 45,
    budget: 65000,
    history: [
      { days: 10, from: null, to: "lead" },
      { days: 3, from: "lead", to: "offer" },
    ],
  },
  {
    key: "project_contract",
    id: gid(403),
    client: "client2",
    name: "TEST Hală depozit Exemplu",
    status: "contract",
    address: "str. Industrială 9, Bălți",
    start_in_days: 7,
    end_in_days: 90,
    budget: 420000,
    history: [{ days: 5, from: "offer", to: "contract" }],
  },
  {
    key: "project_lead",
    id: gid(404),
    client: "lead_quoted",
    name: "TEST Terasă Pensiunea Exemplu",
    status: "lead",
    address: "str. Pădurii 8, Codru",
    start_in_days: 30,
    end_in_days: 60,
    budget: 40000,
    history: [{ days: 6, from: null, to: "lead" }],
  },
  {
    key: "project_offer2",
    id: gid(405),
    client: "client",
    name: "TEST Garaj Exemplu",
    status: "offer",
    address: "str. Exemplului 14, Chișinău",
    start_in_days: 20,
    end_in_days: 35,
    budget: 15000,
    history: [{ days: 2, from: "lead", to: "offer" }],
  },
];

// Un deviz pe rand. `status` este starea finala, dupa ce liniile au intrat.
export const DEVIZE = [
  { id: gid(501), project: "project", version: 1, status: "accepted", name: "Deviz acoperiș", lines: [["tigla", 160, 160], ["membrana", 4, 680], ["vata", 300, 60]] },
  { id: gid(502), project: "project_offer", version: 1, status: "draft", name: "Deviz mansardă", lines: [["vata", 80, 58], ["profil", 60, 42]] },
  { id: gid(503), project: "project_contract", version: 1, status: "accepted", name: "Deviz hală", lines: [["ciment", 80, 95], ["profil", 100, 38]] },
  { id: gid(504), project: "project_lead", version: 1, status: "accepted", name: "Deviz terasă", lines: [["surub", 1000, 1.5], ["membrana", 6, 680]] },
  { id: gid(505), project: "project_offer2", version: 1, status: "accepted", name: "Deviz garaj", lines: [["membrana", 10, 680]] },
];

// Comenzi de la furnizori. Cea sosita face loturile (stocul); cea in asteptare
// este cea pe care o arata lectia despre receptie.
export const INBOUND = [
  {
    key: "inbound_arrived",
    id: gid(601),
    reference: "TEST-IN-0101",
    supplier: 0,
    status: "arrived",
    ordered_in_days: -14,
    arrived_in_days: -10,
    lines: [["tigla", 150, 130], ["profil", 25, 32], ["membrana", 20, 580], ["vata", 240, 45], ["surub", 2700, 1]],
  },
  {
    key: "inbound_pending",
    id: gid(602),
    reference: "TEST-IN-0102",
    supplier: 1,
    status: "pending_arrival",
    ordered_in_days: -2,
    expected_in_days: 3,
    lines: [["ciment", 100, 88], ["profil", 60, 32]],
  },
];

// Iesiri catre proiect. Cea in asteptare este si sursa facturii din iesire.
export const OUTBOUND = [
  { key: "outbound_shipped", id: gid(701), reference: "TEST-BON-0101", project: "project", status: "shipped", issued_in_days: -6, shipped_in_days: -5, lines: [["tigla", 30, 160], ["membrana", 2, 680]] },
  { key: "outbound_pending", id: gid(702), reference: "TEST-BON-0102", project: "project", status: "awaiting_shipment", issued_in_days: -1, lines: [["vata", 40, 60], ["surub", 300, 1.5]] },
];

// Alertele de stoc trimise (Memento stoc, tabelul de jos): una trimisa, una nu.
export const ALERTS = [
  { product: "profil", days: 1, stock: 25, threshold: 40, error: null },
  { product: "ciment", days: 3, stock: 0, threshold: 30, error: "Adresa de email pentru alerte nu este setată." },
];

// ---------------------------------------------------------------------------
// Sarcini.
// ---------------------------------------------------------------------------
export const TASKS = [
  { key: "task", id: gid(801), title: "Trimite oferta revizuită", status: "todo", priority: "high", due_in_days: 0, assignee: "owner", entity: ["client", "client"], description: "Oferta cu țiglă metalică și membrană, varianta a doua." },
  { key: "task2", id: gid(802), title: "Verifică livrarea de țiglă", status: "in_progress", priority: "medium", due_in_days: 1, assignee: "account_manager", entity: ["project", "project"], description: null },
  { key: "task3", id: gid(803), title: "Măsurători la mansardă", status: "todo", priority: "low", due_in_days: 3, assignee: "owner", entity: ["client", "lead"], description: null },
];

// ---------------------------------------------------------------------------
// Facturi. Ciorna ramane ciorna; celelalte doua sunt emise (si una platita)
// direct in tabel, ca numerotarea sa nu depinda de un cont semnat.
// ---------------------------------------------------------------------------
export const INVOICES = [
  { key: "invoice_draft", id: gid(901), client: "client", project: "project", status: "draft", due_in_days: 30, lines: [["tigla", 20, 160, null], [null, 1, 350, "Transport material"]] },
  { key: "invoice_issued", id: gid(902), client: "client2", project: "project_contract", status: "issued", number: 1, issue_in_days: -5, due_in_days: 25, lines: [["ciment", 40, 110, null], ["profil", 50, 45, null]] },
  { key: "invoice_paid", id: gid(903), client: "client", project: "project", status: "paid", number: 2, issue_in_days: -20, due_in_days: -5, paid_in_days: -8, lines: [["tigla", 30, 160, null], ["membrana", 2, 680, null]] },
];

// ---------------------------------------------------------------------------
// Cheile din acolade pe care le poate folosi `screen` intr-o lectie.
// Testul tests/e2e/guide-screenshots.spec.ts cere aceeasi lista ca
// SHOT_PLACEHOLDERS din lib/guide/source.mjs.
// ---------------------------------------------------------------------------
const byKey = (rows, key) => rows.find((r) => r.key === key).id;

export const PLACEHOLDER_IDS = {
  client: byKey(CLIENTS, "client"),
  lead: byKey(CLIENTS, "lead"),
  project: byKey(PROJECTS, "project"),
  project_offer: byKey(PROJECTS, "project_offer"),
  product: byKey(PRODUCTS, "tigla"),
  product_sku: PRODUCTS.find((p) => p.key === "tigla").sku,
  invoice_draft: byKey(INVOICES, "invoice_draft"),
  invoice_issued: byKey(INVOICES, "invoice_issued"),
  invoice_paid: byKey(INVOICES, "invoice_paid"),
  inbound_pending: byKey(INBOUND, "inbound_pending"),
  outbound_pending: byKey(OUTBOUND, "outbound_pending"),
  task: byKey(TASKS, "task"),
};

/** /clienti/{client} -> /clienti/<id inventat>. Acelasi lucru in selectori si in textul tastat. */
export function resolvePlaceholders(text, ids = PLACEHOLDER_IDS) {
  return String(text).replace(/\{([a-z_]+)\}/g, (_, key) => {
    if (!ids[key]) throw new Error(`nu am id pentru {${key}}`);
    return ids[key];
  });
}

/** Ziua de la Chisinau, deplasata cu `offset` zile, ca YYYY-MM-DD. */
export function chisinauDay(offset = 0, now = new Date()) {
  const d = new Date(now.getTime() + offset * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Chisinau", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Un moment din ziua de la Chisinau deplasata cu `offset` zile, la ora data (UTC). */
export function chisinauMoment(offset = 0, hourUtc = 8, now = new Date()) {
  return `${chisinauDay(offset, now)}T${String(hourUtc).padStart(2, "0")}:00:00Z`;
}
