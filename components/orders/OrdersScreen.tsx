"use client";

// P2-04 Comenzi.
//
// Un singur ecran cu ambele sensuri ale miscarii: intrari si iesiri, una langa
// alta. Deschiderea unei comenzi arata pozitiile si istoricul de stari, pentru
// ca asta face ciclul de viata lizibil, nu eticheta singura.
//
// Trecerea unei intrari in Recepționată este ce creeaza loturile, iar legatura
// aceasta este scrisa pe ecran, nu doar in date.
//
// Ambele coloane citesc acum din baza de date: intrarile de la P2-04, iesirile
// de la P2-05. Stratul demonstrativ nu mai este folosit de acest ecran.
//
// Deliberat neconstruit: receptii partiale si expedieri partiale. Statusurile
// sunt la nivel de comanda intreaga.

import * as React from "react";
import { Card, CardHeader, Chip, PageHeader } from "@/components/ui/primitives";
import type { ChipTone } from "@/components/ui/primitives";
import { formatDate, formatMoney } from "@/lib/data/format";
import { INBOUND_STATUS_LABEL } from "@/lib/data/inbound-types";
import type { InboundOrder } from "@/lib/data/inbound-types";
import { OUTBOUND_STATUS_LABEL } from "@/lib/data/outbound-types";
import type { OutboundIssue } from "@/lib/data/outbound-types";
import { InboundPanel } from "./InboundPanel";
import { OutboundPanel } from "./OutboundPanel";

type Selection = { kind: "in"; id: string } | { kind: "out"; id: string } | null;

const inboundTone = (s: string): ChipTone => (s === "arrived" ? "ok" : "warn");
const outboundTone = (s: string): ChipTone => (s === "shipped" ? "ok" : "warn");

export function OrdersScreen({
  inbound,
  outbound,
}: {
  inbound: InboundOrder[];
  outbound: OutboundIssue[];
}) {
  const [sel, setSel] = React.useState<Selection>(null);

  const pendingIn = inbound.filter((o) => o.status === "pending_arrival").length;
  const pendingOut = outbound.filter((o) => o.status === "awaiting_shipment").length;

  const selectedIn = sel?.kind === "in" ? inbound.find((o) => o.id === sel.id) ?? null : null;
  const selectedOut = sel?.kind === "out" ? outbound.find((o) => o.id === sel.id) ?? null : null;

  return (
    <>
      <PageHeader
        title="Comenzi"
        lead="Intrările și ieșirile una lângă alta. Apasă pe o comandă pentru poziții și istoricul stărilor."
      />

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader
            title="Intrări"
            hint="Comenzi către furnizori"
            right={
              <span className="text-[12px] text-rc-muted" data-testid="inbound-count">
                {pendingIn} în așteptare din {inbound.length}
              </span>
            }
          />
          <ul data-testid="inbound-list">
            {inbound.map((o, i) => (
              <li key={o.id} className={i < inbound.length - 1 ? "border-b border-rc-line" : ""}>
                <button
                  onClick={() => setSel({ kind: "in", id: o.id })}
                  data-testid="inbound-item"
                  data-reference={o.reference}
                  className={[
                    "w-full text-left px-5 py-3.5 transition-colors",
                    sel?.kind === "in" && sel.id === o.id
                      ? "bg-rc-orange-soft"
                      : "hover:bg-rc-paper",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13.5px] font-semibold text-rc-black">{o.reference}</span>
                    <Chip tone={inboundTone(o.status)}>{INBOUND_STATUS_LABEL[o.status]}</Chip>
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-1">
                    <span className="text-[12.5px] text-rc-muted truncate">
                      {o.supplierName ?? "Fără furnizor"}
                    </span>
                    <span className="rc-num text-[12.5px] text-rc-muted shrink-0">
                      {formatMoney(o.totalMdl)}
                    </span>
                  </div>
                  <p className="text-[11.5px] text-rc-muted-2 mt-1">
                    {o.lines.length} {o.lines.length === 1 ? "poziție" : "poziții"} ·{" "}
                    {o.arrivedAt
                      ? `recepționată ${formatDate(o.arrivedAt)}`
                      : `estimat ${formatDate(o.expectedAt)}`}
                    {o.documentPath ? " · document atașat" : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          {inbound.length === 0 ? (
            <p
              className="px-5 py-12 text-center text-[13px] text-rc-muted"
              data-testid="inbound-empty"
            >
              Nicio comandă de intrare încă. Adaugă una manual sau încarcă un document.
            </p>
          ) : null}
        </Card>

        <Card>
          <CardHeader
            title="Ieșiri"
            hint="Eliberări către proiecte"
            right={
              <span className="text-[12px] text-rc-muted">
                {pendingOut} de expediat din {outbound.length}
              </span>
            }
          />
          <ul data-testid="outbound-list">
            {outbound.map((o, i) => (
              <li key={o.id} className={i < outbound.length - 1 ? "border-b border-rc-line" : ""}>
                <button
                  onClick={() => setSel({ kind: "out", id: o.id })}
                  data-testid="outbound-item"
                  data-reference={o.reference}
                  className={[
                    "w-full text-left px-5 py-3.5 transition-colors",
                    sel?.kind === "out" && sel.id === o.id
                      ? "bg-rc-orange-soft"
                      : "hover:bg-rc-paper",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13.5px] font-semibold text-rc-black">{o.reference}</span>
                    <Chip tone={outboundTone(o.status)}>{OUTBOUND_STATUS_LABEL[o.status]}</Chip>
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-1">
                    <span className="text-[12.5px] text-rc-black truncate">{o.projectName}</span>
                  </div>
                  <p className="text-[11.5px] text-rc-muted-2 mt-1">
                    {o.clientName} · {o.lines.length}{" "}
                    {o.lines.length === 1 ? "poziție" : "poziții"} ·{" "}
                    {o.shippedAt
                      ? `expediată ${formatDate(o.shippedAt)}`
                      : `emis ${formatDate(o.issuedAt)}`}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          {outbound.length === 0 ? (
            <p
              className="px-5 py-12 text-center text-[13px] text-rc-muted"
              data-testid="outbound-empty"
            >
              Nicio ieșire încă. Creează un bon de eliberare din ecranul Ieșiri.
            </p>
          ) : null}
        </Card>
      </div>

      <p className="mt-4 text-[12px] text-rc-muted-2 max-w-[80ch] leading-relaxed">
        Stările sunt la nivel de comandă întreagă. Recepțiile parțiale și expedierile parțiale sunt
        în afara domeniului fazei 2.
      </p>

      {selectedIn ? <InboundPanel order={selectedIn} onClose={() => setSel(null)} /> : null}
      {selectedOut ? <OutboundPanel issue={selectedOut} onClose={() => setSel(null)} /> : null}
    </>
  );
}
