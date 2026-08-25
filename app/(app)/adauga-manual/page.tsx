"use client";

// RC-05 Adaugare manuala.
//
// Este acelasi formular ca la verificarea din RC-04, pornit gol. Nu exista o a
// doua componenta: daca ar exista, cele doua ar diverge si demonstratia ar
// spune doua povesti diferite despre aceleasi date. Rostul ecranului este sa
// arate clientului ca exista un drum de intrare care nu depinde de citirea
// automata, pentru furnizorul care nu trimite nimic utilizabil.

import * as React from "react";
import Link from "next/link";
import { Button, Card, Chip, PageHeader } from "@/components/ui/primitives";
import { EMPTY_INITIAL, OrderForm, newLine } from "@/components/orders/OrderForm";
import { formatDate } from "@/lib/mock";
import type { InboundOrder } from "@/lib/mock";

export default function ManualAddPage() {
  const [created, setCreated] = React.useState<InboundOrder | null>(null);
  // Cheia reseteaza formularul la starea goala dupa fiecare comanda introdusa.
  const [formKey, setFormKey] = React.useState(0);

  if (created) {
    return (
      <>
        <PageHeader title="Comandă adăugată" lead="Comanda a intrat în lista de intrări." />
        <Card className="max-w-[720px]">
          <div className="px-7 py-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-rc-ok-soft text-rc-ok grid place-items-center text-[22px]">
              ✓
            </div>
            <p className="mt-4 text-[17px] font-bold text-rc-black">{created.reference}</p>
            <p className="text-[13.5px] text-rc-muted mt-1.5">
              Introdusă manual, cu {created.lines.length}{" "}
              {created.lines.length === 1 ? "poziție" : "poziții"}. Livrare estimată{" "}
              {formatDate(created.expectedAt)}.
            </p>
            <div className="mt-4 flex justify-center">
              <Chip tone="warn">În așteptare</Chip>
            </div>
            <div className="mt-6 flex items-center justify-center gap-2.5">
              <Link href="/comenzi">
                <Button>Vezi comanda în listă</Button>
              </Link>
              <Button
                variant="secondary"
                onClick={() => {
                  setCreated(null);
                  setFormKey((k) => k + 1);
                }}
              >
                Adaugă altă comandă
              </Button>
            </div>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Adăugare manuală"
        lead="Aceeași fișă ca la verificarea unei comenzi încărcate, doar că pornește goală. Pentru furnizorii care nu trimit un document pe care sistemul să îl poată citi."
        actions={
          <Link href="/incarca-comanda">
            <Button variant="secondary">Am totuși un document</Button>
          </Link>
        }
      />
      <OrderForm
        key={formKey}
        initial={{ ...EMPTY_INITIAL, lines: [newLine()] }}
        mode="manual"
        onConfirmed={setCreated}
      />
    </>
  );
}
