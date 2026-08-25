"use client";

// Ecranul de introducere manuala: fisa comenzii, apoi confirmarea, apoi
// incarcarea optionala a documentului.
//
// Documentul se incarca DUPA ce comanda exista, nu inainte, pentru ca fisierul
// se aseaza la calea inbound/<order_id>/<nume>, iar id-ul nu exista pana cand
// comanda nu a fost scrisa. Ordinea este si mai sigura: un fisier incarcat
// pentru o comanda care apoi esueaza ar ramane in bucket fara nimic care sa il
// refere.

import * as React from "react";
import Link from "next/link";
import { Button, Card, Chip, PageHeader } from "@/components/ui/primitives";
import { EMPTY_INITIAL, InboundOrderForm } from "./InboundOrderForm";
import { OrderDocumentUpload } from "./OrderDocumentUpload";
import type { CatalogProduct } from "@/lib/data/products";

type Created = { id: string; reference: string; lineCount: number };

export function ManualOrderScreen({
  products,
  suppliers,
}: {
  products: CatalogProduct[];
  suppliers: string[];
}) {
  const [created, setCreated] = React.useState<Created | null>(null);
  // Cheia reseteaza formularul la starea goala dupa fiecare comanda introdusa.
  const [formKey, setFormKey] = React.useState(0);

  if (created) {
    return (
      <>
        <PageHeader title="Comandă adăugată" lead="Comanda a intrat în lista de intrări." />
        <Card className="max-w-[720px]">
          <div className="px-7 py-8 text-center" data-testid="order-created">
            <div className="mx-auto w-12 h-12 rounded-full bg-rc-ok-soft text-rc-ok grid place-items-center text-[22px]">
              ✓
            </div>
            <p className="mt-4 text-[17px] font-bold text-rc-black" data-testid="created-reference">
              {created.reference}
            </p>
            <p className="text-[13.5px] text-rc-muted mt-1.5">
              Introdusă manual, cu {created.lineCount}{" "}
              {created.lineCount === 1 ? "poziție" : "poziții"}.
            </p>
            <div className="mt-4 flex justify-center">
              <Chip tone="warn">În așteptare</Chip>
            </div>
            <div className="mt-6 flex items-center justify-center gap-2.5">
              <Link href="/comenzi">
                <Button data-testid="go-to-orders">Vezi comanda în listă</Button>
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

          <div className="border-t border-rc-line px-7 py-6">
            <p className="text-[13.5px] font-semibold text-rc-black">
              Atașează documentul furnizorului (opțional)
            </p>
            <p className="text-[12.5px] text-rc-muted mt-1 mb-3 max-w-[60ch]">
              Confirmarea de comandă, ca PDF, PNG sau JPG, până în 10 MB. Se salvează într-un
              depozit privat și se poate deschide numai printr-o legătură semnată, cu viață scurtă.
            </p>
            <OrderDocumentUpload orderId={created.id} />
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Adaugă comandă manual"
        lead="Aceeași fișă ca la verificarea unui document încărcat, pornită goală. Pentru furnizorul care nu trimite nimic de citit."
      />
      <InboundOrderForm
        key={formKey}
        initial={EMPTY_INITIAL}
        mode="manual"
        products={products}
        suppliers={suppliers}
        onCreated={setCreated}
      />
    </>
  );
}
