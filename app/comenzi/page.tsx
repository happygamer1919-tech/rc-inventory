"use client";

// RC-08 Comenzi.
//
// Un singur ecran cu ambele sensuri ale miscarii: intrari si iesiri, una langa
// alta. Deschiderea unei comenzi arata pozitiile si istoricul de stari, pentru
// ca asta face ciclul de viata lizibil, nu eticheta singura.
//
// Trecerea unei intrari in Recepționată este ce creeaza loturile, iar legatura
// aceasta este scrisa pe ecran, nu doar in date.
//
// Deliberat neconstruit in faza 1: receptii partiale si expedieri partiale.
// Statusurile sunt la nivel de comanda intreaga. Daca clientul intreaba in
// timpul demonstratiei, raspunsul este ca este programat pentru faza 2, nu ca
// s-a uitat.

import * as React from "react";
import {
  Button,
  Card,
  CardHeader,
  Chip,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import type { ChipTone } from "@/components/ui/primitives";
import {
  formatDate,
  formatMoney,
  formatNumber,
  supplierName,
  unitLabel,
} from "@/lib/mock";
import type { InboundOrder, OutboundIssue } from "@/lib/mock";
import { useStore } from "@/lib/store";

type Selection = { kind: "in"; id: string } | { kind: "out"; id: string } | null;

const inboundTone = (s: string): ChipTone => (s === "Recepționată" ? "ok" : "warn");
const outboundTone = (s: string): ChipTone => (s === "Expediată" ? "ok" : "warn");

export default function OrdersPage() {
  const store = useStore();
  const [sel, setSel] = React.useState<Selection>(null);

  const inbound = [...store.inbound].sort((a, b) => b.orderedAt.localeCompare(a.orderedAt));
  const outbound = [...store.outbound].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));

  const pendingIn = inbound.filter((o) => o.status === "În așteptare").length;
  const pendingOut = outbound.filter((o) => o.status === "În așteptare expediere").length;

  const selectedIn = sel?.kind === "in" ? store.inbound.find((o) => o.id === sel.id) ?? null : null;
  const selectedOut = sel?.kind === "out" ? store.outbound.find((o) => o.id === sel.id) ?? null : null;

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
              <span className="text-[12px] text-rc-muted">
                {pendingIn} în așteptare din {inbound.length}
              </span>
            }
          />
          <ul>
            {inbound.map((o, i) => (
              <li key={o.id} className={i < inbound.length - 1 ? "border-b border-rc-line" : ""}>
                <button
                  onClick={() => setSel({ kind: "in", id: o.id })}
                  className={[
                    "w-full text-left px-5 py-3.5 transition-colors",
                    sel?.kind === "in" && sel.id === o.id ? "bg-rc-orange-soft" : "hover:bg-rc-paper",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13.5px] font-semibold text-rc-black">{o.reference}</span>
                    <Chip tone={inboundTone(o.status)}>{o.status}</Chip>
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-1">
                    <span className="text-[12.5px] text-rc-muted truncate">
                      {supplierName(o.supplierId)}
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
                  </p>
                </button>
              </li>
            ))}
          </ul>
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
          <ul>
            {outbound.map((o, i) => (
              <li key={o.id} className={i < outbound.length - 1 ? "border-b border-rc-line" : ""}>
                <button
                  onClick={() => setSel({ kind: "out", id: o.id })}
                  className={[
                    "w-full text-left px-5 py-3.5 transition-colors",
                    sel?.kind === "out" && sel.id === o.id ? "bg-rc-orange-soft" : "hover:bg-rc-paper",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13.5px] font-semibold text-rc-black">{o.reference}</span>
                    <Chip tone={outboundTone(o.status)}>{o.status}</Chip>
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-1">
                    <span className="text-[12.5px] text-rc-black truncate">{o.projectName}</span>
                  </div>
                  <p className="text-[11.5px] text-rc-muted-2 mt-1">
                    {o.clientName} · {o.lines.length}{" "}
                    {o.lines.length === 1 ? "poziție" : "poziții"} ·{" "}
                    {o.shippedAt ? `expediată ${formatDate(o.shippedAt)}` : `emis ${formatDate(o.issuedAt)}`}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <p className="mt-4 text-[12px] text-rc-muted-2 max-w-[80ch] leading-relaxed">
        Stările sunt la nivel de comandă întreagă. Recepțiile parțiale și expedierile parțiale sunt
        programate pentru faza 2.
      </p>

      {selectedIn ? <InboundPanel order={selectedIn} onClose={() => setSel(null)} /> : null}
      {selectedOut ? <OutboundPanel issue={selectedOut} onClose={() => setSel(null)} /> : null}
    </>
  );
}

/* ------------------------------------------------------------- invelis panou -- */

function Panel({
  title,
  subtitle,
  chip,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  chip: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <aside className="relative w-[640px] h-full bg-rc-white text-rc-black overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-rc-white text-rc-black border-b border-rc-line px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h2 className="text-[17px] font-bold">{title}</h2>
              {chip}
            </div>
            <p className="text-[12.5px] text-rc-muted mt-1">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Închide"
            className="shrink-0 w-8 h-8 rounded-[9px] text-rc-muted hover:bg-rc-paper hover:text-rc-black transition-colors"
          >
            ✕
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}

function History({ events }: { events: InboundOrder["history"] }) {
  return (
    <section className="px-6 py-5">
      <h3 className="text-[13.5px] font-bold mb-3">Istoricul stărilor</h3>
      <ol className="relative pl-5">
        <span className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-rc-line" />
        {events.map((e, i) => (
          <li key={`${e.at}-${i}`} className="relative pb-4 last:pb-0">
            <span
              className={[
                "absolute -left-5 top-1 w-[11px] h-[11px] rounded-full border-2 border-white",
                i === events.length - 1 ? "bg-rc-orange" : "bg-rc-muted-2",
              ].join(" ")}
            />
            <p className="text-[13px] font-semibold">{e.status}</p>
            <p className="rc-num text-[11.5px] text-rc-muted-2 mt-0.5">
              {e.at} · {e.by}
            </p>
            <p className="text-[12.5px] text-rc-muted mt-1 leading-relaxed">{e.note}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------ intrare -- */

function InboundPanel({ order, onClose }: { order: InboundOrder; onClose: () => void }) {
  const store = useStore();
  const batches = store.batches.filter((b) => b.inboundOrderId === order.id);
  const arrived = order.status === "Recepționată";

  return (
    <Panel
      title={order.reference}
      subtitle={`${supplierName(order.supplierId)} · ${order.currency} · comandat ${formatDate(order.orderedAt)}`}
      chip={<Chip tone={inboundTone(order.status)}>{order.status}</Chip>}
      onClose={onClose}
    >
      <div className="px-6 pt-5">
        <div className="rounded-[10px] border border-rc-line bg-rc-paper px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-[12.5px] font-semibold">
              {arrived ? "Marfa a fost recepționată" : "Marfa nu a sosit încă"}
            </p>
            <p className="text-[12px] text-rc-muted mt-0.5">
              {arrived
                ? `${batches.length} ${batches.length === 1 ? "lot creat" : "loturi create"} la recepție, pe ${formatDate(order.arrivedAt)}.`
                : "Recepția este momentul în care se creează loturile acestei comenzi."}
            </p>
          </div>
          {!arrived ? (
            <Button size="sm" onClick={() => store.receiveInbound(order.id)}>
              Marchează recepționată
            </Button>
          ) : null}
        </div>
      </div>

      <section className="px-6 pt-5">
        <h3 className="text-[13.5px] font-bold mb-2">Poziții</h3>
        <div className="rounded-[10px] border border-rc-line overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th>Produs</Th>
                <Th align="right">Cantitate</Th>
                <Th align="right">Preț ({order.currency})</Th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((l, i) => {
                const p = store.products.find((x) => x.id === l.productId);
                return (
                  <tr key={`${l.productId}-${i}`}>
                    <Td>
                      <span className="text-[12.5px] font-medium">{p?.name ?? l.productId}</span>
                      <span className="block rc-num text-[11.5px] text-rc-muted-2 mt-0.5">
                        {p?.sku}
                      </span>
                    </Td>
                    <Td align="right">
                      <span className="rc-num text-[12.5px] font-semibold whitespace-nowrap">
                        {formatNumber(l.quantity)} {p ? unitLabel(p.unit) : ""}
                      </span>
                    </Td>
                    <Td align="right">
                      <span className="rc-num text-[12.5px] whitespace-nowrap">
                        {formatNumber(l.unitPrice)}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
        <p className="text-right text-[12.5px] text-rc-muted mt-2">
          Valoare comandă:{" "}
          <span className="rc-num font-bold text-rc-black">{formatMoney(order.totalMdl)}</span>
        </p>
      </section>

      {arrived && batches.length > 0 ? (
        <section className="px-6 pt-5">
          <h3 className="text-[13.5px] font-bold mb-2">Loturi create de această recepție</h3>
          <div className="rounded-[10px] border border-rc-line overflow-hidden">
            <Table>
              <thead>
                <tr>
                  <Th>Lot</Th>
                  <Th>Produs</Th>
                  <Th align="right">Cantitate</Th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => {
                  const p = store.products.find((x) => x.id === b.productId);
                  return (
                    <tr key={b.id}>
                      <Td>
                        <span className="rc-num text-[12.5px] font-semibold">{b.id}</span>
                      </Td>
                      <Td>
                        <span className="text-[12.5px]">{p?.sku}</span>
                      </Td>
                      <Td align="right">
                        <span className="rc-num text-[12.5px] font-semibold whitespace-nowrap">
                          {formatNumber(b.quantity)} {p ? unitLabel(p.unit) : ""}
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        </section>
      ) : null}

      <History events={order.history} />
    </Panel>
  );
}

/* ------------------------------------------------------------------- iesire -- */

function OutboundPanel({ issue, onClose }: { issue: OutboundIssue; onClose: () => void }) {
  const store = useStore();
  const shipped = issue.status === "Expediată";

  return (
    <Panel
      title={issue.reference}
      subtitle={`${issue.projectName} · ${issue.clientName} · emis ${formatDate(issue.issuedAt)}`}
      chip={<Chip tone={outboundTone(issue.status)}>{issue.status}</Chip>}
      onClose={onClose}
    >
      <div className="px-6 pt-5">
        <div className="rounded-[10px] border border-rc-line bg-rc-paper px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-[12.5px] font-semibold">
              {shipped ? "Marfa a plecat către șantier" : "Marfa este pregătită, dar nu a plecat"}
            </p>
            <p className="text-[12px] text-rc-muted mt-0.5">
              {shipped
                ? `Expediată pe ${formatDate(issue.shippedAt)}. Stocul a fost scăzut.`
                : "La expediere, stocul produselor scade cu cantitățile de mai jos."}
            </p>
          </div>
          {!shipped ? (
            <Button size="sm" onClick={() => store.shipOutbound(issue.id)}>
              Marchează expediată
            </Button>
          ) : null}
        </div>
      </div>

      <section className="px-6 pt-5">
        <h3 className="text-[13.5px] font-bold mb-2">Poziții</h3>
        <div className="rounded-[10px] border border-rc-line overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th>Produs</Th>
                <Th align="right">Cantitate</Th>
                <Th align="right">Preț vânzare</Th>
              </tr>
            </thead>
            <tbody>
              {issue.lines.map((l, i) => {
                const p = store.products.find((x) => x.id === l.productId);
                return (
                  <tr key={`${l.productId}-${i}`}>
                    <Td>
                      <span className="text-[12.5px] font-medium">{p?.name ?? l.productId}</span>
                      <span className="block rc-num text-[11.5px] text-rc-muted-2 mt-0.5">
                        {p?.sku}
                      </span>
                    </Td>
                    <Td align="right">
                      <span className="rc-num text-[12.5px] font-semibold whitespace-nowrap">
                        {formatNumber(l.quantity)} {p ? unitLabel(p.unit) : ""}
                      </span>
                    </Td>
                    <Td align="right">
                      {l.salePriceMdl === null ? (
                        <span className="text-[12px] text-rc-muted-2">fără preț</span>
                      ) : (
                        <span className="rc-num text-[12.5px] whitespace-nowrap">
                          {formatMoney(l.salePriceMdl)}
                        </span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      </section>

      <History events={issue.history} />
    </Panel>
  );
}
