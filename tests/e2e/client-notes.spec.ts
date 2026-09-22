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
// NOTELE SE SCRIU DIN FILA NOTE, acolo unde le scrie omul; pregatirea randurilor si
// citirea randurilor stocate trec direct prin PostgREST, cu jetonul contului.
//
// DATELE DE TEST NU SE STERG NICIODATA. Fiecare rand poarta prefixul TEST si un
// sufix unic pe rulare; o nota nici nu se poate sterge, si asta este testat.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

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

async function openNotes(page: Page, id: string) {
  await page.goto(`/clienti/${id}?fila=note`);
  await expect(page.getByTestId("panel-note")).toBeVisible({ timeout: 25_000 });
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
    await expect(page.getByTestId("panel-note")).toBeVisible({ timeout: 25_000 });

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
});
