#!/usr/bin/env node
// Serverul fals de Resend, pornit de Playwright alaturi de serverul de
// dezvoltare.
//
// DE CE UN SERVER SI NU O RAMURA "IF TEST" IN APLICATIE. Cardul P2-10 cere
// acceptanta cu Resend "mocked", si cere ca niciun email sa nu plece catre o
// adresa reala. O ramura de test in lib/reminders/resend.ts ar fi lasat
// netestata exact partea care poate cadea in productie: cererea HTTP, antetele,
// citirea raspunsului si tratarea unui raspuns non-2xx. Aici aplicatia face
// cererea adevarata, doar ca RESEND_BASE_URL arata catre 127.0.0.1, deci nimic
// nu pleaca de pe masina.
//
// ESECUL SE CERE PRIN CONTINUTUL MESAJULUI, NU PRINTR-UN COMUTATOR. Orice mesaj
// al carui corp contine marcajul de mai jos primeste 500. Asa testul care
// verifica inregistrarea unui esec nu are nevoie de nicio ramura in aplicatie:
// isi da produsului un SKU care poarta marcajul, iar SKU-ul ajunge in corpul
// emailului fiindca asa cere cardul.
//
// NU PORNESTE NIMIC IN CI IN AFARA SUITEI. Playwright il porneste si il opreste.

import { createServer } from "node:http";

const PORT = Number(process.env.RESEND_MOCK_PORT ?? 3199);

/** Marcajul care cere un raspuns de eroare. Vezi antetul.
 *  Valoarea vine din mediu, de la playwright.config.ts, care o ia din
 *  tests/e2e/support/resend.ts. Implicitul de aici exista doar ca fisierul sa
 *  poata fi pornit de mana. */
const FAIL_MARKER = process.env.RESEND_MOCK_FAIL_MARKER ?? "RESEND-MOCK-FAIL";

/** Mesajele acceptate, in ordinea sosirii. Doar cele care au primit 200. */
const sent = [];
/** Mesajele refuzate deliberat, pastrate ca sa se poata verifica incercarea. */
const refused = [];

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

  if (req.method === "GET" && url.pathname === "/__health") {
    return json(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/__sent") {
    return json(res, 200, { sent, refused });
  }

  if (req.method === "DELETE" && url.pathname === "/__sent") {
    sent.length = 0;
    refused.length = 0;
    return json(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/emails") {
    const raw = await readBody(req);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json(res, 400, { message: "corp invalid" });
    }

    const record = {
      at: new Date().toISOString(),
      from: String(body?.from ?? ""),
      to: Array.isArray(body?.to) ? body.to.map(String) : [],
      subject: String(body?.subject ?? ""),
      text: String(body?.text ?? ""),
      // Antetul de autorizare NU se pastreaza si nu se raporteaza. Este o cheie,
      // chiar si una falsa, si un fisier de raport nu are ce face cu ea.
      authorized: typeof req.headers.authorization === "string",
    };

    const haystack = `${record.subject}\n${record.text}`;
    if (haystack.includes(FAIL_MARKER)) {
      refused.push(record);
      return json(res, 500, { message: "mock: mesaj refuzat deliberat" });
    }

    sent.push(record);
    return json(res, 200, { id: `mock-${sent.length}` });
  }

  return json(res, 404, { message: "ruta necunoscuta" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`resend-mock ascultă pe http://127.0.0.1:${PORT}`);
});
