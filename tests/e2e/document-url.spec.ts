import { expect, test, type APIRequestContext } from "@playwright/test";
import { DOCS_BUCKET } from "@/lib/data/inbound-types";

// document-url.spec - linia de acceptanta a cardului EXT-08.
//
// CE DOVEDESTE. Ca cele trei cai de esec ale legaturii catre document raspund
// cu statusul si codul din docs/contracts/document-url.md, si ca NICIUNA nu
// raspunde vreodata cu text/html.
//
// DE CE TREBUIE SA FIE UN TEST SI NU O CAPTURA IN RAPORT. Capturile din raport
// spun ce s-a intamplat o data, pe 2 septembrie. Trei lucruri obisnuite le-ar
// intoarce in tacere in pagini HTML: scoaterea exceptiei /api/documents din
// proxy.ts, care ar reda o redirectare catre ecranul de autentificare; o
// exceptie nerezolvata in ruta, care ar reda pagina de eroare a lui Next;
// stergerea fisierului app/api/documents/route.ts, care ar reda pagina 404 a lui
// Next pe prefixul gol. Fiecare dintre cele trei are aici cazul lui.
//
// STOCAREA ESTE CEA REALA. Stiva Supabase locala ruleaza acelasi server de
// stocare ca proiectul din productie, si legaturile se semneaza prin acelasi
// createSignedUrl pe care il foloseste aplicatia. Nimic nu este mocat.

const BASE = "/api/documents";

/** Un PDF minuscul, valid cat sa fie stocat si servit inapoi octet cu octet. */
const PDF = Buffer.from("%PDF-1.4\n% ext-08 fixture\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n");

/**
 * Stocarea se conduce prin API-ul HTTP al lui Storage, DIRECT, fara supabase-js.
 *
 * DE CE FARA CLIENT. supabase-js construieste un client de realtime care cere un
 * WebSocket global. Node 22 il are; node 20, versiunea pe care o fixeaza
 * .github/workflows/quality.yml, NU. Prima versiune a acestui fisier folosea
 * clientul, trecea la fiecare rulare locala si cadea in CI cu "Node.js detected
 * but native WebSocket not found" pe toate cele patru cazuri care ating stocarea.
 *
 * Nu este numai o reparatie. Contractul din docs/contracts/document-url.md este
 * despre HTTP, iar un test care il verifica prin HTTP verifica exact ce vede
 * cealalta parte, in loc sa verifice ce face o biblioteca de client din el.
 * Calea de semnare este aceeasi in ambele cazuri: POST /storage/v1/object/sign.
 *
 * DACA CHEIA LIPSESTE, TESTUL CADE. Nu sare. Un test care sare cand nu isi
 * gaseste o conditie raporteaza ca "nu era nimic de facut", ceea ce arata
 * identic cu "totul este in regula", si asta este exact clasa de defect pe care
 * docs/LEARNINGS.md o numeste la intrarea despre potriviri care nu se potrivesc.
 */
function storage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "document-url.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL si SUPABASE_SERVICE_ROLE_KEY. " +
        "In CI sunt exportate de pasul 'Export local Supabase credentials'. Local: supabase status -o env.",
    );
  }
  const origin = new URL(url).origin;
  const auth = { Authorization: `Bearer ${key}`, apikey: key };

  async function must(label: string, response: Response) {
    if (!response.ok) {
      throw new Error(`${label} a raspuns ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    return response;
  }

  return {
    async upload(objectPath: string) {
      await must(
        "upload",
        await fetch(`${origin}/storage/v1/object/${DOCS_BUCKET}/${objectPath}`, {
          method: "POST",
          headers: { ...auth, "Content-Type": "application/pdf", "x-upsert": "true" },
          body: PDF,
        }),
      );
    },
    async sign(objectPath: string, expiresIn: number) {
      const response = await must(
        "sign",
        await fetch(`${origin}/storage/v1/object/sign/${DOCS_BUCKET}/${objectPath}`, {
          method: "POST",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({ expiresIn }),
        }),
      );
      // signedURL vine relativ, incepand cu /object/sign/...
      const { signedURL } = (await response.json()) as { signedURL: string };
      return new URL(`${origin}/storage/v1${signedURL}`).toString();
    },
    async remove(objectPath: string) {
      await must(
        "delete",
        await fetch(`${origin}/storage/v1/object/${DOCS_BUCKET}/${objectPath}`, {
          method: "DELETE",
          headers: auth,
        }),
      );
    },
  };
}

/** Din legatura semnata de Supabase se pastreaza numai jetonul si calea. */
function parts(signedUrl: string): { objectPath: string; token: string } {
  const u = new URL(signedUrl);
  const objectPath = u.pathname.replace("/storage/v1/object/sign/", "");
  const token = u.searchParams.get("token") ?? "";
  expect(token, "legatura semnata trebuie sa poarte un jeton").not.toBe("");
  return { objectPath, token };
}

/** Cade daca raspunsul este HTML sub orice forma, inclusiv una cu status 200. */
async function neverHtml(response: { headers(): Record<string, string>; text(): Promise<string> }) {
  const type = response.headers()["content-type"] ?? "";
  expect(type, `content-type a fost "${type}"`).toContain("application/json");
  const body = await response.text();
  expect(body.toLowerCase()).not.toContain("<!doctype");
  expect(body.toLowerCase()).not.toContain("<html");
}

async function failureBody(request: APIRequestContext, url: string) {
  const response = await request.get(url);
  await neverHtml(response);
  return { response, json: (await response.json()) as { code?: string; error?: string } };
}

test.describe("EXT-08: contractul de esec al legaturii catre document", () => {
  test("1. o legatura valida serveste documentul, si asta este martorul", async ({ request }) => {
    const sb = storage();
    const path = `_ext08/control-${Date.now()}.pdf`;
    await sb.upload(path);
    const { objectPath, token } = parts(await sb.sign(path, 3600));

    const response = await request.get(`${BASE}/${objectPath}?token=${token}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/pdf");
    expect(Buffer.from(await response.body())).toEqual(PDF);
  });

  test("2. jeton expirat: 400, application/json, EXPIRED_TOKEN", async ({ request }) => {
    const sb = storage();
    const path = `_ext08/expired-${Date.now()}.pdf`;
    await sb.upload(path);
    const { objectPath, token } = parts(await sb.sign(path, 1));

    await new Promise((r) => setTimeout(r, 2500));

    const { response, json } = await failureBody(request, `${BASE}/${objectPath}?token=${token}`);
    expect(response.status()).toBe(400);
    expect(json.code).toBe("EXPIRED_TOKEN");
  });

  test("3. jeton falsificat: 401, application/json, INVALID_TOKEN", async ({ request }) => {
    const sb = storage();
    const path = `_ext08/invalid-${Date.now()}.pdf`;
    await sb.upload(path);
    const { objectPath, token } = parts(await sb.sign(path, 3600));

    // Semnatura stricata, payload-ul intact: `exp` ramane in viitor, deci
    // singurul raspuns corect este INVALID si nu EXPIRED. Aceasta este exact
    // distinctia pe care Storage nu o face.
    const tampered = token.slice(0, -6) + "AAAAAA";

    const { response, json } = await failureBody(request, `${BASE}/${objectPath}?token=${tampered}`);
    expect(response.status()).toBe(401);
    expect(json.code).toBe("INVALID_TOKEN");
  });

  test("4. obiect inexistent: 404, application/json, OBJECT_NOT_FOUND", async ({ request }) => {
    const sb = storage();
    const path = `_ext08/gone-${Date.now()}.pdf`;
    await sb.upload(path);
    const { objectPath, token } = parts(await sb.sign(path, 3600));

    // Jetonul ramane valabil, obiectul dispare de sub el. Aceasta este singura
    // cale prin care Storage raspunde NoSuchKey pe o legatura semnata.
    await sb.remove(path);

    const { response, json } = await failureBody(request, `${BASE}/${objectPath}?token=${token}`);
    expect(response.status()).toBe(404);
    expect(json.code).toBe("OBJECT_NOT_FOUND");
  });

  test("5. fara jeton: 401 in JSON, nu o redirectare catre autentificare", async ({ request }) => {
    const { response, json } = await failureBody(request, `${BASE}/${DOCS_BUCKET}/_ext08/x.pdf`);
    expect(response.status()).toBe(401);
    expect(json.code).toBe("INVALID_TOKEN");
  });

  test("6. o cale fara extensie trece tot pe langa proxy", async ({ request }) => {
    // Matcher-ul lui proxy.ts exclude caile care se termina in ".pdf". Un obiect
    // fara extensie NU este exclus si ajunge la proxy, deci acest caz este
    // singurul care dovedeste ca exceptia din isPublic() chiar exista. Fara ea,
    // raspunsul ar fi 307 catre /login si, urmarit, 200 text/html.
    const { response, json } = await failureBody(request, `${BASE}/${DOCS_BUCKET}/_ext08/fara-extensie`);
    expect(response.status()).toBe(401);
    expect(json.code).toBe("INVALID_TOKEN");
  });

  test("7. prefixul gol raspunde 404 in JSON, nu cu pagina 404 a lui Next", async ({ request }) => {
    const { response, json } = await failureBody(request, BASE);
    expect(response.status()).toBe(404);
    expect(json.code).toBe("OBJECT_NOT_FOUND");
  });

  test("8. o metoda in afara de GET: 405 in JSON", async ({ request }) => {
    const response = await request.post(`${BASE}/${DOCS_BUCKET}/_ext08/x.pdf`);
    await neverHtml(response);
    expect(response.status()).toBe(405);
    expect(((await response.json()) as { code?: string }).code).toBe("METHOD_NOT_ALLOWED");
  });
});
