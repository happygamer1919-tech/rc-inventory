"use client";

// P3-112, goal G68. Butonul Reactivează de pe un rand al vederii Inactivi.
//
// ACEEASI CALE CA BUTONUL DIN ANTETUL FISEI, setClientActive, si nu o copie a ei:
// asa cele doua nu pot sa se departeze, si asa un rand de lista nu are nevoie de
// campurile pe care nu le are. Comentariul functiei scrie de ce nu se apeleaza
// updateClientRecord de aici.
//
// UN RAND PE APASARE, NICIODATA O MULTIME. Nu exista "reactiveaza toti": cine
// reactiveaza pe cineva se uita la numele lui in clipa aceea.
//
// STAREA DE ASTEPTARE ESTE A RANDULUI, iar propozitia de dupa apasare este A
// ECRANULUI, pentru ca randul dispare din lista in aceeasi clipa: dupa reactivare
// omul nu mai este dezactivat, deci nu mai are ce sa caute in vederea Inactivi. O
// confirmare scrisa in rand ar pleca impreuna cu randul si nu ar fi citita. De aceea
// componentul acesta nu deseneaza nicio propozitie: o trimite sus, prin onDone.

import * as React from "react";
import { Button } from "@/components/ui/primitives";
import { setClientActive } from "@/lib/data/client-actions";

export function ReactivateRowButton({
  id,
  name,
  onDone,
  onFailed,
}: {
  id: string;
  name: string;
  /** Reactivat: ecranul scrie propozitia si reciteste lista. */
  onDone: (name: string) => void;
  /** Refuzat: ecranul arata refuzul, in cuvintele actiunii. */
  onFailed: (message: string) => void;
}) {
  const [pending, setPending] = React.useState(false);

  async function reactivate() {
    setPending(true);
    const result = await setClientActive(id, true);
    setPending(false);
    if (!result.ok) {
      onFailed(result.message);
      return;
    }
    onDone(name);
  }

  return (
    <Button
      size="sm"
      onClick={reactivate}
      disabled={pending}
      data-testid="inactivi-reactivate"
      data-id={id}
    >
      {pending ? "Se reactivează..." : "Reactivează"}
    </Button>
  );
}
