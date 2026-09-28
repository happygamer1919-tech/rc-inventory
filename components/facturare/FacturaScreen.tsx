"use client";

// Ecranul unei facturi. Cardul P3-110, goal G65 partea 3.
//
// SE CITESTE, IN CEA MAI MARE PARTE. Numarul si starea sus, amandoua partile,
// proiectul, Iesirea din care vine, cele doua date, pozitiile cu TVA PE LINIE, subsolul
// cu Subtotal, TVA si Total de plată in lei cu doi bani, nota, motivul anularii cand
// exista, si istoricul a ce s-a intamplat cu ea.
//
// ACTIUNILE SUNT EXACT CELE PE CARE LE PERMITE STAREA, SI NIMIC MAI MULT. Tabelul
// traieste in invoiceActionsFor din lib/data/facturare-detail-types.ts, intr-un singur
// loc, citit si de specificatie. Ce starea nu permite NU SE DESENEAZA, nici gri: un
// control care exista numai ca sa refuze este defectul pentru care au fost ridicate
// cardurile P3-61 si P3-98.
//
//   Ciornă    Modifică, Emite, Anulează
//   Emisă     Marchează plătită, Anulează
//   Plătită   nimic, doar citire
//   Anulată   nimic, doar citire, si rămâne pe listă
//
// NU EXISTA NICIUN BUTON DE STERGERE, IN NICIO STARE. Raportul de proiectare o spune
// in terminii lui: "On nothing at all: delete. There is no delete button on this screen
// in any state". Jumatatea de baza de date a aceleiasi reguli este in migratia 0063:
// nimeni nu are drept de stergere pe niciuna din cele patru tabele.
//
// EMITE ESTE PUNCTUL DE NU-MAI-INTORC SI ECRANUL O SPUNE INAINTE, nu după. Confirmarea
// este o singura propozitie romaneasca, spune ca după emitere factura nu se mai
// modifică si numeste numarul pe care il va lua. Raportul de proiectare: "This is the
// moment the operator will be in a hurry, and it is the moment the system has to slow
// them down by exactly one sentence."
//
// ANULAREA CERE UN MOTIV, iar motivul este pastrat si arătat. Raportul: "An invoice
// marked cancelled with nobody knowing why is a question somebody has to answer six
// months later from memory."
//
// NICIUN PDF, NICIUN TIPAR, NICIUN EMAIL SI NICIO e-FACTURA. Sectiunea 2 a raportului
// de proiectare pune trei variante pentru sistemul statului si Max nu a ales una, deci
// linia pe care partea 2 a pus-o sub lista rămâne adevarata.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardHeader,
  Chip,
  PageHeader,
  Table,
  Td,
  Textarea,
  Th,
  type ChipTone,
} from "@/components/ui/primitives";
import { DateField } from "@/components/ui/DateField";
import {
  PHONE_CELL,
  PHONE_CONTROL,
  PHONE_LINK,
  PHONE_ROW,
  PHONE_ROW_PAIR,
  PHONE_ROW_LABEL,
  PHONE_ROW_VALUE,
  PHONE_STACK,
  PHONE_TABLE,
  PHONE_TAP,
  PHONE_WIDE,
} from "@/components/ui/phone";
import { formatDate, formatDateTime, formatMoneyExact, formatQty } from "@/lib/data/format";
import { invoiceNumberText, invoiceStatusLabel, type InvoiceStatus } from "@/lib/data/facturare-types";
import {
  invoiceActionsFor,
  invoiceEventLabel,
  invoiceLineLabel,
  invoiceSingleVatRate,
  type InvoiceDetail,
} from "@/lib/data/facturare-detail-types";
import { cancelInvoice, issueInvoice, markInvoicePaid } from "@/lib/data/facturare-actions";

/** Cipul fiecarei stari. Cele patru tonuri sunt cele pe care le foloseste deja lista
 *  din partea 2, deci nimic nu se adauga la tests/e2e/button-contrast.spec.ts. */
const STATUS_TONE: Record<InvoiceStatus, ChipTone> = {
  draft: "neutral",
  issued: "info",
  paid: "ok",
  cancelled: "danger",
};

/** Ce se scrie in locul numarului cat timp factura este ciorna. Acelasi text ca pe
 *  lista din partea 2: o celula goala arata ca o eroare de citire. */
const NO_NUMBER = "Fără număr";

/** Linia care rămâne adevarata pana cand Max alege una din cele trei variante pentru
 *  e-Factura. Acelasi sir ca sub lista, si scris o singura data aici fiindca cele doua
 *  ecrane nu au voie sa spuna doua lucruri diferite despre ce nu este construit. */
const NOT_BUILT_YET = "Tipărirea și e-Factura urmează.";

type Busy = null | "issue" | "paid" | "cancel";
type Asking = null | "issue" | "paid" | "cancel";

export function FacturaScreen({
  invoice,
  nextNumberText,
  today,
}: {
  invoice: InvoiceDetail;
  /** Numarul pe care l-ar lua urmatoarea emitere din serie. Sir gol cand nu se stie. */
  nextNumberText: string;
  /** Ziua de azi in Chisinau, citita pe server: ziua serverului si ziua browserului nu
   *  au voie sa fie doua zile diferite in aceeasi randare. */
  today: string;
}) {
  const router = useRouter();
  const [asking, setAsking] = React.useState<Asking>(null);
  const [busy, setBusy] = React.useState<Busy>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [paidOn, setPaidOn] = React.useState(today);
  const [reason, setReason] = React.useState("");

  const actions = invoiceActionsFor(invoice.status);
  const numberText = invoiceNumberText(invoice.series, invoice.number);
  const vatRate = invoiceSingleVatRate(invoice.lines);

  function close() {
    setAsking(null);
    setError(null);
  }

  async function doIssue() {
    setBusy("issue");
    setError(null);
    const result = await issueInvoice(invoice.id, invoice.issueDate ?? today, invoice.dueDate ?? "");
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    close();
    router.refresh();
  }

  async function doPaid() {
    setBusy("paid");
    setError(null);
    const result = await markInvoicePaid(invoice.id, paidOn);
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    close();
    router.refresh();
  }

  async function doCancel() {
    setBusy("cancel");
    setError(null);
    const result = await cancelInvoice(invoice.id, reason);
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setReason("");
    close();
    router.refresh();
  }

  return (
    <>
      <PageHeader
        title={numberText ?? NO_NUMBER}
        lead={
          invoice.status === "draft"
            ? "Ciornă. Numărul se alocă la emitere și după aceea factura nu se mai modifică."
            : `Factură pentru ${invoice.client.name}.`
        }
        actions={
          <Chip tone={STATUS_TONE[invoice.status]}>
            <span data-testid="factura-stare">{invoiceStatusLabel(invoice.status)}</span>
          </Chip>
        }
      />

      {/* ----------------------------------------------------------- actiuni -- */}
      {actions.length > 0 ? (
        <Card className="mb-4">
          <CardHeader
            title="Acțiuni"
            hint={
              invoice.status === "draft"
                ? "Cât timp este ciornă, factura se poate modifica liber."
                : "O factură emisă nu se mai modifică: se marchează plătită sau se anulează."
            }
          />
          <div className="p-5 space-y-4" data-testid="factura-actiuni">
            <div className="flex flex-wrap items-center gap-2.5 max-md:flex-col max-md:items-stretch">
              {actions.includes("edit") ? (
                <Link href={`/facturare/${invoice.id}/modifica`} className="max-md:flex max-md:flex-col">
                  <Button variant="secondary" className={PHONE_TAP} data-testid="factura-modifica">
                    Modifică ciorna
                  </Button>
                </Link>
              ) : null}
              {actions.includes("issue") ? (
                <Button
                  type="button"
                  onClick={() => {
                    setAsking(asking === "issue" ? null : "issue");
                    setError(null);
                  }}
                  className={PHONE_TAP}
                  data-testid="factura-emite"
                >
                  Emite factura
                </Button>
              ) : null}
              {actions.includes("markPaid") ? (
                <Button
                  type="button"
                  onClick={() => {
                    setAsking(asking === "paid" ? null : "paid");
                    setPaidOn(today);
                    setError(null);
                  }}
                  className={PHONE_TAP}
                  data-testid="factura-platita"
                >
                  Marchează plătită
                </Button>
              ) : null}
              {actions.includes("cancel") ? (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    setAsking(asking === "cancel" ? null : "cancel");
                    setError(null);
                  }}
                  className={PHONE_TAP}
                  data-testid="factura-anuleaza"
                >
                  Anulează factura
                </Button>
              ) : null}
            </div>

            {/* EMITE: O SINGURA PROPOZITIE, INAINTE, CU NUMARUL IN EA. */}
            {asking === "issue" ? (
              <div
                className="rounded-[12px] border border-rc-orange/40 bg-rc-paper px-4 py-3.5"
                data-testid="factura-emite-confirmare"
              >
                <p className="text-[13px] text-rc-black leading-relaxed">
                  {nextNumberText === ""
                    ? "Factura primește numărul următor din serie și nu se mai poate modifica după aceea: se poate doar anula."
                    : `Factura primește numărul ${nextNumberText}, următorul din serie, și nu se mai poate modifica după aceea: se poate doar anula.`}
                </p>
                <p className="mt-1.5 text-[12px] text-rc-muted">
                  Numărul este alocat de baza de date în momentul emiterii, ca seria să nu aibă nici
                  goluri nici numere repetate.
                </p>
                <div className="mt-3 flex items-center gap-2.5 max-md:flex-col max-md:items-stretch">
                  <Button
                    type="button"
                    onClick={doIssue}
                    disabled={busy !== null}
                    className={PHONE_TAP}
                    data-testid="factura-emite-da"
                  >
                    {busy === "issue" ? "Se emite..." : "Da, emite factura"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={close}
                    disabled={busy !== null}
                    className={PHONE_TAP}
                    data-testid="factura-emite-renunta"
                  >
                    Renunță
                  </Button>
                </div>
              </div>
            ) : null}

            {/* PLATITA: CU ZIUA IN CARE A FOST PLATITA. */}
            {asking === "paid" ? (
              <div
                className="rounded-[12px] border border-rc-line bg-rc-paper px-4 py-3.5"
                data-testid="factura-platita-confirmare"
              >
                <p className="text-[13px] text-rc-black">
                  În ce zi a fost plătită factura? Ziua se păstrează pe factură.
                </p>
                <div className="mt-3 flex items-end gap-2.5 max-md:flex-col max-md:items-stretch">
                  <label className="block w-[170px] max-md:w-full max-md:min-w-0">
                    <span className="block text-[12.5px] font-semibold text-rc-black mb-1.5">
                      Data plății
                    </span>
                    <DateField value={paidOn} onChange={setPaidOn} testId="factura-platita-data" />
                  </label>
                  <Button
                    type="button"
                    onClick={doPaid}
                    disabled={busy !== null}
                    className={PHONE_TAP}
                    data-testid="factura-platita-da"
                  >
                    {busy === "paid" ? "Se salvează..." : "Da, marchează plătită"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={close}
                    disabled={busy !== null}
                    className={PHONE_TAP}
                    data-testid="factura-platita-renunta"
                  >
                    Renunță
                  </Button>
                </div>
              </div>
            ) : null}

            {/* ANULEAZA: MOTIVUL ESTE OBLIGATORIU, SI O CIORNA PRIMESTE UN NUMAR. */}
            {asking === "cancel" ? (
              <div
                className="rounded-[12px] border border-rc-danger/40 bg-rc-danger-soft px-4 py-3.5"
                data-testid="factura-anuleaza-confirmare"
              >
                <p className="text-[13px] text-rc-black leading-relaxed">
                  Factura rămâne pe listă, cu numărul ei, marcată Anulată. Nimic nu se șterge.
                </p>
                {invoice.status === "draft" ? (
                  <p className="mt-1.5 text-[12px] text-rc-black">
                    {nextNumberText === ""
                      ? "Ciorna primește numărul următor din serie în momentul anulării, ca seria să rămână neîntreruptă."
                      : `Ciorna primește numărul ${nextNumberText} în momentul anulării, ca seria să rămână neîntreruptă.`}
                  </p>
                ) : null}
                <label className="block mt-3">
                  <span className="block text-[12.5px] font-semibold text-rc-black mb-1.5">
                    Motivul anulării
                    <span className="text-rc-orange"> *</span>
                  </span>
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="De ce se anulează factura?"
                    className={PHONE_CONTROL}
                    data-testid="factura-anuleaza-motiv"
                  />
                </label>
                <div className="mt-3 flex items-center gap-2.5 max-md:flex-col max-md:items-stretch">
                  <Button
                    type="button"
                    variant="danger"
                    onClick={doCancel}
                    disabled={busy !== null}
                    className={PHONE_TAP}
                    data-testid="factura-anuleaza-da"
                  >
                    {busy === "cancel" ? "Se anulează..." : "Da, anulează factura"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={close}
                    disabled={busy !== null}
                    className={PHONE_TAP}
                    data-testid="factura-anuleaza-renunta"
                  >
                    Renunță
                  </Button>
                </div>
              </div>
            ) : null}

            {error ? (
              <p
                role="alert"
                data-testid="factura-eroare"
                className="rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
              >
                {error}
              </p>
            ) : null}
          </div>
        </Card>
      ) : (
        <p className="mb-4 text-[12.5px] text-rc-muted-2" data-testid="factura-fara-actiuni">
          {invoice.status === "paid"
            ? "Factura este plătită. De aici înainte se citește."
            : "Factura este anulată. De aici înainte se citește și rămâne pe listă."}
        </p>
      )}

      {/* ------------------------------------------------------------ partile -- */}
      <div className={`grid grid-cols-2 gap-4 mb-4 ${PHONE_STACK}`}>
        <Card>
          <CardHeader title="Furnizor" hint="Rapid Construct, din Setări" />
          <div className="p-5 space-y-2" data-testid="factura-emitent">
            <Pair label="Denumire" value={invoice.issuer.name} testId="factura-emitent-nume" />
            <Pair label="IDNO" value={invoice.issuer.fiscalCode} testId="factura-emitent-idno" />
            <Pair label="Adresă" value={invoice.issuer.address} testId="factura-emitent-adresa" />
            <Pair label="Bancă" value={invoice.issuer.bank} testId="factura-emitent-banca" />
            <Pair label="IBAN" value={invoice.issuer.iban} testId="factura-emitent-iban" />
            {invoice.issuer.name.trim() === "" ? (
              // O JUMATATE NECOMPLETATA A UNUI DOCUMENT TREBUIE SA SE VADA, si sa spuna
              // unde se completeaza. Un IDNO inventat nu s-ar vedea.
              <p className="text-[12px] text-rc-warn pt-1" data-testid="factura-emitent-lipsa">
                Datele furnizorului nu sunt completate. Se completează în Setări, la Facturare.
              </p>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Client" hint="Cui este factura" />
          <div className="p-5 space-y-2">
            <div className={`flex items-baseline gap-3 ${PHONE_ROW_PAIR}`}>
              <span className={`w-[110px] shrink-0 text-[12px] text-rc-muted ${PHONE_ROW_LABEL}`}>
                Denumire
              </span>
              <Link
                href={`/clienti/${invoice.client.id}`}
                className={`text-[13px] font-semibold text-rc-black hover:underline ${PHONE_LINK} ${PHONE_ROW_VALUE}`}
                data-testid="factura-client-link"
              >
                {invoice.client.name}
              </Link>
            </div>
            <Pair label="IDNO" value={invoice.client.fiscalCode} testId="factura-client-idno" />
            <Pair label="Adresă" value={invoice.client.address} testId="factura-client-adresa" />
            <div className={`flex items-baseline gap-3 ${PHONE_ROW_PAIR}`}>
              <span className={`w-[110px] shrink-0 text-[12px] text-rc-muted ${PHONE_ROW_LABEL}`}>
                Proiect
              </span>
              {invoice.project ? (
                <Link
                  href={`/proiecte/${invoice.project.id}`}
                  className={`text-[13px] text-rc-black hover:underline ${PHONE_LINK} ${PHONE_ROW_VALUE}`}
                  data-testid="factura-proiect-link"
                >
                  {invoice.project.name}
                </Link>
              ) : (
                <span className={`text-[13px] text-rc-muted ${PHONE_ROW_VALUE}`} data-testid="factura-proiect">
                  Fără proiect
                </span>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------------- datele -- */}
      <Card className="mb-4">
        <CardHeader title="Document" hint="Datele facturii" />
        <div className={`p-5 grid grid-cols-3 gap-4 ${PHONE_STACK}`}>
          <Pair
            label="Data emiterii"
            value={invoice.issueDate ? formatDate(invoice.issueDate) : ""}
            empty="Se stabilește la emitere"
            testId="factura-data-emiterii"
          />
          <Pair
            label="Data scadenței"
            value={invoice.dueDate ? formatDate(invoice.dueDate) : ""}
            testId="factura-data-scadentei"
          />
          <div className={`flex items-baseline gap-3 ${PHONE_ROW_PAIR}`}>
            <span className={`w-[110px] shrink-0 text-[12px] text-rc-muted ${PHONE_ROW_LABEL}`}>
              Ieșire
            </span>
            {invoice.outboundIssue ? (
              // REFERINTA CA TEXT SI NU CA LEGATURA, deliberat: o Iesire nu are o adresa
              // proprie in aplicatia de astazi. Panoul ei se deschide dintr-un clic pe
              // lista /comenzi, iar selectia aceea traieste in starea componentului, nu
              // in URL. O legatura catre /comenzi purtand numarul bonului ar duce la o
              // lista si ar promite un document, ceea ce este exact legatura moarta pe
              // care components/ui/RecordLink.tsx refuza sa o randeze. Ziua in care o
              // Iesire are o adresa, acest text devine o legatura si nimic altceva nu se
              // schimba.
              <span
                className={`rc-num text-[13px] text-rc-black ${PHONE_ROW_VALUE}`}
                data-testid="factura-iesire"
              >
                {invoice.outboundIssue.reference}
              </span>
            ) : (
              <span className={`text-[13px] text-rc-muted ${PHONE_ROW_VALUE}`} data-testid="factura-iesire">
                Fără ieșire
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* ----------------------------------------------------------- pozitiile -- */}
      <Card className={`mb-4 ${PHONE_TABLE}`}>
        <CardHeader
          title="Poziții"
          hint={
            vatRate === null
              ? "Fiecare poziție are cota ei de TVA."
              : `Cota TVA: ${formatRate(vatRate)}. TVA se arată și pe fiecare poziție.`
          }
        />
        <Table>
          <thead>
            <tr>
              <Th>Denumire</Th>
              <Th align="right">Cantitate</Th>
              <Th align="right">Preț unitar</Th>
              <Th align="right">TVA</Th>
              <Th align="right">Total linie</Th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr
                key={line.id}
                data-testid="factura-linie"
                data-quantity={line.quantity}
                data-unit-price={line.unitPriceMdl}
                data-vat-rate={line.vatRate}
                className={PHONE_ROW}
              >
                <Td data-label="Denumire" className={PHONE_WIDE}>
                  <span className="font-medium text-rc-black" data-testid="factura-linie-denumire">
                    {invoiceLineLabel(line)}
                  </span>
                  {line.productSku ? (
                    <span className="block rc-num text-[11.5px] text-rc-muted-2 mt-0.5">
                      {line.productSku}
                    </span>
                  ) : null}
                </Td>
                <Td align="right" data-label="Cantitate" className={PHONE_CELL}>
                  <span className="rc-num whitespace-nowrap" data-testid="factura-linie-cantitate">
                    {formatQty(line.quantity, line.unit)}
                  </span>
                </Td>
                <Td align="right" data-label="Preț unitar" className={PHONE_CELL}>
                  <span className="rc-num whitespace-nowrap" data-testid="factura-linie-pret">
                    {formatMoneyExact(line.unitPriceMdl)}
                  </span>
                </Td>
                <Td align="right" data-label="TVA" className={PHONE_CELL}>
                  <span className="rc-num whitespace-nowrap" data-testid="factura-linie-tva">
                    {formatMoneyExact(line.lineVatMdl)}
                  </span>
                  <span
                    className="block text-[11.5px] text-rc-muted-2"
                    data-testid="factura-linie-tva-cota"
                  >
                    {formatRate(line.vatRate)}
                  </span>
                </Td>
                <Td align="right" data-label="Total linie" className={PHONE_CELL}>
                  <span
                    className="rc-num font-semibold whitespace-nowrap"
                    data-testid="factura-linie-total"
                  >
                    {formatMoneyExact(line.lineTotalMdl)}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>

        {/* SUBSOLUL, IN LEI CU DOI BANI, prin formatMoneyExact: totalul este suma pe
            care o plateste clientul si este scrisa pe un document, deci nu se
            rotunjeste la leu ca valoarea unui stoc. */}
        <div
          className="px-5 py-4 border-t border-rc-line flex justify-end"
          data-testid="factura-totaluri"
        >
          <dl className="w-[280px] space-y-1.5 max-md:w-full">
            <FootRow label="Subtotal" value={invoice.subtotalMdl} testId="factura-subtotal" />
            <FootRow label="TVA" value={invoice.vatTotalMdl} testId="factura-tva" />
            <FootRow label="Total de plată" value={invoice.totalMdl} testId="factura-total" strong />
          </dl>
        </div>
      </Card>

      {/* --------------------------------------------------- nota si anularea -- */}
      {invoice.notes ? (
        <Card className="mb-4">
          <CardHeader title="Notă" hint="Ce scrie pe factură" />
          <p className="p-5 text-[13px] text-rc-black whitespace-pre-line" data-testid="factura-nota">
            {invoice.notes}
          </p>
        </Card>
      ) : null}

      {invoice.status === "cancelled" ? (
        <Card className="mb-4">
          <CardHeader title="Anulare" hint="Numărul rămâne al acestei facturi" />
          <div className="p-5">
            <p className="text-[13px] text-rc-black whitespace-pre-line" data-testid="factura-motiv-anulare">
              {invoice.cancelReason ?? "Fără motiv scris."}
            </p>
          </div>
        </Card>
      ) : null}

      {/* ----------------------------------------------------------- istoricul -- */}
      <Card className="mb-3">
        <CardHeader
          title="Istoric"
          hint="Ce s-a întâmplat cu factura și când, cele mai noi întâi"
        />
        <div className="p-5">
          <ol className="relative pl-5" data-testid="factura-istoric">
            <span className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-rc-line" />
            {invoice.events.map((event, index) => (
              <li key={event.kind} className="relative pb-4 last:pb-0" data-testid="factura-istoric-eveniment">
                <span
                  className={[
                    "absolute -left-5 top-1 w-[11px] h-[11px] rounded-full border-2 border-white",
                    index === 0 ? "bg-rc-orange" : "bg-rc-muted-2",
                  ].join(" ")}
                />
                <p className="text-[13px] font-semibold">{invoiceEventLabel(event.kind)}</p>
                <p className="rc-num text-[11.5px] text-rc-muted-2 mt-0.5">{formatDateTime(event.at)}</p>
                {event.by ? (
                  <p className="text-[12.5px] text-rc-muted mt-0.5">{event.by}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </Card>

      <p className="text-[12.5px] text-rc-muted-2" data-testid="factura-in-lucru">
        {NOT_BUILT_YET}
      </p>
    </>
  );
}

/** Procentul, scris romanesc: 20 devine "20 %", 20,5 devine "20,5 %". */
function formatRate(rate: number): string {
  const shown = new Intl.NumberFormat("ro-MD", { maximumFractionDigits: 2 }).format(rate);
  return `${shown} %`;
}

/** Un rand eticheta si valoare. Pe telefon eticheta trece deasupra (P3-65). */
function Pair({
  label,
  value,
  empty = "Nu este completat",
  testId,
}: {
  label: string;
  value: string;
  empty?: string;
  testId: string;
}) {
  const filled = value.trim() !== "";
  return (
    <div className={`flex items-baseline gap-3 ${PHONE_ROW_PAIR}`}>
      <span className={`w-[110px] shrink-0 text-[12px] text-rc-muted ${PHONE_ROW_LABEL}`}>{label}</span>
      <span
        className={`text-[13px] ${filled ? "text-rc-black" : "text-rc-muted-2"} ${PHONE_ROW_VALUE}`}
        data-testid={testId}
      >
        {filled ? value : empty}
      </span>
    </div>
  );
}

function FootRow({
  label,
  value,
  testId,
  strong = false,
}: {
  label: string;
  value: number;
  testId: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={strong ? "text-[13.5px] font-semibold" : "text-[12.5px] text-rc-muted"}>{label}</dt>
      <dd
        className={`rc-num tabular-nums ${strong ? "text-[15px] font-bold" : "text-[13px]"}`}
        data-testid={testId}
      >
        {formatMoneyExact(value)}
      </dd>
    </div>
  );
}
