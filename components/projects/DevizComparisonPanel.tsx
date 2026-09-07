"use client";

// P3-13c. Devizul fata de realitate.
//
// SASE VALORI PE RAND, pentru ca addendumul cere si cantitate si bani: Estimat,
// Emis si Diferenta in cantitate, si aceleasi trei in MDL. Cantitatea ramane
// comparatia principala pentru ca despre ea se cearta un sef de santier; banii
// sunt prezenti si secundari.
//
// TREI FELURI DE RAND, SI NICIUNUL NU SE OMITE. Estimat si emis; estimat si
// neemis, care apare cu emis zero; si emis fara sa fi fost estimat, care se
// numeste Neprevazut. Al treilea este scurgerea pe care afacerea nu o vede
// astazi si este motivul pentru care exista ecranul.
//
// DEPASIREA SE SEMNALEAZA, NU SE BLOCHEAZA. Emis peste Estimat este un fapt
// despre un santier, deseori unul legitim. Semnul se vede fara sa fie deschis
// randul, pentru ca despre asta este linia de acceptanta.
//
// ARITMETICA SE CITESTE DIN ATRIBUTE, NU DIN TEXT. Textul trece prin Intl si
// contine spatii insecabile, deci o afirmatie pe sirul afisat ar cadea pe
// formatare in loc sa cada pe numar. Acelasi tipar ca pe fila Cost.
//
// DOCTRINA DENSITATII: tabelul nu creste la nesfarsit. Se arata 25 de randuri si
// restul la cerere, iar subsolul insumeaza INTOTDEAUNA toate randurile, nu doar
// pagina vizibila. Un subsol care ar aduna doar ce se vede ar fi un numar care se
// schimba cand apesi un buton.

import * as React from "react";
import Link from "next/link";
import { Card, CardHeader, Chip, EmptyState, Table, Td, Th } from "@/components/ui/primitives";
import { formatMoney, formatNumber, formatQty } from "@/lib/data/format";
import { DEVIZ_STATUS_LABEL } from "@/lib/data/deviz-types";
import type { UnitCode } from "@/lib/data/units";
import type { ComparisonRow, DevizComparison } from "@/lib/reporting/deviz-comparison";

const PAGE = 25;

function qty(value: number, unit: UnitCode | null): string {
  return unit ? formatQty(value, unit) : formatNumber(value);
}

/** Semnul explicit, ca "+120" sa nu se citeasca la fel ca "120". */
function signed(value: number): string {
  return value > 0 ? `+${formatMoney(value)}` : formatMoney(value);
}

function signedQty(value: number, unit: UnitCode | null): string {
  return value > 0 ? `+${qty(value, unit)}` : qty(value, unit);
}

function RowCells({ row }: { row: ComparisonRow }) {
  const key = row.sku;
  return (
    <tr data-testid={`comparison-row-${key}`} data-kind={row.kind}>
      <Td>
        <div className="flex items-center gap-2">
          <span className="font-medium text-rc-black">{row.productName}</span>
          {row.kind === "unplanned" ? (
            <span data-testid={`comparison-neprevazut-${key}`}>
              <Chip tone="orange">Neprevăzut</Chip>
            </span>
          ) : null}
          {row.overIssued ? (
            <span data-testid={`comparison-depasire-${key}`}>
              <Chip tone="danger">Depășire</Chip>
            </span>
          ) : null}
        </div>
        <div className="text-[12px] text-rc-muted">{key}</div>
      </Td>

      <Td align="right">
        <span data-testid={`comparison-est-qty-${key}`} data-qty={row.estimatedQty}>
          {qty(row.estimatedQty, row.unit)}
        </span>
      </Td>
      <Td align="right">
        <span data-testid={`comparison-emis-qty-${key}`} data-qty={row.issuedQty}>
          {qty(row.issuedQty, row.unit)}
        </span>
      </Td>
      <Td align="right">
        <span
          data-testid={`comparison-dif-qty-${key}`}
          data-qty={row.qtyDifference}
          className={row.qtyDifference > 0 ? "text-rc-danger font-semibold" : "text-rc-muted"}
        >
          {signedQty(row.qtyDifference, row.unit)}
        </span>
      </Td>

      <Td align="right">
        <span data-testid={`comparison-est-mdl-${key}`} data-value-mdl={row.estimatedMdl}>
          {formatMoney(row.estimatedMdl)}
        </span>
      </Td>
      <Td align="right">
        <span data-testid={`comparison-emis-mdl-${key}`} data-value-mdl={row.issuedMdl}>
          {formatMoney(row.issuedMdl)}
        </span>
      </Td>
      <Td align="right">
        <span
          data-testid={`comparison-dif-mdl-${key}`}
          data-value-mdl={row.differenceMdl}
          className={row.differenceMdl > 0 ? "text-rc-danger font-semibold" : "text-rc-muted"}
        >
          {signed(row.differenceMdl)}
        </span>
      </Td>
    </tr>
  );
}

export function DevizComparisonPanel({
  projectId,
  comparison,
  pathname,
}: {
  projectId: string;
  comparison: DevizComparison;
  pathname: string;
}) {
  const [shown, setShown] = React.useState(PAGE);
  const { deviz, rows, totals, versions, truncated } = comparison;

  if (!deviz) {
    return (
      <Card>
        <CardHeader title="Deviz față de realitate" />
        <EmptyState
          title="Proiectul nu are niciun deviz"
          hint="Creează o versiune pe fila Deviz și comparația apare aici."
        />
      </Card>
    );
  }

  const visible = rows.slice(0, shown);

  return (
      <Card>
      <CardHeader
        title="Deviz față de realitate"
        hint="Estimat la prețul ofertat, Emis la valoarea din catalogul de azi"
      />

      {/* CARE VERSIUNE SE COMPARA, SPUS PE FATA. Implicit este cea mai recenta,
          si niciodata ambiguu. */}
      <div className="px-5 pt-4 flex items-center gap-2 flex-wrap" data-testid="comparison-versiune">
        <span className="text-[12.5px] text-rc-muted">Versiunea comparată:</span>
        <span
          className="text-[13px] font-semibold text-rc-black"
          data-version={deviz.version}
          data-deviz-id={deviz.id}
        >
          {deviz.name ? `${deviz.name}, versiunea ${deviz.version}` : `Versiunea ${deviz.version}`}
        </span>
        <Chip tone="neutral">{DEVIZ_STATUS_LABEL[deviz.status]}</Chip>

        {versions.length > 1 ? (
          <span className="flex items-center gap-1.5 ml-2">
            <span className="text-[12.5px] text-rc-muted">Compară altă versiune:</span>
            {versions.map((v) => (
              <Link
                key={v.id}
                href={`${pathname}?fila=comparatie&deviz=${v.id}`}
                data-testid={`comparison-versiune-${v.version}`}
                data-active={v.id === deviz.id ? "true" : "false"}
                className={
                  v.id === deviz.id
                    ? "px-2 py-1 text-[12.5px] font-semibold text-rc-black border-b-2 border-rc-orange"
                    : "px-2 py-1 text-[12.5px] text-rc-muted hover:text-rc-black"
                }
              >
                v{v.version}
              </Link>
            ))}
          </span>
        ) : null}
      </div>

      {/* DEFALCAREA TAIATA SE SPUNE, NU SE ASCUNDE. Vezi comentariul din
          lib/reporting/deviz-comparison.ts: un tabel scurt cu un subsol corect
          ar ascunde exact randul Neprevazut pentru care exista ecranul. */}
      {truncated ? (
        <div
          className="mx-5 mt-3 rounded border border-rc-warn/25 bg-rc-warn-soft px-3 py-2 text-[12.5px] text-rc-warn"
          data-testid="comparison-truncated"
        >
          Lista de produse emise a fost tăiată de raportul de cost, deci comparația de mai jos nu
          este completă. Cifrele din subsol rămân corecte.
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="Devizul nu are linii și nu s-a emis nimic"
          hint="Adaugă linii pe fila Deviz sau eliberează material către acest proiect."
        />
      ) : (
        <div className="px-5 py-4">
          <Table>
            <thead>
              <tr>
                <Th>Produs</Th>
                <Th align="right">Estimat, cantitate</Th>
                <Th align="right">Emis, cantitate</Th>
                <Th align="right">Diferență, cantitate</Th>
                <Th align="right">Estimat, valoare</Th>
                <Th align="right">Emis, valoare</Th>
                <Th align="right">Diferență, valoare</Th>
              </tr>
            </thead>
            <tbody data-testid="comparison-rows" data-count={rows.length}>
              {visible.map((r) => (
                <RowCells key={r.productId} row={r} />
              ))}
            </tbody>
          </Table>

          {rows.length > shown ? (
            <button
              type="button"
              data-testid="comparison-more"
              onClick={() => setShown((n) => n + PAGE)}
              className="mt-3 text-[12.5px] font-semibold text-rc-orange-deep hover:underline"
            >
              Arată încă {Math.min(PAGE, rows.length - shown)} din {rows.length - shown} rămase
            </button>
          ) : null}

          {/* SUBSOLUL, PATRU CIFRE, PESTE TOATE RANDURILE SI NU DOAR PESTE
              PAGINA VIZIBILA. */}
          <div className="mt-4 grid grid-cols-4 gap-3 border-t border-rc-line pt-3">
            <div>
              <div className="text-[12.5px] text-rc-muted">Total materiale estimate</div>
              <div
                className="text-[17px] font-semibold text-rc-black"
                data-testid="comparison-total-deviz"
                data-value-mdl={totals.devizTotalMdl}
              >
                {formatMoney(totals.devizTotalMdl)}
              </div>
            </div>
            <div>
              <div className="text-[12.5px] text-rc-muted">Total emis</div>
              <div
                className="text-[17px] font-semibold text-rc-black"
                data-testid="comparison-total-emis"
                data-value-mdl={totals.issuedTotalMdl}
              >
                {formatMoney(totals.issuedTotalMdl)}
              </div>
            </div>
            <div>
              <div className="text-[12.5px] text-rc-muted">Abatere</div>
              <div
                className={
                  totals.varianceMdl > 0
                    ? "text-[17px] font-semibold text-rc-danger"
                    : "text-[17px] font-semibold text-rc-black"
                }
                data-testid="comparison-abatere"
                data-value-mdl={totals.varianceMdl}
              >
                {signed(totals.varianceMdl)}
              </div>
            </div>
            <div>
              <div className="text-[12.5px] text-rc-muted">Abatere procentuală</div>
              <div
                className={
                  totals.variancePercent !== null && totals.variancePercent > 0
                    ? "text-[17px] font-semibold text-rc-danger"
                    : "text-[17px] font-semibold text-rc-black"
                }
                data-testid="comparison-abatere-pct"
                data-percent={totals.variancePercent === null ? "" : totals.variancePercent}
              >
                {/* UN DEVIZ DE ZERO ARATA O LINIUTA, NU O IMPARTIRE LA ZERO. */}
                {totals.variancePercent === null
                  ? "-"
                  : `${totals.variancePercent > 0 ? "+" : ""}${formatNumber(totals.variancePercent)}%`}
              </div>
            </div>
          </div>

          {/* DE CE TOTALUL DE AICI NU ESTE TOTALUL DE PE FILA DEVIZ. Adaosul nu
              este material si nu are corespondent in coloana Emis, deci nu intra
              in comparatie. Se arata ca sa poata fi reconciliate.

              P3-13d. ETICHETA NU MAI SPUNE "deviz", SI ASTA ESTE CHIAR CARDUL.
              Cifra este subtotalul de material, fara adaos, deci coloana Estimat
              se aduna in propriul ei subsol. Purta insa acelasi nume ca totalul
              de pe fila Deviz, care INCLUDE adaosul, si doua ecrane pareau ca se
              contrazic cand de fapt raspundeau la doua intrebari. Cifra nu s-a
              schimbat; numele ei spune acum ce aduna. */}
          <div className="mt-2 text-[12.5px] text-rc-muted" data-testid="comparison-adaos-note">
            Totalul de materiale de aici este materialul la prețul ofertat, fără adaos, iar
            totalul de pe fila Deviz include adaosul. Adaosul versiunii este{" "}
            <span data-testid="comparison-adaos" data-value-mdl={totals.adaosMdl}>
              {formatMoney(totals.adaosMdl)}
            </span>{" "}
            și rămâne în afara comparației, pentru că nu este material.
          </div>

          <div className="mt-1 text-[12.5px] text-rc-muted">
            Valoarea emisă folosește prețul din catalogul de azi, deci se schimbă dacă prețul unui
            produs este modificat. Valoarea estimată folosește prețul înghețat la ofertare și nu se
            schimbă niciodată.
          </div>

          <Link
            href={`/proiecte/${projectId}?fila=deviz&deviz=${deviz.id}`}
            className="mt-3 inline-block text-[12.5px] font-semibold text-rc-orange-deep hover:underline"
            data-testid="comparison-link-deviz"
          >
            Deschide devizul
          </Link>
        </div>
      )}
      </Card>
  );
}
