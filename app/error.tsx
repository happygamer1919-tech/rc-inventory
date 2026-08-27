"use client";

// P2-11. Ecranul 500, in romana.
//
// COMPONENT DE CLIENT, fiindca Next cere asta pentru o granita de eroare: ea
// primeste eroarea si functia de reincercare, si amandoua trec prin browser.
//
// CE NU AJUNGE PE ECRAN: mesajul erorii. In productie Next il inlocuieste
// oricum cu un digest, dar granita ar afisa textul intreg in dezvoltare, iar un
// mesaj de la baza de date poarta nume de tabele, de coloane si uneori bucati de
// interogare. Ce se afiseaza este digestul, care este exact ce cauta cineva in
// jurnalul serverului, si nimic altceva.
//
// BUTONUL DE REINCERCARE ESTE PRIMUL LUCRU. Cele mai multe erori de randare de
// aici sunt o cerere cazuta catre baza de date, iar a doua incercare reuseste.

import Link from "next/link";
import * as React from "react";

export default function ErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Jurnalul serverului are deja eroarea intreaga. Aici se noteaza doar ca
    // ecranul a fost randat, cu digestul care le leaga.
    console.warn(`[eroare] Ecranul de eroare a fost randat. digest=${error.digest ?? "necunoscut"}`);
  }, [error.digest]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-rc-black px-6 py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-rc-danger" data-testid="error-code">
        500
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-rc-white" data-testid="error-screen">
        Ceva nu a mers
      </h1>
      <p className="mt-3 max-w-md text-sm text-rc-muted-2">
        Aplicația nu a putut afișa ecranul cerut. Datele tale nu au fost
        modificate. Încearcă din nou, iar dacă se repetă, spune-i
        administratorului codul de mai jos.
      </p>
      <p className="mt-3 font-mono text-xs text-rc-muted-2" data-testid="error-digest">
        {error.digest ?? "fără cod"}
      </p>
      <div className="mt-7 flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          data-testid="error-retry"
          className="rounded-lg bg-rc-orange px-4 py-2.5 text-sm font-semibold text-rc-black transition-colors hover:bg-rc-orange-dark"
        >
          Încearcă din nou
        </button>
        <Link
          href="/"
          data-testid="error-home"
          className="rounded-lg border border-rc-line-strong px-4 py-2.5 text-sm font-semibold text-rc-white transition-colors hover:bg-rc-black-2"
        >
          Înapoi la tabloul de bord
        </Link>
      </div>
    </main>
  );
}
