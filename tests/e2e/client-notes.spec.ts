import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { managerAccount, ownerAccount, type TestAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// client-notes.spec - linia de acceptanta a cardului P3-90, goal G45.
//
// Proprietarul, 2026-09-22: "Notes on the lead, 'Ce s-a discutat'. [...] On the
// lead and client page: a text box at the top ('Ce s-a discutat'), a 'Salvează'
// button, and the list of notes below, newest first, with author and date in
// Romanian format. Saving a note may also set the next step (G44) in the same form,
// one save. Stage changes from client_stage_history appear in the same list, in a
// lighter style, so it reads as one timeline." Testul cerut: "add a note, see it
// first in the list with the right author."
//
// NOTELE SE SCRIU DE PE PAGINA LEADULUI SI A CLIENTULUI, acolo unde le scrie omul;
// pregatirea randurilor si citirea randurilor stocate trec direct prin PostgREST,
// cu jetonul contului.
//
// PANA LA CARDUL P3-99 SE SCRIAU DIN FILA NOTE, a cincea din banda, si fiecare
// caz de aici deschidea `?fila=note`. Maturarea din 2026-09-22, constatarea B2, a
// aratat ca goal G45 ceruse casuta sus pe pagina si ca ce a livrat P3-90 era sus
// intr-o fila care sta jos. P3-99 a mutat panoul deasupra benzii de file. Fiecare
// caz de mai jos dovedeste exact ce dovedea inainte, din pozitia noua, si s-au
// adaugat trei: casuta si istoria se vad pe amandoua paginile fara sa se deschida
// vreo fila, stau deasupra benzii, si totul incape pe un telefon de 390x844.
//
// UN SINGUR ECRAN SERVESTE SI LEADUL SI CLIENTUL. Un lead este un rand de client
// cu etapa: nu exista tabela de leaduri si nici o a doua pagina de detaliu.
//
// DATELE DE TEST NU SE STERG NICIODATA. Fiecare rand poarta prefixul TEST si un
// sufix unic pe rulare; o nota nici nu se poate sterge, si asta este testat.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

// P3-99, clauza de telefon. Aceleasi praguri ca in phone-forms.spec.ts: 44px
// tinta de atingere, 16px text de camp, sub care iOS Safari mareste pagina.
const PHONE = { width: 390, height: 844 };
const MIN_TAP = 44;
const MIN_INPUT_FONT = 16;

type Stage = "cold" | "nurture" | "follow_up" | "quoted" | "client";

function leadName(tag: string): string {
  return `TEST G45 ${tag} ${RUN}`;
}

// ---------------------------------------------------------------------------
// Legatura directa la baza, ca un cont anume
// ---------------------------------------------------------------------------

type Rest = { api: APIRequestContext; headers: Record<string, string>; userId: string };

async function restAs(account: TestAccount): Promise<Rest> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  expect(url, "P3-90 are nevoie de NEXT_PUBLIC_SUPABASE_URL").not.toBe("");
  expect(anonKey, "P3-90 are nevoie de NEXT_PUBLIC_SUPABASE_ANON_KEY").not.toBe("");

  const api = await request.newContext({ baseURL: url });
  const token = await api.post("/auth/v1/token?grant_type=password", {
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    data: { email: account.email, password: account.password },
  });
  expect(token.ok()).toBe(true);
  const body = (await token.json()) as { access_token: string; user: { id: string } };

  return {
    api,
    userId: body.user.id,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${body.access_token}`,
      "Content-Type": "application/json",
    },
  };
}

/** Numele pe care fila trebuie sa il arate pentru un cont: numele complet, altfel
 *  emailul, exact regula lui ownerDisplayName. */
async function displayName(rest: Rest): Promise<string> {
  const response = await rest.api.get(`/rest/v1/profiles?id=eq.${rest.userId}&select=full_name,email`, {
    headers: rest.headers,
  });
  expect(response.status(), await response.text()).toBe(200);
  const rows = (await response.json()) as { full_name: string | null; email: string | null }[];
  expect(rows).toHaveLength(1);
  return rows[0]!.full_name?.trim() || rows[0]!.email?.trim() || "Fără nume";
}

/** public.set_client_stage, cu trei parametri, exact cum o cheama aplicatia. */
async function setStage(rest: Rest, id: string, stage: Stage, date: string | null) {
  const moved = await rest.api.post("/rest/v1/rpc/set_client_stage", {
    headers: rest.headers,
    data: { p_client_id: id, p_stage: stage, p_follow_up_date: date },
  });
  expect(moved.status(), await moved.text()).toBe(200);
}

/** Un lead nou, dus la etapa ceruta prin functie, cu randul lui de istoric. */
async function createLead(rest: Rest, name: string, stage: Stage): Promise<string> {
  const created = await rest.api.post("/rest/v1/clients", {
    headers: { ...rest.headers, Prefer: "return=representation" },
    data: { name, active: true, phone: "069 000 450" },
  });
  expect(created.status(), await created.text()).toBe(201);
  const id = ((await created.json()) as { id: string }[])[0]!.id;
  if (stage !== "cold") await setStage(rest, id, stage, null);
  return id;
}

type StoredNote = { body: string; created_by: string | null };

async function storedNotes(rest: Rest, clientId: string): Promise<StoredNote[]> {
  const response = await rest.api.get(
    `/rest/v1/client_notes?client_id=eq.${clientId}&select=body,created_by&order=created_at.desc`,
    { headers: rest.headers },
  );
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as StoredNote[];
}

/** Ziua de azi IN CHISINAU, `YYYY-MM-DD`, deplasata cu un numar de zile. */
function chisinauDay(offsetDays: number): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Chisinau",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + offsetDays)).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` cum il arata ecranul, `DD.MM.YYYY`. */
function onScreen(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// ---------------------------------------------------------------------------
// Ecranul
// ---------------------------------------------------------------------------

/**
 * P3-99. Pagina leadului sau a clientului, FARA niciun parametru de fila si fara
 * nicio atingere de fila: panoul notelor este pe pagina, deasupra benzii.
 */
async function openNotes(page: Page, id: string) {
  await page.goto(`/clienti/${id}`);
  await expect(page.getByTestId("client-notes")).toBeVisible({ timeout: 25_000 });
}

/** Marginile unui element, ca sa se poata compara ordinea pe verticala. */
async function edges(page: Page, testId: string): Promise<{ top: number; bottom: number; right: number }> {
  const b = await page.getByTestId(testId).boundingBox();
  expect(b, `${testId} nu are casuta pe ecran`).toBeTruthy();
  return { top: b!.y, bottom: b!.y + b!.height, right: b!.x + b!.width };
}

/**
 * P3-99. Ce trebuie sa incapa la 390px, citit intr-o singura trecere in panoul
 * notelor. Aceleasi clauze ca readPhone din phone-forms.spec.ts, restranse la
 * radacina acestui panou, si cu lista celor care ies din ea in mesaj: o pereche
 * de numere singura nu spune ce sa repari (KNOWN-FAILURES, P3-97).
 */
async function readNotesPhone(page: Page) {
  return page.evaluate(
    ({ minTap, minFont }) => {
      const root = document.querySelector<HTMLElement>('[data-testid="client-notes"]');
      if (!root) throw new Error("panoul notelor lipseste");
      const main = document.querySelector("main");
      if (!main) throw new Error("pagina nu are <main>");

      const visible = (el: Element) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== "hidden";
      };
      const name = (el: Element) =>
        `${el.tagName.toLowerCase()}[${el.getAttribute("data-testid") ?? ""}] "${(
          el.textContent ?? ""
        )
          .trim()
          .slice(0, 40)}"`;

      const smallTargets: string[] = [];
      for (const el of Array.from(root.querySelectorAll("input, select, textarea, button, a[href]"))) {
        if (!visible(el)) continue;
        const height = el.getBoundingClientRect().height;
        if (height < minTap) smallTargets.push(`${name(el)} ${height.toFixed(1)}px`);
      }

      const smallFonts: string[] = [];
      for (const el of Array.from(root.querySelectorAll("input, select, textarea"))) {
        if (!visible(el)) continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size < minFont) smallFonts.push(`${name(el)} ${size}px`);
      }

      const rootRight = root.getBoundingClientRect().right - (parseFloat(getComputedStyle(root).paddingRight) || 0);
      const wider: string[] = [];
      for (const el of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
        if (!visible(el)) continue;
        if (el.getBoundingClientRect().right > rootRight + 0.5) {
          const r = el.getBoundingClientRect();
          wider.push(`${name(el)} ${r.left.toFixed(0)}..${r.right.toFixed(0)}`);
        }
      }

      return {
        viewportWidth: window.innerWidth,
        document: {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        },
        main: { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth },
        root: { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth },
        smallTargets,
        smallFonts,
        wider,
      };
    },
    { minTap: MIN_TAP, minFont: MIN_INPUT_FONT },
  );
}

async function saveNote(page: Page, body: string) {
  await page.getByTestId("note-body").fill(body);
  await page.getByTestId("note-save").click();
}

/** Felul fiecarui rand din istorie, de sus in jos. */
async function timelineKinds(page: Page): Promise<string[]> {
  return page
    .getByTestId("timeline")
    .locator(":scope > li")
    .evaluateAll((items) => items.map((li) => li.getAttribute("data-testid") ?? ""));
}

// ---------------------------------------------------------------------------

test.describe("Note pe lead și client, Ce s-a discutat (P3-90)", () => {
  test.describe.configure({ timeout: 150_000 });

  test("G45: o notă adăugată apare prima în listă, cu autorul corect și data de azi", async ({ page }) => {
    await signIn(page, ownerAccount());
    const rest = await restAs(ownerAccount());
    const author = await displayName(rest);
    // O mutare de etapa facuta INAINTE, ca "prima" sa insemne ceva.
    const id = await createLead(rest, leadName("Prima"), "nurture");

    await openNotes(page, id);
    await expect(page.getByTestId("timeline-stage")).toHaveCount(1, { timeout: 15_000 });
    // Casuta este SUS, deasupra listei.
    const form = await page.getByTestId("note-form").boundingBox();
    const list = await page.getByTestId("timeline").boundingBox();
    expect(form && list && form.y < list.y).toBe(true);

    const body = `Am vorbit la telefon despre acoperiș, ${RUN}`;
    await saveNote(page, body);

    const first = page.getByTestId("timeline").locator(":scope > li").first();
    await expect(first).toHaveAttribute("data-testid", "timeline-note", { timeout: 20_000 });
    await expect(first.getByTestId("timeline-body")).toHaveText(body);
    await expect(first.getByTestId("timeline-author")).toHaveText(author);
    await expect(first.getByTestId("timeline-date")).toContainText(onScreen(chisinauDay(0)));
    expect(await timelineKinds(page)).toEqual(["timeline-note", "timeline-stage"]);
    await expect(page.getByTestId("note-body")).toHaveValue("");

    // Stocata o data, cu autorul contului care a scris-o.
    expect(await storedNotes(rest, id)).toEqual([{ body, created_by: rest.userId }]);

    await rest.api.dispose();
  });

  test("G45: o mutare de etapă apare în aceeași listă, după notă în timp, marcată ca etapă", async ({ page }) => {
    await signIn(page, ownerAccount());
    const rest = await restAs(ownerAccount());
    const author = await displayName(rest);
    const id = await createLead(rest, leadName("Etapa"), "cold");

    await openNotes(page, id);
    const body = `Clientul vrea ofertă pentru 120 m2, ${RUN}`;
    await saveNote(page, body);
    await expect(page.getByTestId("timeline-note")).toHaveCount(1, { timeout: 20_000 });

    // Mutarea trece prin functia pe care o cheama aplicatia, cu randul ei de istoric.
    await setStage(rest, id, "quoted", null);
    await page.reload();
    await expect(page.getByTestId("client-notes")).toBeVisible({ timeout: 25_000 });

    expect(await timelineKinds(page)).toEqual(["timeline-stage", "timeline-note"]);
    const stage = page.getByTestId("timeline-stage").first();
    await expect(stage.getByTestId("timeline-stage-change")).toHaveText(
      "Etapa s-a schimbat din Lead rece în Ofertat",
    );
    await expect(stage.getByTestId("timeline-author")).toHaveText(author);
    await expect(stage.getByTestId("timeline-date")).toContainText(onScreen(chisinauDay(0)));
    // Mai estompat decat nota: alt ton de text, nu acelasi rand.
    const stageColour = await stage.evaluate((el) => getComputedStyle(el).color);
    const noteColour = await page
      .getByTestId("timeline-note")
      .getByTestId("timeline-body")
      .evaluate((el) => getComputedStyle(el).color);
    expect(stageColour).not.toBe(noteColour);

    await rest.api.dispose();
  });

  test("G45: o notă salvată împreună cu următorul pas le stochează pe amândouă dintr-o salvare", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const rest = await restAs(ownerAccount());
    const id = await createLead(rest, leadName("Pas"), "nurture");
    const when = chisinauDay(5);

    await openNotes(page, id);
    await page.getByTestId("note-body").fill(`A cerut mostre de culoare, ${RUN}`);
    await page.getByTestId("note-next-action-at").fill(when);
    await page.getByTestId("note-next-action").fill("trimit mostrele");
    await page.getByTestId("note-save").click();
    await expect(page.getByTestId("timeline-note")).toHaveCount(1, { timeout: 20_000 });

    await expect
      .poll(async () => {
        const response = await rest.api.get(`/rest/v1/clients?id=eq.${id}&select=next_action_at,next_action`, {
          headers: rest.headers,
        });
        return ((await response.json()) as unknown[])[0];
      })
      .toEqual({ next_action_at: when, next_action: "trimit mostrele" });
    expect(await storedNotes(rest, id)).toEqual([
      { body: `A cerut mostre de culoare, ${RUN}`, created_by: rest.userId },
    ]);

    // Fisa arata pasul fara o reincarcare manuala.
    await expect(page.getByTestId("client-next-action")).toContainText(onScreen(when));
    await expect(page.getByTestId("client-next-action")).toContainText("trimit mostrele");

    await rest.api.dispose();
  });

  test("G45: o notă goală este refuzată cu mesajul românesc și nu se stochează nimic", async ({ page }) => {
    await signIn(page, ownerAccount());
    const rest = await restAs(ownerAccount());
    const id = await createLead(rest, leadName("Gol"), "cold");

    await openNotes(page, id);
    await saveNote(page, "   \n  ");
    await expect(page.getByTestId("note-error")).toHaveText("Scrie ce s-a discutat.", { timeout: 20_000 });
    await expect(page.getByTestId("timeline-note")).toHaveCount(0);
    expect(await storedNotes(rest, id)).toEqual([]);

    // Nici direct prin baza: constrangerea din 0059 refuza un text din spatii.
    const direct = await rest.api.post("/rest/v1/client_notes", {
      headers: rest.headers,
      data: { client_id: id, body: "   " },
    });
    expect(direct.status(), await direct.text()).toBe(400);
    expect(await storedNotes(rest, id)).toEqual([]);

    await rest.api.dispose();
  });

  test("G45: managerul de cont vede istoria, nu primește formularul, iar baza îi refuză nota", async ({
    page,
  }) => {
    const owner = await restAs(ownerAccount());
    const id = await createLead(owner, leadName("Manager"), "nurture");
    const seeded = await owner.api.post("/rest/v1/client_notes", {
      headers: owner.headers,
      data: { client_id: id, body: `Nota administratorului, ${RUN}` },
    });
    expect(seeded.status(), await seeded.text()).toBe(201);

    await signIn(page, managerAccount());
    await openNotes(page, id);
    await expect(page.getByTestId("timeline-note")).toHaveCount(1, { timeout: 20_000 });
    await expect(page.getByTestId("timeline-body")).toHaveText(`Nota administratorului, ${RUN}`);
    await expect(page.getByTestId("timeline-stage")).toHaveCount(1);
    await expect(page.getByTestId("note-form")).toHaveCount(0);
    await expect(page.getByTestId("note-save")).toHaveCount(0);

    const manager = await restAs(managerAccount());
    const refused = await manager.api.post("/rest/v1/client_notes", {
      headers: manager.headers,
      data: { client_id: id, body: `Nota managerului, ${RUN}` },
    });
    expect(refused.status(), await refused.text()).toBe(403);
    expect((await storedNotes(owner, id)).map((n) => n.body)).toEqual([`Nota administratorului, ${RUN}`]);

    // Si nimeni nu rescrie sau sterge o nota: nici administratorul.
    const edited = await owner.api.patch(`/rest/v1/client_notes?client_id=eq.${id}`, {
      headers: owner.headers,
      data: { body: "rescris" },
    });
    expect(edited.status()).not.toBe(204);
    const removed = await owner.api.delete(`/rest/v1/client_notes?client_id=eq.${id}`, {
      headers: owner.headers,
    });
    expect(removed.status()).not.toBe(204);
    expect((await storedNotes(owner, id)).map((n) => n.body)).toEqual([`Nota administratorului, ${RUN}`]);

    await owner.api.dispose();
    await manager.api.dispose();
  });

  test("G45: pe telefon, la 390 px, formularul și lista stau una sub alta, în lățimea ecranului", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, ownerAccount());
    const rest = await restAs(ownerAccount());
    const id = await createLead(rest, leadName("Telefon 390"), "nurture");

    await openNotes(page, id);
    const body = await page.getByTestId("note-body").boundingBox();
    const date = await page.getByTestId("note-next-action-at").boundingBox();
    const text = await page.getByTestId("note-next-action").boundingBox();
    const save = await page.getByTestId("note-save").boundingBox();
    const list = await page.getByTestId("timeline").boundingBox();
    for (const box of [body, date, text, save, list]) {
      expect(box).toBeTruthy();
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    }
    expect(date!.y).toBeGreaterThan(body!.y + body!.height - 1);
    expect(text!.y).toBeGreaterThan(date!.y + date!.height - 1);
    expect(list!.y).toBeGreaterThan(save!.y);

    await rest.api.dispose();
  });

  // P3-99, constatarea B2. CASUTA SE VEDE FARA SA SE DESCHIDA NIMIC, pe amandoua
  // paginile, si sta DEASUPRA benzii de file. Se masoara casutele pe ecran, ca in
  // spec-urile de telefon, fiindca "deasupra" este o afirmatie despre asezare si
  // nu despre ordinea din fisier. Nicio fila nu se atinge in acest caz: daca
  // panoul ar mai fi in fila a cincea, fiecare asertiune de aici ar cadea.
  test("P3-99: pe pagina leadului și pe a clientului, casuța și istoria se văd fără nicio filă, deasupra benzii", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const rest = await restAs(ownerAccount());
    const lead = await createLead(rest, leadName("Sus lead"), "nurture");
    const client = await createLead(rest, leadName("Sus client"), "client");

    for (const [what, id] of [
      ["fișa leadului", lead],
      ["fișa clientului", client],
    ] as const) {
      await openNotes(page, id);

      // Implicitul benzii este tot Contacte, si nimeni nu a atins nicio fila.
      await expect(page.getByTestId("tab-contacte"), what).toHaveAttribute("data-active", "true");
      await expect(page.getByTestId("tab-note"), what).toHaveCount(0);

      // Casuta "Ce s-a discutat", butonul si istoria, toate vizibile pe loc.
      await expect(page.getByTestId("note-form"), what).toBeVisible();
      await expect(page.getByTestId("note-body"), what).toBeVisible();
      await expect(page.getByTestId("note-save"), what).toBeVisible();
      await expect(page.getByTestId("client-notes"), what).toContainText("Ce s-a discutat");
      await expect(page.getByTestId("timeline"), what).toBeVisible({ timeout: 15_000 });

      // Si tot panoul se termina inainte sa inceapa banda de file.
      const notes = await edges(page, "client-notes");
      const form = await edges(page, "note-form");
      const list = await edges(page, "timeline");
      const tabs = await edges(page, "client-tabs");
      expect(notes.bottom, `panoul notelor deasupra benzii pe ${what}`).toBeLessThanOrEqual(tabs.top);
      expect(form.bottom, `casuta deasupra benzii pe ${what}`).toBeLessThanOrEqual(tabs.top);
      expect(list.bottom, `istoria deasupra benzii pe ${what}`).toBeLessThanOrEqual(tabs.top);
      // Si inauntru, casuta ramane deasupra istoriei, cum a livrat P3-90.
      expect(form.bottom, `casuta deasupra istoriei pe ${what}`).toBeLessThanOrEqual(list.top);

      // Si sub cardul de identificare, nu deasupra lui: atat a cerut goalul.
      const detail = await edges(page, "client-detail");
      expect(detail.bottom, `panoul notelor sub datele de identificare pe ${what}`).toBeLessThanOrEqual(
        notes.top,
      );
    }

    await rest.api.dispose();
  });

  // P3-99, clauza de telefon. Panoul a ajuns pe o pagina care are deasupra lui
  // cardul de identificare si dedesubt banda de file, deci incaperea lui la 390px
  // se masoara din nou aici, in pozitia noua, pe fisa unui LEAD.
  test("P3-99: pe telefon, la 390x844, pagina leadului nu derulează lateral și casuța se poate atinge", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await signIn(page, ownerAccount());
    const rest = await restAs(ownerAccount());
    const id = await createLead(rest, leadName("Telefon sus"), "nurture");

    await openNotes(page, id);
    await expect(page.getByTestId("note-body")).toBeVisible({ timeout: 15_000 });

    const r = await readNotesPhone(page);
    expect(r.viewportWidth, "latimea ecranului").toBe(PHONE.width);
    expect(r.document.scrollWidth, "derulare laterala a documentului").toBeLessThanOrEqual(
      r.document.clientWidth,
    );
    expect(r.main.scrollWidth, "derulare laterala in <main>").toBeLessThanOrEqual(r.main.clientWidth);
    expect(
      r.root.scrollWidth,
      `derulare laterala in panoul notelor, iese: ${r.wider.join(" | ") || "nimeni"}`,
    ).toBeLessThanOrEqual(r.root.clientWidth);
    expect(r.smallTargets, `tinte sub ${MIN_TAP}px in panoul notelor`).toEqual([]);
    expect(r.smallFonts, `campuri sub ${MIN_INPUT_FONT}px in panoul notelor`).toEqual([]);

    // SE POATE ATINGE: se deruleaza pana la ea si se scrie, fara nicio fila.
    const body = `Scris de pe telefon, ${RUN}`;
    await page.getByTestId("note-body").scrollIntoViewIfNeeded();
    await saveNote(page, body);
    await expect(page.getByTestId("timeline-note")).toHaveCount(1, { timeout: 20_000 });
    await expect(page.getByTestId("timeline-body")).toHaveText(body);

    await rest.api.dispose();
  });
});
