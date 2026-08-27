"use client";

// Ecranul "Încarcă comandă". Aceeasi fisa ca la introducerea manuala, plus o
// explicatie despre ce se intampla cu documentul si ce urmeaza.
//
// Documentul se ataseaza DUPA ce comanda exista, pentru ca fisierul se aseaza la
// calea inbound/<order_id>/<nume> si id-ul nu exista mai devreme.

import * as React from "react";
import Link from "next/link";
import { Button, Card, Chip, PageHeader } from "@/components/ui/primitives";
import { EMPTY_INITIAL, InboundOrderForm } from "./InboundOrderForm";
import { OrderDocumentUpload } from "./OrderDocumentUpload";
import type { CatalogProduct } from "@/lib/data/products";

type Created = { id: string; reference: string; lineCount: number };

export function UploadOrderScreen({
  products,
  suppliers,
}: {
  products: CatalogProduct[];
  suppliers: string[];
}) {
  const [created, setCreated] = React.useState<Created | null>(null);
  const [formKey, setFormKey] = React.useState(0);

  if (created) {
    return (
      <>
        <PageHeader
          title="Comandă creată"
          lead="Atașează documentul furnizorului ca să rămână legat de comandă."
        />
        <Card className="max-w-[720px]">
          <div className="px-7 py-8 text-center" data-testid="order-created">
            <div className="mx-auto w-12 h-12 rounded-full bg-rc-ok-soft text-rc-ok grid place-items-center text-[22px]">
              ✓
            </div>
            <p className="mt-4 text-[17px] font-bold text-rc-black" data-testid="created-reference">
              {created.reference}
            </p>
            <p className="text-[13.5px] text-rc-muted mt-1.5">
              {created.lineCount} {created.lineCount === 1 ? "poziție" : "poziții"}.
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
                Încarcă altă comandă
              </Button>
            </div>
          </div>

          <div className="border-t border-rc-line px-7 py-6">
            <p className="text-[13.5px] font-semibold text-rc-black">Documentul furnizorului</p>
            <p className="text-[12.5px] text-rc-muted mt-1 mb-3 max-w-[60ch]">
              PDF, PNG sau JPG, până în 10 MB. Se salvează într-un depozit privat și se poate
              deschide numai printr-o legătură semnată, cu viață scurtă.
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
        title="Încarcă comandă"
        lead="Completează comanda, apoi atașează documentul primit de la furnizor."
        actions={<Chip tone="neutral">Sau completează manual, mai jos</Chip>}
      />

      <Card className="mb-4">
        <div className="px-5 py-4" data-testid="upload-explainer">
          <p className="text-[13px] text-rc-muted leading-relaxed max-w-[80ch]">
            Documentul se salvează real, în depozitul privat, și rămâne atașat comenzii. Citirea
            automată a conținutului este panoul de mai sus: acolo comanda se creează din document,
            după ce verifici ce s-a extras. Aici comanda se tastează întâi, exact ca la{" "}
            <Link href="/adauga-manual" className="font-semibold text-rc-orange-deep hover:underline">
              adăugarea manuală
            </Link>
            .
          </p>
        </div>
      </Card>

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
