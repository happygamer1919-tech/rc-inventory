"use client";

// Fisa de comanda de intrare.
//
// Un singur component pentru doua drumuri: verificarea a ceea ce a "citit"
// procesarea simulata din documentul incarcat (RC-04) si introducerea manuala
// de la zero (RC-05). Daca ar exista doua componente, demonstratia ar spune
// doua povesti diferite despre aceleasi date, asa ca ecranul manual este
// literalmente aceeasi fisa, pornita goala.

import * as React from "react";
import {
  Button,
  Card,
  CardHeader,
  Chip,
  Field,
  Input,
  Select,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import {
  DISPLAY_CURRENCY,
  PRODUCTS,
  SUPPLIERS,
  formatMoney,
  formatNumber,
  getProduct,
  unitLabel,
} from "@/lib/mock";
import type { Currency, InboundOrder } from "@/lib/mock";
import { useStore } from "@/lib/store";

export type FormLine = {
  key: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  /** Ce scria pe documentul furnizorului, pastrat ca sa se vada corespondenta. */
  supplierArticle?: string;
  supplierDescription?: string;
};

export type OrderFormInitial = {
  supplierId: string;
  documentNumber: string;
  currency: Currency;
  orderedAt: string;
  expectedAt: string;
  paymentTerms: string;
  incoterms: string;
  lines: FormLine[];
};

export const EMPTY_INITIAL: OrderFormInitial = {
  supplierId: "",
  documentNumber: "",
  currency: "EUR",
  orderedAt: "",
  expectedAt: "",
  paymentTerms: "",
  incoterms: "",
  lines: [],
};

let lineSeq = 0;
export function newLine(): FormLine {
  lineSeq += 1;
  return { key: `l-${lineSeq}`, productId: "", quantity: "", unitPrice: "" };
}

export function OrderForm({
  initial,
  mode,
  onConfirmed,
}: {
  initial: OrderFormInitial;
  mode: "review" | "manual";
  onConfirmed: (order: InboundOrder) => void;
}) {
  const store = useStore();

  const [supplierId, setSupplierId] = React.useState(initial.supplierId);
  const [documentNumber, setDocumentNumber] = React.useState(initial.documentNumber);
  const [currency, setCurrency] = React.useState<Currency>(initial.currency);
  const [orderedAt, setOrderedAt] = React.useState(initial.orderedAt);
  const [expectedAt, setExpectedAt] = React.useState(initial.expectedAt);
  const [paymentTerms, setPaymentTerms] = React.useState(initial.paymentTerms);
  const [incoterms, setIncoterms] = React.useState(initial.incoterms);
  const [lines, setLines] = React.useState<FormLine[]>(
    initial.lines.length > 0 ? initial.lines : [newLine()],
  );
  const [touched, setTouched] = React.useState(false);

  const setLine = (key: string, patch: Partial<FormLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const removeLine = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));
  const addLine = () => setLines((ls) => [...ls, newLine()]);

  /** Valoarea in moneda comenzii, din cantitate ori pret. */
  const orderTotal = lines.reduce(
    (s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0),
    0,
  );

  /** Valoarea in MDL nu este o conversie: nu exista sursa de curs in faza 1.
   *  Se insumeaza valorile in MDL deja stocate pe fiecare produs din catalog. */
  const totalMdl = lines.reduce((s, l) => {
    const p = getProduct(l.productId);
    return s + (Number(l.quantity) || 0) * (p?.unitValueMdl ?? 0);
  }, 0);

  const filledLines = lines.filter((l) => l.productId && Number(l.quantity) > 0);
  const problems: string[] = [];
  if (!supplierId) problems.push("Alege furnizorul.");
  if (!expectedAt) problems.push("Completează data estimată de livrare.");
  if (filledLines.length === 0) problems.push("Adaugă cel puțin o poziție cu produs și cantitate.");

  const canConfirm = problems.length === 0;

  function confirm() {
    setTouched(true);
    if (!canConfirm) return;

    const reference = store.nextInboundReference();
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const stampNow = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;

    const order: InboundOrder = {
      id: `in-${reference}`,
      reference,
      supplierId,
      currency,
      totalMdl: Math.round(totalMdl),
      orderedAt: orderedAt || stampNow.slice(0, 10),
      expectedAt,
      arrivedAt: null,
      status: "În așteptare",
      lines: filledLines.map((l) => ({
        productId: l.productId,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice) || 0,
      })),
      history: [
        {
          at: stampNow,
          status: "În așteptare",
          note:
            mode === "review"
              ? `Comandă creată din documentul ${documentNumber || "încărcat"}, după verificarea operatorului.`
              : "Comandă introdusă manual de operator.",
          by: "Operator",
        },
      ],
    };

    store.addInbound(order);
    onConfirmed(order);
  }

  const showProblems = touched && problems.length > 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Detalii comandă"
          hint={
            mode === "review"
              ? "Verifică ce a fost citit din document și corectează orice câmp"
              : "Completează datele comenzii de la furnizor"
          }
          right={
            mode === "review" ? (
              <Chip tone="orange">Precompletat din document</Chip>
            ) : (
              <Chip tone="neutral">Formular gol</Chip>
            )
          }
        />
        <div className="p-5 grid grid-cols-3 gap-4">
          <Field label="Furnizor" required>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Alege furnizorul</option>
              {SUPPLIERS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.country})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Număr document" hint="Numărul confirmării de la furnizor">
            <Input
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value)}
              placeholder="ex. BLK-2026-14507"
            />
          </Field>
          <Field label="Monedă" required>
            <Select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              <option value="EUR">EUR</option>
              <option value="RON">RON</option>
            </Select>
          </Field>
          <Field label="Data comenzii">
            <Input type="date" value={orderedAt} onChange={(e) => setOrderedAt(e.target.value)} />
          </Field>
          <Field label="Livrare estimată" required>
            <Input type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} />
          </Field>
          <Field label="Condiții de plată">
            <Input
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              placeholder="ex. 30 zile net"
            />
          </Field>
          <Field label="Condiții de livrare" className="col-span-3">
            <Input
              value={incoterms}
              onChange={(e) => setIncoterms(e.target.value)}
              placeholder="ex. DAP Chișinău"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Poziții"
          hint="Unitatea de măsură este fixată de produsul ales și nu se poate schimba aici"
          right={
            <Button size="sm" variant="secondary" onClick={addLine} type="button">
              + Adaugă poziție
            </Button>
          }
        />
        <Table>
          <thead>
            <tr>
              <Th className="w-[38%]">Produs</Th>
              <Th align="right">Cantitate</Th>
              <Th>Unitate</Th>
              <Th align="right">Preț unitar ({currency})</Th>
              <Th align="right">Total linie</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const product = getProduct(l.productId);
              const lineTotal = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
              return (
                <tr key={l.key} className="align-top">
                  <Td>
                    <Select
                      value={l.productId}
                      onChange={(e) => setLine(l.key, { productId: e.target.value })}
                    >
                      <option value="">Alege produsul din catalog</option>
                      {PRODUCTS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} - {p.name}
                        </option>
                      ))}
                    </Select>
                    {l.supplierArticle ? (
                      <p className="text-[11.5px] text-rc-muted-2 mt-1.5">
                        Pe document:{" "}
                        <span className="font-semibold text-rc-muted">{l.supplierArticle}</span>
                        {l.supplierDescription ? ` - ${l.supplierDescription}` : null}
                      </p>
                    ) : null}
                  </Td>
                  <Td align="right">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      className="text-right rc-num"
                      value={l.quantity}
                      onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                      placeholder="0"
                    />
                  </Td>
                  <Td>
                    <span className="inline-flex items-center h-[38px] px-2.5 rounded-[10px] bg-rc-paper border border-rc-line text-[13px] text-rc-muted">
                      {product ? unitLabel(product.unit) : "-"}
                    </span>
                  </Td>
                  <Td align="right">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      className="text-right rc-num"
                      value={l.unitPrice}
                      onChange={(e) => setLine(l.key, { unitPrice: e.target.value })}
                      placeholder="0.00"
                    />
                  </Td>
                  <Td align="right">
                    <span className="rc-num inline-block pt-2.5 text-[13.5px] font-semibold">
                      {lineTotal > 0 ? `${formatNumber(lineTotal)} ${currency}` : "-"}
                    </span>
                  </Td>
                  <Td align="right">
                    <button
                      type="button"
                      onClick={() => removeLine(l.key)}
                      disabled={lines.length === 1}
                      title="Elimină poziția"
                      className="mt-2 w-8 h-8 rounded-[9px] text-rc-muted hover:bg-rc-danger-soft hover:text-rc-danger disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-rc-muted transition-colors"
                    >
                      ✕
                    </button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>

        <div className="flex items-start justify-between gap-6 px-5 py-4 bg-rc-paper border-t border-rc-line">
          <div className="text-[12px] text-rc-muted max-w-[52ch] leading-relaxed">
            Valoarea în {DISPLAY_CURRENCY} nu este o conversie valutară. Faza 1 nu are sursă de curs,
            așa că se însumează valorile în {DISPLAY_CURRENCY} deja stocate pe fiecare produs din catalog.
          </div>
          <div className="text-right shrink-0">
            <p className="text-[12.5px] text-rc-muted">
              Total comandă:{" "}
              <span className="rc-num font-bold text-rc-black text-[15px]">
                {formatNumber(orderTotal)} {currency}
              </span>
            </p>
            <p className="text-[12.5px] text-rc-muted mt-1">
              Valoare în {DISPLAY_CURRENCY}:{" "}
              <span className="rc-num font-semibold text-rc-black">{formatMoney(totalMdl)}</span>
            </p>
          </div>
        </div>
      </Card>

      {showProblems ? (
        <div className="rounded-[12px] border border-rc-danger/30 bg-rc-danger-soft px-5 py-3.5">
          <p className="text-[13px] font-semibold text-rc-danger">
            Mai lipsește ceva înainte de confirmare
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {problems.map((p) => (
              <li key={p} className="text-[12.5px] text-rc-danger">
                {p}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <p className="text-[12.5px] text-rc-muted-2">
          La confirmare, comanda intră în listă cu starea{" "}
          <span className="font-semibold text-rc-muted">În așteptare</span>. Loturile se creează abia
          la recepție.
        </p>
        <Button onClick={confirm} type="button">
          Confirmă comanda
        </Button>
      </div>
    </div>
  );
}
