import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { MAKE_CALLBACK_SECRET, firedFor } from "./support/make";
import { EXTRACTION_ERROR_CODES, EXTRACTION_ERROR_LABEL } from "@/lib/data/extraction-types";

// extraction-webhook-missing.spec - linia de acceptanta a cardului P3-71,
// constatarea F3 a lui Ivan: "silent upload failure when MAKE_WEBHOOK_URL is
// missing: a visible Romanian error on the upload screen and a named test".
//
// RULEAZA PE AL TREILEA SERVER, care porneste FARA MAKE_WEBHOOK_URL. Proiectul
// "fara-webhook" din playwright.config.ts il numeste, si acel fisier explica de
// ce cazul nu poate fi probat altfel: ramura care se probeaza este exact cea in
// care aplicatia nu face niciun fetch, deci nu exista nimic de mocat.
//
// DEFECTUL, ASA CUM ARATA INAINTE DE ACEST CARD. Incarcarea reusea, fisierul era
// stocat, si atat: fireExtraction se intorcea INAINTE de a scrie randul de
// ciorna, deci `.update(...).eq("order_id", ...)` de la apelant potrivea zero
// randuri. Pe ecran nu aparea nimic: nici macar o ciorna "in lucru". Documentul
// nu pleca nicaieri si nimeni nu afla.
//
// CE AFIRMA FIECARE CAZ, SI DE CE SUNT DOUA. Cazul 1 este calea de incarcare a
// documentului de extragere, /incarca-comanda, care este ecranul pe care il
// numeste constatarea. Cazul 2 este afirmatia de contract care tine ruta
// inghetata din R-202 in afara acestei schimbari, si o face din cod, nu dintr-o
// promisiune scrisa in raport.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const CALLBACK = "/api/extraction/callback";

/** Randul de ciorna, citit prin GET-ul rutei de callback, cu antetul ei secret.
 *  Aceeasi forma ca in extraction.spec: citirea nu este publica. */
async function draftState(request: APIRequestContext, orderId: string) {
  const r = await request.get(`${CALLBACK}?order_id=${orderId}`, {
    headers: { "x-rc-callback-secret": MAKE_CALLBACK_SECRET },
    maxRetries: 2,
  });
  return r.ok() ? await r.json() : null;
}

/** Incarca un document pe /incarca-comanda si intoarce order_id de pe cartonas.
 *
 *  NU PRIMESTE UN NUMAR DE TRIMITERI ASTEPTATE ca ajutorul din extraction.spec:
 *  aici raspunsul este intotdeauna zero, si cazul il afirma el insusi, ca sa fie
 *  o propozitie din test si nu un parametru al ajutorului. */
async function uploadForExtraction(page: Page, tag: string): Promise<string> {
  const filename = `TEST-P371-${tag}-${RUN}.pdf`;
  await page.goto("/incarca-comanda");
  await page.getByTestId("extraction-input").setInputFiles({
    name: filename,
    mimeType: "application/pdf",
    buffer: Buffer.from(
      `%PDF-1.4\n% RC test ${tag}\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
      "utf8",
    ),
  });
  const card = page.locator('[data-testid="draft-card"]').filter({ hasText: filename });
  await expect(card).toHaveCount(1, { timeout: 30_000 });
  const orderId = (await card.getAttribute("data-order-id")) ?? "";
  expect(orderId).toMatch(/^[0-9a-f-]{36}$/i);
  return orderId;
}

test.describe("Extragere fara MAKE_WEBHOOK_URL", () => {
  test.describe.configure({ timeout: 120_000 });

  test("1. P3-71 F3: o incarcare fara MAKE_WEBHOOK_URL esueaza VIZIBIL, romaneste, si nu in tacere", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, "missing");

    // NIMIC NU A PLECAT. Afirmatia este zero trimiteri catre transport, nu o
    // descriere a ei: serverul fals este acelasi pentru toate proiectele suitei,
    // deci o trimitere de pe acest server s-ar vedea acolo.
    expect(
      await firedFor(request, orderId),
      "fara adresa de webhook nu are unde sa plece nimic",
    ).toHaveLength(0);

    // RANDUL EXISTA, SI PANA LA ACEST CARD NU EXISTA DELOC. Acesta este defectul,
    // afirmat direct: fara rand, ecranul nu are ce arata si nimic nu se poate
    // interoga mai tarziu pentru o stare blocata.
    const d = await draftState(request, orderId);
    expect(d, "ciorna trebuie sa existe, altfel esecul este invizibil").not.toBeNull();
    expect(d.status).toBe("failed");
    expect(d.error_code).toBe("config_error");

    // MOTIVUL ESTE ROMANESC SI NUMESTE VARIABILA, pentru cine repara. Numele ei
    // este o eticheta de mediu, nu o valoare: sectiunea 7 din CLAUDE.md permite
    // numele si interzice valoarea, iar aici nu exista nicio valoare de scapat,
    // fiindca variabila lipseste.
    expect(d.reason).toContain("MAKE_WEBHOOK_URL");
    expect(d.reason).toContain("lipsește");
    expect(d.reason, "incarcarea a reusit si documentul este pastrat").toContain("păstrat");

    // PE ECRANUL DE INCARCARE, unde il vede operatorul. Propozitia codului vine
    // din EXTRACTION_ERROR_LABEL, deci testul citeste exact sirul care se
    // randeaza, si nu o a doua copie a lui.
    await page.goto("/incarca-comanda");
    const card = page.locator(`[data-testid="draft-card"][data-order-id="${orderId}"]`);
    await expect(card).toHaveCount(1, { timeout: 30_000 });
    await expect(card.getByTestId("draft-error-sentence")).toHaveText(
      EXTRACTION_ERROR_LABEL.config_error,
    );
    // SI MOTIVUL DE PE RAND, sub ea. Constatarea cere ca eroarea sa fie vizibila
    // si sa vina din extraction_drafts.reason, deci se afirma ca ecranul arata
    // chiar textul stocat, si nu unul construit in componenta.
    await expect(card.getByTestId("draft-reason")).toHaveText(String(d.reason));

    // NICIUN SIR ENGLEZESC PE ECRAN, sectiunea 11 din CLAUDE.md. Tokenul brut al
    // codului nu are voie sa fie textul vazut; el traieste numai in atribut.
    await expect(card.getByTestId("draft-error-sentence")).not.toHaveText(/config_error/);
    await expect(card.getByTestId("draft-error-sentence")).toHaveAttribute(
      "data-error-code",
      "config_error",
    );
  });

  test("2. P3-71 R-202: config_error NU intra in multimea de pe sarma, deci ruta de callback il refuza la fel ca inainte", async ({
    request,
  }) => {
    // DE CE ACEST CAZ EXISTA. Ruta app/api/extraction/callback/route.ts este
    // INGHETATA prin hotararea R-202: nimic nu are voie sa schimbe ce accepta, ce
    // refuza sau ce raspunde, textele de eroare incluse. Ea verifica payload-ul
    // prin isExtractionErrorCode, adica prin EXTRACTION_ERROR_CODES, asa ca a
    // adauga acolo eticheta noua ar fi transformat un callback care o poarta
    // dintr-un 400 intr-un payload acceptat. Eticheta a fost tinuta in afara, in
    // LOCAL_ERROR_CODES, si cazul acesta dovedeste ca a fost tinuta afara pe
    // bune: o promisiune scrisa intr-un raport nu se poate rula.
    expect(
      (EXTRACTION_ERROR_CODES as readonly string[]).includes("config_error"),
      "multimea inchisa a sectiunii 5.2 ramane exact cea dinainte",
    ).toBe(false);
    expect(EXTRACTION_ERROR_CODES).toHaveLength(9);

    // SI RUTA CHIAR REFUZA, cu acelasi 400 si acelasi text ca pana acum. Se
    // trimite cu secretul corect, ca refuzul sa fie despre cod si nu despre
    // autentificare.
    const r = await request.post(CALLBACK, {
      headers: {
        "x-rc-callback-secret": MAKE_CALLBACK_SECRET,
        "content-type": "application/json",
      },
      data: {
        order_id: "f3000000-0000-4000-8000-0000000000ff",
        status: "failed",
        error_code: "config_error",
        reason: "nu are voie sa vina de pe sarma",
        lines: [],
      },
    });
    expect(r.status(), "un cod din afara multimii contractului este 400, ca inainte").toBe(400);
    expect((await r.json()).error).toBe("error_code in afara multimii");
  });
});
