#!/usr/bin/env node
// Serverul fals al scenariului Make, pornit de Playwright alaturi de serverul de
// dezvoltare. Acelasi tipar ca resend-mock.mjs si pentru acelasi motiv.
//
// APLICATIA FACE FETCH-UL REAL. MAKE_WEBHOOK_URL arata catre 127.0.0.1, deci
// cererea, antetele si tratarea unui raspuns non-2xx sunt exercitate exact ca
// in productie, si nimic nu pleaca de pe masina. O ramura "if TEST" in
// lib/data/extraction-fire.ts ar fi lasat netestata tocmai partea care poate
// cadea in productie.
//
// Serverul NU trimite singur callback-ul. Testul il trimite, cu payload-ul pe
// care vrea sa il verifice, direct catre endpointul aplicatiei. Asa fiecare caz
// din cele opt controleaza exact ce ajunge la receptor.

import { createServer } from "node:http";

const PORT = Number(process.env.MAKE_MOCK_PORT ?? 3198);

/** Cererile primite, in ordine. Testul le citeste prin GET /__fired. */
const fired = [];

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(""));
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);

  if (req.method === "GET" && url.pathname === "/__health") return json(res, 200, { ok: true });
  if (req.method === "GET" && url.pathname === "/__fired") return json(res, 200, { fired });
  if (req.method === "DELETE" && url.pathname === "/__fired") {
    fired.length = 0;
    return json(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/webhook") {
    const raw = await readBody(req);
    let body = null;
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
    fired.push({
      at: new Date().toISOString(),
      // Antetul secret se raporteaza ca PREZENT SAU NU, niciodata ca valoare.
      // Un fisier de raport nu are ce face cu un secret, nici cu unul fals.
      hasSecretHeader: typeof req.headers["x-rc-secret"] === "string",
      // Cheile primite, ca testul sa poata verifica "exact sase campuri si
      // nimic altceva" fara ca serverul sa pastreze URL-ul semnat.
      keys: body && typeof body === "object" ? Object.keys(body).sort() : [],
      orderId: body?.order_id ?? null,
      documentFilename: body?.document_filename ?? null,
      mimeType: body?.mime_type ?? null,
      sizeBytes: body?.size_bytes ?? null,
      hasDocumentUrl: typeof body?.document_url === "string" && body.document_url.length > 0,
      callbackUrl: body?.callback_url ?? null,
    });
    return json(res, 200, { accepted: true });
  }

  return json(res, 404, { message: "ruta necunoscuta" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`make-mock asculta pe http://127.0.0.1:${PORT}`);
});
