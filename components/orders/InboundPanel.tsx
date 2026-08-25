"use client";

// Panoul unei comenzi de intrare: pozitii, loturi si istoricul stărilor.
//
// Trecerea in Recepționată este ce creeaza loturile, iar legatura este scrisa pe
// ecran, nu doar in date. Butonul apeleaza functia receive_inbound_order din
// migratia 0003, care face cele trei scrieri intr-o singura tranzactie si este
// idempotenta: al doilea clic nu creeaza al doilea lot.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Chip, Table, Td, Th } from "@/components/ui/primitives";
import type { ChipTone } from "@/components/ui/primitives";
import { formatDate, formatMoney, formatNumber } from "@/lib/data/format";
import { unitLabel } from "@/lib/data/units";
import { INBOUND_STATUS_LABEL } from "@/lib/data/inbound-types";
import type { InboundBatch, InboundOrder } from "@/lib/data/inbound-types";
import { loadInboundDetail } from "@/lib/data/inbound-detail";
import { receiveInboundOrder } from "@/lib/data/inbound-actions";
import { OrderDocumentLink, OrderDocumentUpload } from "./OrderDocumentUpload";
import { Panel } from "./Panel";

const tone = (s: string): ChipTone => (s === "arrived" ? "ok" : "warn");

export function InboundPanel({
  order: initialOrder,
  onClose,
}: {
  order: InboundOrder;
  onClose: () => void;
}) {
  const router = useRouter();
  const [order, setOrder] = React.useState<InboundOrder>(initialOrder);
  const [batches, setBatches] = React.useState<InboundBatch[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const detail = await loadInboundDetail(initialOrder.id);
    if (detail.order) setOrder(detail.order);
    setBatches(detail.batches);
    setLoaded(true);
  }, [initialOrder.id]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const arrived = order.status === "arrived";

  async function receive() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await receiveInboundOrder(order.id);
    if (!result.ok) {
      setError(result.message);
      setBusy(false);
      return;
    }
    setNotice(
      result.value.alreadyArrived
        ? "Comanda era deja recepționată. Nu s-a creat niciun lot nou."
        : `Recepție confirmată. S-au creat ${result.value.createdBatches} ${
            result.value.createdBatches === 1 ? "lot" : "loturi"
          }.`,
    );
    await refresh();
    router.refresh();
    setBusy(false);
  }

  return (
    <Panel
      title={order.reference}
      subtitle={`${order.supplierName ?? "Fără furnizor"} · ${order.lines.length} ${
        order.lines.length === 1 ? "poziție" : "poziții"
      } · ${formatMoney(order.totalMdl)}`}
      chip={<Chip tone={tone(order.status)}>{INBOUND_STATUS_LABEL[order.status]}</Chip>}
      onClose={onClose}
      testId="inbound-panel"
    >
      <div className="px-6 pt-5 flex flex-wrap items-start gap-2.5">
        {!arrived ? (
          <Button size="sm" onClick={receive} disabled={busy} data-testid="receive-order">
            {busy ? "Se confirmă..." : "Confirmă recepția"}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={receive}
            disabled={busy}
            data-testid="receive-order"
            title="Recepția este idempotentă: nu se creează al doilea lot."
          >
            {busy ? "Se verifică..." : "Confirmă recepția din nou"}
          </Button>
        )}
        {order.documentPath ? <OrderDocumentLink orderId={order.id} /> : null}
      </div>

      {!order.documentPath ? (
        <div className="px-6 pt-4">
          <p className="text-[12.5px] text-rc-muted mb-2">
            Nu există document atașat. PDF, PNG sau JPG, până în 10 MB.
          </p>
          <OrderDocumentUpload orderId={order.id} onUploaded={refresh} />
        </div>
      ) : null}

      {notice ? (
        <p
          data-testid="receive-notice"
          className="mx-6 mt-4 rounded-[10px] border border-rc-ok/30 bg-rc-ok-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
        >
          {notice}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          data-testid="receive-error"
          className="mx-6 mt-4 rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
        >
          {error}
        </p>
      ) : null}

      <section className="px-6 py-5">
        <h3 className="text-[13.5px] font-bold mb-2">Poziții</h3>
        <div className="rounded-[10px] border border-rc-line overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th>Produs</Th>
                <Th align="right">Cantitate</Th>
                <Th align="right">Preț unitar</Th>
              </tr>
            </thead>
            <tbody data-testid="inbound-lines">
              {order.lines.map((l) => (
                <tr key={l.id} data-testid="inbound-line">
                  <Td>
                    <span className="text-[12.5px] font-medium text-rc-black">{l.productName}</span>
                    <span className="block rc-num text-[11.5px] text-rc-muted-2 mt-0.5">
                      {l.productSku}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="rc-num text-[12.5px] font-semibold whitespace-nowrap">
                      {formatNumber(l.quantity)} {unitLabel(l.unit)}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="rc-num text-[12.5px] text-rc-muted whitespace-nowrap">
                      {l.unitPrice === null
                        ? "-"
                        : `${formatNumber(l.unitPrice)} ${order.currency}`}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </section>

      <section className="px-6 pb-2">
        <h3 className="text-[13.5px] font-bold mb-2">
          Loturi create la recepție{" "}
          <span className="font-normal text-rc-muted">({batches.length})</span>
        </h3>
        <p className="text-[12px] text-rc-muted mb-2.5">
          Un lot se creează la recepție, câte unul pentru fiecare poziție. Suma loturilor este
          stocul.
        </p>
        <div className="rounded-[10px] border border-rc-line overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th>Produs</Th>
                <Th align="right">Cantitate</Th>
                <Th align="right">Recepționat</Th>
              </tr>
            </thead>
            <tbody data-testid="inbound-batches">
              {batches.map((b) => (
                <tr key={b.id} data-testid="inbound-batch">
                  <Td>
                    <span className="text-[12.5px] text-rc-black">{b.productName}</span>
                  </Td>
                  <Td align="right">
                    <span className="rc-num text-[12.5px] font-semibold">
                      {formatNumber(b.quantity)}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="rc-num text-[12.5px] text-rc-muted">
                      {formatDate(b.arrivedAt)}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {batches.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12.5px] text-rc-muted">
              {loaded
                ? "Niciun lot. Se creează la confirmarea recepției."
                : "Se încarcă..."}
            </p>
          ) : null}
        </div>
      </section>

      <section className="px-6 py-5">
        <h3 className="text-[13.5px] font-bold mb-3">Istoricul stărilor</h3>
        <ol className="relative pl-5" data-testid="inbound-history">
          <span className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-rc-line" />
          {order.history.map((e, i) => (
            <li key={e.id} className="relative pb-4 last:pb-0" data-testid="history-event">
              <span
                className={[
                  "absolute -left-5 top-1 w-[11px] h-[11px] rounded-full border-2 border-white",
                  i === 0 ? "bg-rc-orange" : "bg-rc-muted-2",
                ].join(" ")}
              />
              <p className="text-[13px] font-semibold">
                {INBOUND_STATUS_LABEL[e.toStatus as "pending_arrival" | "arrived"] ?? e.toStatus}
              </p>
              <p className="rc-num text-[11.5px] text-rc-muted-2 mt-0.5">{formatDate(e.at)}</p>
              {e.note ? (
                <p className="text-[12.5px] text-rc-muted mt-1 leading-relaxed">{e.note}</p>
              ) : null}
            </li>
          ))}
        </ol>
        {order.history.length === 0 && loaded ? (
          <p className="text-[12.5px] text-rc-muted">Fără istoric.</p>
        ) : null}
      </section>
    </Panel>
  );
}
