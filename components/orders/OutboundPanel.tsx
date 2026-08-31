"use client";

// Panoul unei iesiri, pe date reale. Inlocuieste OutboundPanelMock.
//
// Expedierea NU misca stocul. Stocul a plecat la crearea bonului, care este si
// locul unde traieste verificarea de supratragere. Expedierea inregistreaza ca
// marfa a ajuns fizic pe santier, si asta scrie ecranul.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Chip, Table, Td, Th } from "@/components/ui/primitives";
import type { ChipTone } from "@/components/ui/primitives";
import { formatDate, formatMoney, formatNumber } from "@/lib/data/format";
import { unitLabel } from "@/lib/data/units";
import { OUTBOUND_STATUS_LABEL } from "@/lib/data/outbound-types";
import type { OutboundIssue } from "@/lib/data/outbound-types";
import { loadOutboundDetail } from "@/lib/data/outbound-detail";
import { shipOutboundIssue } from "@/lib/data/outbound-actions";
import { Panel } from "./Panel";
import { RecordLink } from "@/components/ui/RecordLink";

const tone = (s: string): ChipTone => (s === "shipped" ? "ok" : "warn");

export function OutboundPanel({
  issue: initialIssue,
  onClose,
}: {
  issue: OutboundIssue;
  onClose: () => void;
}) {
  const router = useRouter();
  const [issue, setIssue] = React.useState<OutboundIssue>(initialIssue);
  const [loaded, setLoaded] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const detail = await loadOutboundDetail(initialIssue.id);
    if (detail.issue) setIssue(detail.issue);
    setLoaded(true);
  }, [initialIssue.id]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const shipped = issue.status === "shipped";

  async function ship() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await shipOutboundIssue(issue.id);
    if (!result.ok) {
      setError(result.message);
      setBusy(false);
      return;
    }
    setNotice(
      result.value.alreadyShipped
        ? "Ieșirea era deja expediată."
        : "Expediere confirmată.",
    );
    await refresh();
    router.refresh();
    setBusy(false);
  }

  return (
    <Panel
      title={issue.reference}
      subtitle={
        // P3-10. Destinatia devine navigabila in AMBELE directii: bonul catre
        // santier si bonul catre beneficiar. Cand randul istoric nu a fost inca
        // reconciliat, se scrie text simplu cu explicatia si NU o legatura
        // moarta.
        <span className="inline-flex items-center gap-1.5">
          <RecordLink
            href={issue.projectId ? `/proiecte/${issue.projectId}` : null}
            fallback="Proiect neasociat"
            testId="issue-project-link"
          >
            {issue.projectName}
          </RecordLink>
          <span className="text-rc-muted-2">·</span>
          <RecordLink
            href={issue.clientId ? `/clienti/${issue.clientId}` : null}
            fallback="Client neasociat"
            testId="issue-client-link"
          >
            {issue.clientName}
          </RecordLink>
          <span className="text-rc-muted-2">· emis {formatDate(issue.issuedAt)}</span>
        </span>
      }
      chip={<Chip tone={tone(issue.status)}>{OUTBOUND_STATUS_LABEL[issue.status]}</Chip>}
      onClose={onClose}
      testId="outbound-panel"
    >
      <div className="px-6 pt-5">
        <div className="rounded-[10px] border border-rc-line bg-rc-paper px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-[12.5px] font-semibold">
              {shipped ? "Marfa a plecat către șantier" : "Marfa este pregătită, dar nu a plecat"}
            </p>
            <p className="text-[12px] text-rc-muted mt-0.5">
              {shipped
                ? `Expediată pe ${formatDate(issue.shippedAt)}.`
                : "Stocul a scăzut deja la crearea bonului. Expedierea înregistrează plecarea fizică."}
            </p>
          </div>
          <Button size="sm" onClick={ship} disabled={busy} data-testid="ship-issue">
            {busy
              ? "Se confirmă..."
              : shipped
                ? "Confirmă din nou"
                : "Marchează expediată"}
          </Button>
        </div>
      </div>

      {notice ? (
        <p
          data-testid="ship-notice"
          className="mx-6 mt-4 rounded-[10px] border border-rc-ok/30 bg-rc-ok-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
        >
          {notice}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          data-testid="ship-error"
          className="mx-6 mt-4 rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
        >
          {error}
        </p>
      ) : null}

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
            <tbody data-testid="outbound-lines">
              {issue.lines.map((l) => (
                <tr key={l.id} data-testid="outbound-line">
                  <Td>
                    {/* P3-10: linia de comanda catre fisa produsului. Ecranul de
                        inventar deschide panoul produsului din parametrul de URL
                        produs, deci legatura este partajabila si nu un clic care
                        se pierde. */}
                    <RecordLink
                      href={`/inventar?produs=${encodeURIComponent(l.productSku)}`}
                      fallback={l.productName}
                      testId="line-product-link"
                      className="text-[12.5px] font-medium"
                    >
                      {l.productName}
                    </RecordLink>
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
                    {l.salePriceMdl === null ? (
                      <span className="text-[12px] text-rc-muted-2">fără preț</span>
                    ) : (
                      <span className="rc-num text-[12.5px] whitespace-nowrap">
                        {formatMoney(l.salePriceMdl)}
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </section>

      <section className="px-6 py-5">
        <h3 className="text-[13.5px] font-bold mb-3">Istoricul stărilor</h3>
        <ol className="relative pl-5" data-testid="outbound-history">
          <span className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-rc-line" />
          {issue.history.map((e, i) => (
            <li key={e.id} className="relative pb-4 last:pb-0" data-testid="outbound-history-event">
              <span
                className={[
                  "absolute -left-5 top-1 w-[11px] h-[11px] rounded-full border-2 border-white",
                  i === 0 ? "bg-rc-orange" : "bg-rc-muted-2",
                ].join(" ")}
              />
              <p className="text-[13px] font-semibold">
                {OUTBOUND_STATUS_LABEL[e.toStatus as "awaiting_shipment" | "shipped"] ?? e.toStatus}
              </p>
              <p className="rc-num text-[11.5px] text-rc-muted-2 mt-0.5">{formatDate(e.at)}</p>
              {e.note ? (
                <p className="text-[12.5px] text-rc-muted mt-1 leading-relaxed">{e.note}</p>
              ) : null}
            </li>
          ))}
        </ol>
        {issue.history.length === 0 && loaded ? (
          <p className="text-[12.5px] text-rc-muted">Fără istoric.</p>
        ) : null}
      </section>
    </Panel>
  );
}
