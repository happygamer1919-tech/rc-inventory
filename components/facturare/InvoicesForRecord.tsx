"use client";

// Facturile unei inregistrari, pentru fila de pe fisa clientului si de pe fisa
// proiectului. Cardul P3-110, goal G65 partea 3.
//
// UN SINGUR COMPONENT PENTRU AMANDOUA FILELE, fiindca este acelasi tabel: linia goalului
// cere "A client and a project page each show their invoices", iar doua tabele scrise
// separat ar fi doua tabele care se deosebesc de la prima coloana adaugata uneia din ele.
// Aceeasi judecata pentru care DocumentsPanel serveste amandoua filele de documente.
//
// CE ARATA SI CE NU. Numar, Data, Total si Stare, plus Proiect pe fisa clientului, unde
// intrebarea "pe ce santier" are un raspuns care variaza; pe fisa proiectului coloana ar
// fi aceeasi valoare pe fiecare rand, adica o coloana care nu spune nimic. Nu are filtre
// si nu are perioada: intrebarea de pe o fisa este "ce i-am facturat", nu "ce am
// facturat luna asta", iar ecranul /facturare are deja fiecare filtru.
//
// NICIUN TOTAL PE FILA. Suma facturilor unui client este o intrebare de raport, iar un
// numar pus aici fara sa spuna ce include, anulatele de exemplu, ar fi un total in care
// nu se poate avea incredere. Lista /facturare are linia de totaluri, cu filtrele ei.

import Link from "next/link";
import { Card, CardHeader, Chip, EmptyState, Table, Td, Th, type ChipTone } from "@/components/ui/primitives";
import { formatDate, formatMoneyExact, plural } from "@/lib/data/format";
import { invoiceNumberText, invoiceStatusLabel, type InvoiceStatus } from "@/lib/data/facturare-types";
import type { InvoiceListRow } from "@/lib/data/facturare-list-types";
import { PHONE_CELL, PHONE_LINK, PHONE_ROW, PHONE_TABLE, PHONE_WIDE } from "@/components/ui/phone";

/** Aceleasi patru tonuri ca pe lista. Niciunul nou, deci nimic de adaugat la
 *  tests/e2e/button-contrast.spec.ts. */
const STATUS_TONE: Record<InvoiceStatus, ChipTone> = {
  draft: "neutral",
  issued: "info",
  paid: "ok",
  cancelled: "danger",
};

const NO_NUMBER = "Fără număr";

export function InvoicesForRecord({
  rows,
  showProject,
}: {
  /** null cand migratia 0063 nu este aplicata pe baza aceasta. */
  rows: InvoiceListRow[] | null;
  /** Coloana Proiect: pe fisa clientului da, pe fisa proiectului nu. */
  showProject: boolean;
}) {
  if (rows === null) {
    return (
      <Card>
        <CardHeader title="Facturi" hint="Facturile acestei înregistrări" />
        <div data-testid="record-invoices-pending">
          <EmptyState
            title="Facturarea nu este încă activă pe această bază de date"
            hint="Fila este gata și se aprinde singură imediat după aplicare, fără o nouă livrare."
          />
        </div>
      </Card>
    );
  }

  return (
    <Card className={PHONE_TABLE}>
      <CardHeader title="Facturi" hint={plural(rows.length, "factură", "facturi")} />
      {rows.length === 0 ? (
        <div data-testid="record-invoices-empty">
          <EmptyState
            title="Nicio factură"
            hint="Facturile se fac din ecranul unei ieșiri sau din Facturi, cu Factură nouă."
          />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Număr</Th>
              <Th>Data</Th>
              {showProject ? <Th>Proiect</Th> : null}
              <Th align="right">Total</Th>
              <Th>Stare</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                data-testid="record-invoice-row"
                data-id={row.id}
                data-status={row.status}
                className={`hover:bg-rc-paper ${PHONE_ROW}`}
              >
                <Td data-label="Număr" className={PHONE_CELL}>
                  <Link
                    href={`/facturare/${row.id}`}
                    className={`font-semibold text-rc-black tabular-nums hover:underline ${PHONE_LINK}`}
                    data-testid="record-invoice-numar"
                  >
                    {invoiceNumberText(row.series, row.number) ?? NO_NUMBER}
                  </Link>
                </Td>
                <Td data-label="Data" className={PHONE_CELL}>
                  {/* O ciornă nu are zi de emitere, deci ziua ei este ziua crearii, exact
                      ca pe lista din partea 2, si indicatia de la trecerea mouse-ului
                      spune care din cele doua este. */}
                  <span title={row.dateIsCreation ? "Data creării ciornei" : "Data emiterii"}>
                    {formatDate(row.date)}
                  </span>
                </Td>
                {showProject ? (
                  <Td data-label="Proiect" className={PHONE_WIDE}>
                    {row.projectId && row.projectName ? (
                      <Link
                        href={`/proiecte/${row.projectId}`}
                        className={`text-rc-black hover:underline ${PHONE_LINK}`}
                        data-testid="record-invoice-proiect"
                      >
                        {row.projectName}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </Td>
                ) : null}
                <Td align="right" data-label="Total" className={PHONE_CELL}>
                  <span className="tabular-nums" data-testid="record-invoice-total">
                    {formatMoneyExact(row.totalMdl)}
                  </span>
                </Td>
                <Td data-label="Stare" className={PHONE_CELL}>
                  <Chip tone={STATUS_TONE[row.status]}>
                    <span data-testid="record-invoice-stare">{invoiceStatusLabel(row.status)}</span>
                  </Chip>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
