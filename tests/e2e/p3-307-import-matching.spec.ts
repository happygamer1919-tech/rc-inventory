// P3-307. Importurile potrivesc clientul existent corect: clientii activi castiga, un email
// nu ascunde o potrivire nume + telefon, iar fisierele mari sunt cinstite.
//
// Primele cazuri sunt functii pure, fara browser si fara baza. Ultimul trece prin ecran si
// prin baza (numai in CI). CLIENTII DE TEST SE DEZACTIVEAZA, NU SE STERG.
import { expect, request, test, type APIRequestContext } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import {
  buildClientPlan,
  duplicateReason as clientDuplicateReason,
  type ExistingClient as StoredClient,
} from "@/lib/data/client-import-plan";
import { clientImportInstructions } from "@/lib/data/client-import-types";
import {
  IMPORT_ANCHOR_BYTES,
  IMPORT_ANCHORS_CAPPED,
  addAnchors,
  type FileAnchor,
} from "@/lib/data/import-file-anchors";
import {
  IMPORT_BATCH_BYTES,
  IMPORT_BATCH_SIZE,
  mergePlans,
  runImportBatches,
} from "@/lib/data/import-batches";
import {
  acquireImportLock,
  IMPORT_LOCK_STALE_MS,
  importLockMessage,
  otherImportRunning,
  releaseImportLock,
} from "@/lib/import-lock";
import {
  buildPlan,
  duplicateReason as leadDuplicateReason,
  type ExistingClient as StoredLead,
} from "@/lib/data/lead-import-plan";
import { pickActiveMatch, setActiveFirst } from "@/lib/data/import-stored-index";
import { type ColumnMapping } from "@/lib/data/lead-import-types";

/** Linia lunga si linia medie, scrise prin codul lor ca fisierul sa nu le poarte. */
const DASHES = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);

// ---------------------------------------------------------------------------
// Item 1: clientii activi castiga mereu.
// ---------------------------------------------------------------------------

const LEAD_MAPPING: ColumnMapping = ["name", "phone", "email", "address"];

function storedLead(id: string, active: boolean, extra: Partial<StoredLead> = {}): StoredLead {
  return {
    id,
    name: `Client ${id}`,
    phoneKey: "+37369123456",
    emailKey: null,
    empty: ["address"],
    active,
    ...extra,
  };
}

function leadPlan(existing: StoredLead[], rows: string[][], lines?: number[], earlier?: FileAnchor[]) {
  return buildPlan({
    rows,
    lines,
    mapping: LEAD_MAPPING,
    owners: new Map(),
    fallbackSource: "",
    existing,
    earlier,
  }).plan;
}

function duplicateOf<E extends { kind: string }>(entry: E | undefined) {
  if (!entry || entry.kind !== "duplicate") throw new Error("asteptat dublat");
  return entry as Extract<E, { kind: "duplicate" }>;
}

test("P3-307: leaduri, un client activ castiga in fata unuia dezactivat cu acelasi telefon, in ambele ordini", () => {
  const inactive = storedLead("a-inactiv", false);
  const active = storedLead("b-activ", true);
  for (const existing of [[inactive, active], [active, inactive]]) {
    const entry = duplicateOf(leadPlan(existing, [["Popescu", "069123456", "", "Orhei"]]).entries[0]);
    expect(entry.against).toEqual({ kind: "stored", id: "b-activ", name: "Client b-activ" });
    expect(entry.fillable).toEqual(["address"]);
    expect(leadDuplicateReason(entry)).toBe('Dublat după telefon cu "Client b-activ", care există deja.');
  }
});

test("P3-307: leaduri, mesajul 'dezactivat' apare numai cand nu exista niciun client activ potrivit", () => {
  const entry = duplicateOf(
    leadPlan([storedLead("a", false), storedLead("b", false)], [["Popescu", "069123456", "", "Orhei"]]).entries[0],
  );
  expect(entry.against).toMatchObject({ kind: "stored", id: "a", inactive: true });
  expect(entry.fillable).toEqual([]);
});

test("P3-307: leaduri, telefonul duce la un client dezactivat si emailul la unul activ: castiga cel activ", () => {
  const byPhone = storedLead("a-telefon", false);
  const byEmail = storedLead("b-email", true, { phoneKey: "+37369000000", emailKey: "x@y.md" });
  const entry = duplicateOf(leadPlan([byPhone, byEmail], [["Popescu", "069123456", "x@y.md", "Orhei"]]).entries[0]);
  expect(entry.against).toMatchObject({ kind: "stored", id: "b-email" });
  expect(entry.matchedOn).toBe("email");
  expect(entry.against).not.toHaveProperty("inactive");
});

test("P3-307: leaduri, telefonul activ ramane prioritar fata de emailul activ", () => {
  const byPhone = storedLead("a-telefon", true);
  const byEmail = storedLead("b-email", true, { phoneKey: "+37369000000", emailKey: "x@y.md" });
  const entry = duplicateOf(leadPlan([byEmail, byPhone], [["Popescu", "069123456", "x@y.md", "Orhei"]]).entries[0]);
  expect(entry.against).toMatchObject({ kind: "stored", id: "a-telefon" });
  expect(entry.matchedOn).toBe("phone");
});

const CLIENT_MAPPING = ["name", "email", "phone", "address"] as never;

function storedClient(id: string, extra: Partial<StoredClient> = {}): StoredClient {
  return {
    id,
    name: "Popescu SRL",
    emailKey: null,
    phone: "069123456",
    empty: ["email", "address"],
    ...extra,
  };
}

function clientPlan(existing: StoredClient[], rows: string[][], lines?: number[], earlier?: FileAnchor[]) {
  return buildClientPlan({ rows, lines, mapping: CLIENT_MAPPING, owners: new Map(), existing, earlier }).plan;
}

test("P3-307: clienti, un client activ castiga dupa email in fata unuia dezactivat, in ambele ordini", () => {
  const inactive = storedClient("a", { emailKey: "a@b.md", active: false });
  const active = storedClient("b", { emailKey: "a@b.md", active: true });
  for (const existing of [[inactive, active], [active, inactive]]) {
    const entry = duplicateOf(clientPlan(existing, [["Popescu", "a@b.md", "", "Orhei"]]).entries[0]);
    expect(entry.against).toMatchObject({ kind: "stored", id: "b" });
    expect(entry.against).not.toHaveProperty("inactive");
  }
});

test("P3-307: clienti, un client activ castiga dupa nume si telefon in fata unuia dezactivat, in ambele ordini", () => {
  const inactive = storedClient("a", { active: false });
  const active = storedClient("b", { active: true });
  for (const existing of [[inactive, active], [active, inactive]]) {
    const entry = duplicateOf(clientPlan(existing, [["popescu srl", "", "069 123 456", "Orhei"]]).entries[0]);
    expect(entry.against).toMatchObject({ kind: "stored", id: "b" });
    expect(entry.matchedBy).toBe("namePhone");
    expect(entry.fillable).toEqual(["address"]);
  }
});

test("P3-307: clienti, doar clienti dezactivati potriviti: mesajul de reactivare ramane", () => {
  const entry = duplicateOf(
    clientPlan([storedClient("a", { active: false })], [["Popescu SRL", "", "069123456", "Orhei"]]).entries[0],
  );
  expect(clientDuplicateReason(entry)).toBe(
    "Există deja ca client dezactivat: Popescu SRL. Reactivați-l din fișa clientului înainte de import.",
  );
});

test("P3-307: ajutoarele de alegere pun activul inaintea dezactivatului si pastreaza primul intre egali", () => {
  const map = new Map<string, { id: string; active?: boolean }>();
  setActiveFirst(map, "k", { id: "1", active: false });
  setActiveFirst(map, "k", { id: "2", active: false });
  expect(map.get("k")?.id).toBe("1");
  setActiveFirst(map, "k", { id: "3" });
  expect(map.get("k")?.id).toBe("3");
  setActiveFirst(map, "k", { id: "4", active: true });
  expect(map.get("k")?.id).toBe("3");
  expect(pickActiveMatch([undefined, { id: "x", active: false }, { id: "y" }])?.id).toBe("y");
  expect(pickActiveMatch([{ id: "x", active: false }, undefined])?.id).toBe("x");
  expect(pickActiveMatch([undefined])).toBeUndefined();
});

// ---------------------------------------------------------------------------
// Item 2: un email nu ascunde o potrivire nume + telefon.
// ---------------------------------------------------------------------------

test("P3-307: clienti, un rand cu email se potriveste dupa nume si telefon cu un client salvat fara email", () => {
  const result = clientPlan([storedClient("c1")], [["Popescu SRL", "nou@popescu.md", "+373 69 123 456", ""]]);
  expect(result.counts).toEqual({ fresh: 0, duplicate: 1, error: 0 });
  const entry = duplicateOf(result.entries[0]);
  expect(entry.against).toEqual({ kind: "stored", id: "c1", name: "Popescu SRL" });
  expect(entry.matchedBy).toBe("namePhone");
  // Emailul din fisier se poate scrie in campul gol al clientului salvat.
  expect(entry.fillable).toContain("email");
  expect(clientDuplicateReason(entry)).toBe('Același nume și telefon cu "Popescu SRL", care există deja.');
});

test("P3-307: clienti, un rand cu email NU se potriveste dupa nume si telefon cu un client care are alt email", () => {
  const result = clientPlan(
    [storedClient("c1", { emailKey: "vechi@popescu.md" })],
    [["Popescu SRL", "nou@popescu.md", "069123456", ""]],
  );
  expect(result.counts).toEqual({ fresh: 1, duplicate: 0, error: 0 });
});

test("P3-307: clienti, acelasi email ramane dublat dupa email, nu dupa nume si telefon", () => {
  const entry = duplicateOf(
    clientPlan([storedClient("c1", { emailKey: "a@popescu.md" })], [["Popescu SRL", "a@popescu.md", "069123456", ""]])
      .entries[0],
  );
  expect(entry.matchedBy).toBeUndefined();
  expect(clientDuplicateReason(entry)).toBe('Dublat după email cu "Popescu SRL", care există deja.');
});

test("P3-307: clienti, un rand fara email se potriveste in continuare cu orice client salvat dupa nume si telefon", () => {
  const entry = duplicateOf(
    clientPlan([storedClient("c1", { emailKey: "a@popescu.md" })], [["Popescu SRL", "", "069123456", ""]]).entries[0],
  );
  expect(entry.matchedBy).toBe("namePhone");
});

test("P3-307: clienti, o lista incarcata din nou cu o coloana de email noua nu creeaza din nou clientii", () => {
  const existing = Array.from({ length: 5 }, (_, i) =>
    storedClient(`c${i}`, { name: `Client ${i}`, phone: `069${100000 + i}` }),
  );
  const rows = existing.map((c, i) => [c.name, `client${i}@x.md`, `069${100000 + i}`, ""]);
  const result = clientPlan(existing, rows);
  expect(result.counts).toEqual({ fresh: 0, duplicate: 5, error: 0 });
});

test("P3-307: instructiunile pentru clienti spun regula noua", () => {
  const text = clientImportInstructions().join(" ");
  expect(text).toContain("clientul deja salvat nu are");
  expect(text).toContain("se alege cel activ");
  expect(text).not.toMatch(DASHES);
});

// ---------------------------------------------------------------------------
// Item 3: loturi, ancore, doua importuri deodata.
// ---------------------------------------------------------------------------

type Batched<P> = { parts: P[]; anchorsCapped: boolean };

async function batched<P extends { anchors?: FileAnchor[] }>(
  rows: string[][],
  plan: (rows: string[][], lines: number[], earlier: FileAnchor[]) => P,
): Promise<Batched<P>> {
  const result = await runImportBatches<P>({
    step: "check",
    rows,
    call: async (batch, earlier) => ({ ok: true as const, value: plan(batch.rows, batch.lines, earlier) }),
    anchorsOf: (part) => part.anchors,
  });
  if (!result.ok) throw new Error(result.message);
  return { parts: result.parts, anchorsCapped: result.anchorsCapped };
}

test("P3-307: leaduri, un dublat al carui prim rand este in alt lot ofera completarea reala", async () => {
  const rows = Array.from({ length: 300 }, (_, i) => [`Lead ${i + 1}`, `069${100000 + i}`, "", ""]);
  rows[259] = ["Lead 260", rows[9]![1]!, "", "Strada 1"];

  const whole = leadPlan([], rows);
  const wholeEntry = duplicateOf(whole.entries.find((e) => e.kind === "duplicate"));
  expect(wholeEntry.fillable).toEqual(["address"]);

  const { parts } = await batched(rows, (r, l, earlier) => leadPlan([], r, l, earlier));
  expect(parts.length).toBe(2);
  const entry = duplicateOf(mergePlans(parts).entries.find((e) => e.kind === "duplicate"));
  expect(entry.line).toBe(261);
  expect(entry.fillable).toEqual(["address"]);
  expect(entry.against).toMatchObject({ kind: "file", line: 11, otherBatch: true });
});

test("P3-307: leaduri, un dublat din acelasi lot nu poarta semnul 'alt lot'", () => {
  const rows = [
    ["Ana", "069111111", "", ""],
    ["Ana 2", "069111111", "", "Strada 1"],
  ];
  const entry = duplicateOf(leadPlan([], rows).entries[1]);
  expect(entry.against).toEqual({ kind: "file", line: 2, name: "Ana" });
  expect(entry.fillable).toEqual(["address"]);
});

test("P3-307: clienti, un dublat al carui prim rand este in alt lot ofera completarea reala", async () => {
  const rows = Array.from({ length: 300 }, (_, i) => [`Client ${i + 1}`, `c${i}@example.test`, `069${300000 + i}`, ""]);
  rows[10] = ["Acelasi Nume", "", "069777000", ""];
  rows[260] = ["  acelasi   nume ", "", "+373 69 777 000", "Strada 2"];

  const { parts } = await batched(rows, (r, l, earlier) => clientPlan([], r, l, earlier));
  expect(parts.length).toBe(2);
  const entry = duplicateOf(mergePlans(parts).entries.find((e) => e.kind === "duplicate"));
  expect(entry.line).toBe(262);
  expect(entry.fillable).toEqual(["address"]);
  expect(entry.against).toMatchObject({ kind: "file", line: 12, otherBatch: true });
});

/** 10 000 de leaduri cu telefon si email, ca limita ancorelor sa fie probata pe un fisier mare. */
function bigLeadRows(count: number): string[][] {
  return Array.from({ length: count }, (_, i) => [
    `Lead ${i + 1}`,
    `069${String(100000 + i).padStart(6, "0")}`,
    `lead${i}@example.test`,
    "",
  ]);
}

test("P3-307: un fisier de 10 000 de randuri incape in ancore si dublatele dintre loturi se vad pana la capat", async () => {
  const rows = bigLeadRows(10_000);
  // Acelasi telefon la randul 10 si la randul 9990, la capete opuse ale fisierului.
  rows[9989] = ["Lead 9990", rows[9]![1]!, "", "Strada 9"];

  const { parts, anchorsCapped } = await batched(rows, (r, l, earlier) => leadPlan([], r, l, earlier));
  expect(anchorsCapped).toBe(false);
  const merged = mergePlans(parts);
  expect(merged.counts.duplicate).toBe(1);
  const entry = duplicateOf(merged.entries.find((e) => e.kind === "duplicate"));
  expect(entry.line).toBe(9991);
  expect(entry.against).toMatchObject({ kind: "file", line: 11 });
});

test("P3-307: ancorele de 10 000 de randuri impreuna cu un lot raman sub limita de 1 MB a cadrului", () => {
  const into = { anchors: [] as FileAnchor[], bytes: 0 };
  const parts = bigLeadRows(10_000).flatMap((row, i): FileAnchor[] => [
    [`phone:+373${row[1]!.slice(1)}`, i + 2],
    [`email:${row[2]}`, i + 2],
  ]);
  expect(addAnchors(into, parts)).toBe(false);
  expect(into.anchors.length).toBe(parts.length);
  expect(JSON.stringify(into.anchors).length).toBeLessThanOrEqual(IMPORT_ANCHOR_BYTES);
  expect(JSON.stringify(into.anchors).length + IMPORT_BATCH_BYTES).toBeLessThan(1_000_000);
  expect(IMPORT_BATCH_SIZE).toBe(200);
});

test("P3-307: peste prag, addAnchors spune ca a lasat ancore pe dinafara si ecranul primeste vestea", async () => {
  const into = { anchors: [] as FileAnchor[], bytes: 0 };
  const big = Array.from({ length: 40_000 }, (_, i): FileAnchor => [`phone:${"7".repeat(30)}${i}`, i + 2]);
  expect(addAnchors(into, big)).toBe(true);
  expect(into.anchors.length).toBeLessThan(big.length);
  expect(addAnchors(into, undefined)).toBe(false);

  // Prin loturi: cheile foarte lungi umplu pragul, iar rezultatul poarta semnul.
  const rows = Array.from({ length: 4000 }, (_, i) => [`Lead ${i + 1}`, `069${String(100000 + i).padStart(6, "0")}`, `${"x".repeat(180)}${i}@example.test`, ""]);
  const { anchorsCapped } = await batched(rows, (r, l, earlier) => leadPlan([], r, l, earlier));
  expect(anchorsCapped).toBe(true);
  expect(IMPORT_ANCHORS_CAPPED).toContain("Fișierul este foarte mare");
  expect(IMPORT_ANCHORS_CAPPED).not.toMatch(DASHES);
});

test("P3-307: un fisier mic nu declanseaza avertismentul de ancore", async () => {
  const { anchorsCapped } = await batched(bigLeadRows(450), (r, l, earlier) => leadPlan([], r, l, earlier));
  expect(anchorsCapped).toBe(false);
});

class MemoryStorage {
  private readonly data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

test("P3-307: al doilea import de acelasi fel este blocat cat timp primul ruleaza, apoi se deblocheaza", () => {
  const storage = new MemoryStorage();
  expect(acquireImportLock(storage, "clients", "fila-1", 1_000)).toBe(true);
  // Aceeasi fila poate reinnoi.
  expect(acquireImportLock(storage, "clients", "fila-1", 2_000)).toBe(true);
  expect(otherImportRunning(storage, "clients", "fila-2", 3_000)).toBe(true);
  expect(acquireImportLock(storage, "clients", "fila-2", 3_000)).toBe(false);
  // Alt fel de import nu este blocat.
  expect(acquireImportLock(storage, "leads", "fila-2", 3_000)).toBe(true);
  // Doar cel care o tine o poate elibera.
  releaseImportLock(storage, "clients", "fila-2");
  expect(otherImportRunning(storage, "clients", "fila-2", 3_000)).toBe(true);
  releaseImportLock(storage, "clients", "fila-1");
  expect(otherImportRunning(storage, "clients", "fila-2", 3_000)).toBe(false);
  expect(acquireImportLock(storage, "clients", "fila-2", 3_000)).toBe(true);
});

test("P3-307: o blocare lasata de o fila prabusita expira si mesajul este in romana, fara linii lungi", () => {
  const storage = new MemoryStorage();
  acquireImportLock(storage, "projects", "fila-1", 0);
  expect(otherImportRunning(storage, "projects", "fila-2", IMPORT_LOCK_STALE_MS - 1)).toBe(true);
  expect(otherImportRunning(storage, "projects", "fila-2", IMPORT_LOCK_STALE_MS + 1)).toBe(false);
  storage.setItem("rc-import-running:projects", "nu e json");
  expect(otherImportRunning(storage, "projects", "fila-2", 1)).toBe(false);
  expect(importLockMessage("clients")).toBe(
    "Un alt import de clienți este în curs în acest browser. Așteptați să se termine, apoi apăsați Importă.",
  );
  expect(importLockMessage("leads")).toContain("de leaduri");
  expect(importLockMessage("projects")).toContain("de proiecte");
  expect(importLockMessage("materials")).toContain("de materiale");
});

// ---------------------------------------------------------------------------
// Prin ecran si prin baza (numai in CI). UN CLIENT ACTIV SI UNUL DEZACTIVAT CU ACELASI TELEFON.
// ---------------------------------------------------------------------------

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const RUN4 = String(Math.floor(Math.random() * 9000) + 1000);

type OwnerRest = { api: APIRequestContext; headers: Record<string, string> };

async function ownerRest(): Promise<OwnerRest> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  expect(url, "P3-307 are nevoie de NEXT_PUBLIC_SUPABASE_URL").not.toBe("");
  expect(anonKey, "P3-307 are nevoie de NEXT_PUBLIC_SUPABASE_ANON_KEY").not.toBe("");
  const api = await request.newContext({ baseURL: url });
  const owner = ownerAccount();
  const token = await api.post("/auth/v1/token?grant_type=password", {
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    data: { email: owner.email, password: owner.password },
  });
  expect(token.ok()).toBe(true);
  const body = (await token.json()) as { access_token: string };
  return {
    api,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${body.access_token}`,
      "Content-Type": "application/json",
    },
  };
}

async function restGet<T>(rest: OwnerRest, path: string): Promise<T> {
  const response = await rest.api.get(path, { headers: rest.headers });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as T;
}

test("import leaduri: un client activ si unul dezactivat cu acelasi telefon, activul este cel potrivit", async ({
  page,
}) => {
  await signIn(page, ownerAccount());
  const rest = await ownerRest();
  const tag = `TEST ${RUN} activ`;

  // Doua uuid-uri, cel mic pentru clientul dezactivat: citirea ordonata dupa uuid ii da
  // intaietate, deci vechiul "primul castiga" alegea clientul dezactivat.
  const [lowId, highId] = [crypto.randomUUID(), crypto.randomUUID()].sort();
  const created = await rest.api.post("/rest/v1/clients", {
    headers: { ...rest.headers, Prefer: "return=representation" },
    data: [
      { id: lowId, name: `${tag} dezactivat`, phone: `+37369${RUN4}07`, active: false },
      { id: highId, name: `${tag} activ`, phone: `+37369${RUN4}07`, active: true },
    ],
  });
  expect(created.status(), await created.text()).toBe(201);

  const body = [
    "Denumire,Telefon,Email,Etapă,Interes,Responsabil,Data de reluare,Adresă",
    `${tag} din fișier,069${RUN4}07,,,,,,Strada Test 7`,
  ].join("\r\n");

  await page.goto("/clienti?vedere=leaduri");
  await page.getByTestId("leaduri-import").click();
  await expect(page.getByTestId("import-step-1")).toBeVisible();
  await page.getByTestId("import-file").setInputFiles({
    name: "leaduri-activ.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(body, "utf8"),
  });
  await expect(page.getByTestId("import-read")).toBeVisible();
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-2")).toBeVisible();
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-3")).toBeVisible();

  const duplicate = page.getByTestId("import-duplicate");
  await expect(duplicate).toHaveCount(1);
  await expect(duplicate).toContainText(`${tag} activ`);
  await expect(duplicate).not.toContainText("dezactivat");
  await expect(
    page.getByTestId("import-duplicate-choice").locator('option[value="fill"]'),
  ).toBeEnabled();

  await page.getByTestId("import-duplicate-choice").selectOption("fill");
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-4")).toBeVisible();
  await page.getByTestId("import-run").click();
  await expect(page.getByTestId("import-summary")).toBeVisible({ timeout: 60_000 });
  const count = async (id: string) => Number((await page.getByTestId(id).innerText()).trim());
  expect(await count("import-created")).toBe(0);
  expect(await count("import-filled")).toBe(1);

  const rows = await restGet<{ id: string; address: string | null; active: boolean }[]>(
    rest,
    `/rest/v1/clients?select=id,address,active&id=in.(${lowId},${highId})`,
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  expect(byId.get(highId)?.address).toBe("Strada Test 7");
  expect(byId.get(lowId)?.address ?? null).toBeNull();

  // Datele de test se dezactiveaza, nu se sterg.
  const cancel = await rest.api.patch(`/rest/v1/clients?id=in.(${lowId},${highId})`, {
    headers: rest.headers,
    data: { active: false },
  });
  expect(cancel.ok()).toBe(true);
});
