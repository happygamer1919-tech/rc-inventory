"use client";

// Fisa comenzii de intrare, pe date reale.
//
// Un singur component pentru doua drumuri, exact ca in faza 1: introducerea
// manuala de la zero (acest card) si verificarea a ceea ce a citit extragerea
// automata (P2-09, care il refoloseste cu initial precompletat). Daca ar exista
// doua componente, cele doua drumuri ar diverge si sistemul ar spune doua
// povesti diferite despre aceleasi date.
//
// Aspectul este cel din faza 1: aceleasi carduri, aceleasi campuri, aceeasi
// ordine, acelasi subsol cu totalurile si aceeasi explicatie despre MDL.

import * as React from "react";
import { useRouter } from "next/navigation";
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
import { DateField } from "@/components/ui/DateField";
import {
  PHONE_CELL,
  PHONE_CLOSE,
  PHONE_ROW,
  PHONE_STACK,
  PHONE_TABLE,
  PHONE_WIDE,
} from "@/components/ui/phone";
import {
  DISPLAY_CURRENCY,
  formatDateWords,
  formatMoney,
  formatNumber,
} from "@/lib/data/format";
import { unitLabel } from "@/lib/data/units";
import type { CatalogProduct } from "@/lib/data/products";
import { createInboundOrder } from "@/lib/data/inbound-actions";

// P3-41. Ziua aleasa, scrisa in cuvinte sub campul de data.
//
// Campul nativ aseza ziua si luna dupa limba browserului, deci pe un browser in
// engleza aceleasi taste puteau pastra alta zi decat cea gandita. Cardul P3-49 a
// scos cu totul campul nativ de sub ochii operatorului si a pus in locul lui
// campul romanesc zz.ll.aaaa, care citeste intai ziua pe orice calculator, deci
// divergenta nu mai exista. Textul scris in cuvinte RAMANE: el spune ziua care
// se va salva, se schimba odata cu campul si lipseste cand campul este gol,
// fiindca o data de umplutura sub un camp optional ar parea aleasa.
function DateInWords({ value, testId }: { value: string; testId: string }) {
  const words = formatDateWords(value);
  if (!words) return null;
  return (
    <span className="block text-[12px] text-rc-muted mt-1" data-testid={testId}>
      {words}
    </span>
  );
}

export type FormLine = {
  key: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  supplierArticle?: string;
  supplierDescription?: string;
};

export type InboundFormInitial = {
  supplierName: string;
  currency: string;
  orderedAt: string;
  expectedAt: string;
  lines: FormLine[];
};

export const EMPTY_INITIAL: InboundFormInitial = {
  supplierName: "",
  currency: "EUR",
  orderedAt: "",
  expectedAt: "",
  lines: [],
};

let lineSeq = 0;
function newLine(): FormLine {
  lineSeq += 1;
  return { key: `l-${lineSeq}`, productId: "", quantity: "", unitPrice: "" };
}

export function InboundOrderForm({
  initial,
  mode,
  products,
  suppliers,
  onCreated,
}: {
  initial: InboundFormInitial;
  mode: "review" | "manual";
  products: CatalogProduct[];
  suppliers: string[];
  onCreated: (order: { id: string; reference: string; lineCount: number }) => void;
}) {
  const router = useRouter();

  const [supplierName, setSupplierName] = React.useState(initial.supplierName);
  const [currency, setCurrency] = React.useState(initial.currency);
  const [orderedAt, setOrderedAt] = React.useState(initial.orderedAt);
  const [expectedAt, setExpectedAt] = React.useState(initial.expectedAt);
  const [lines, setLines] = React.useState<FormLine[]>(
    initial.lines.length > 0 ? initial.lines : [newLine()],
  );
  const [touched, setTouched] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const byId = React.useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const setLine = (key: string, patch: Partial<FormLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));
  const addLine = () => setLines((ls) => [...ls, newLine()]);

  const orderTotal = lines.reduce(
    (s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0),
    0,
  );

  // Valoarea in MDL nu este o conversie: nu exista sursa de curs valutar.
  // Se insumeaza valorile in MDL deja stocate pe fiecare produs din catalog.
  const totalMdl = lines.reduce(
    (s, l) => s + (Number(l.quantity) || 0) * (byId.get(l.productId)?.unitValueMdl ?? 0),
    0,
  );

  const filledLines = lines.filter((l) => l.productId && Number(l.quantity) > 0);
  const problems: string[] = [];
  if (!supplierName.trim()) problems.push("Completează furnizorul.");
  if (!expectedAt) problems.push("Completează data estimată de livrare.");
  if (filledLines.length === 0) problems.push("Adaugă cel puțin o poziție cu produs și cantitate.");

  const showProblems = touched && problems.length > 0;

  async function confirm() {
    setTouched(true);
    setServerError(null);
    if (problems.length > 0) return;

    setPending(true);
    const result = await createInboundOrder({
      supplierName,
      currency,
      orderedAt,
      expectedAt,
      lines: filledLines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      })),
    });

    if (!result.ok) {
      setServerError(result.message);
      setPending(false);
      return;
    }

    router.refresh();
    onCreated({
      id: result.value.id,
      reference: result.value.reference,
      lineCount: filledLines.length,
    });
  }

  if (products.length === 0) {
    return (
      <Card>
        <div className="px-7 py-12 text-center" data-testid="inbound-no-products">
          <p className="text-[15px] font-semibold text-rc-black">Catalogul este gol</p>
          <p className="text-[13px] text-rc-muted mt-2 max-w-[52ch] mx-auto">
            O comandă de intrare are nevoie de produse. Adaugă cel puțin un produs în Inventar
            înainte de a introduce o comandă.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="inbound-form">
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
        <div className={`p-5 grid grid-cols-3 gap-4 ${PHONE_STACK}`}>
          <Field label="Furnizor" required>
            <Input
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              list="rc-inbound-suppliers"
              placeholder="Numele furnizorului"
              data-testid="order-supplier"
            />
            <datalist id="rc-inbound-suppliers">
              {suppliers.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field label="Monedă" required>
            <Select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              data-testid="order-currency"
            >
              <option value="EUR">EUR</option>
              <option value="RON">RON</option>
              <option value="MDL">MDL</option>
            </Select>
          </Field>
          <Field label="Data comenzii">
            <DateField
              value={orderedAt}
              onChange={setOrderedAt}
              testId="order-ordered-at"
            />
            <DateInWords value={orderedAt} testId="order-ordered-at-words" />
          </Field>
          <Field label="Livrare estimată" required>
            <DateField
              value={expectedAt}
              onChange={setExpectedAt}
              testId="order-expected-at"
            />
            <DateInWords value={expectedAt} testId="order-expected-at-words" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Poziții"
          hint="Unitatea de măsură este fixată de produsul ales și nu se poate schimba aici"
          right={
            <Button size="sm" variant="secondary" onClick={addLine} type="button" data-testid="order-add-line">
              + Adaugă poziție
            </Button>
          }
        />
        {/* P3-65. Pe telefon (sub 768px) fiecare pozitie devine un card: produsul
            pe toata latimea, apoi cantitatea, unitatea, pretul si totalul, fiecare
            cu antetul coloanei ca eticheta. Peste 768px tabelul este cel de azi. */}
        <div className={PHONE_TABLE}>
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
            {lines.map((l, index) => {
              const product = byId.get(l.productId);
              const lineTotal = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
              return (
                <tr key={l.key} className={`align-top ${PHONE_ROW}`}>
                  <Td data-label="Produs" className={PHONE_WIDE}>
                    <Select
                      value={l.productId}
                      onChange={(e) => setLine(l.key, { productId: e.target.value })}
                      data-testid={`line-product-${index}`}
                    >
                      <option value="">Alege produsul din catalog</option>
                      {products.map((p) => (
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
                  <Td align="right" data-label="Cantitate" className={PHONE_CELL}>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      className="text-right rc-num"
                      value={l.quantity}
                      onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                      placeholder="0"
                      data-testid={`line-quantity-${index}`}
                    />
                  </Td>
                  <Td data-label="Unitate" className={PHONE_CELL}>
                    <span className="inline-flex items-center h-[38px] px-2.5 rounded-[10px] bg-rc-paper border border-rc-line text-[13px] text-rc-muted max-md:h-11">
                      {product ? unitLabel(product.unit) : "-"}
                    </span>
                  </Td>
                  <Td align="right" data-label={`Preț unitar (${currency})`} className={PHONE_CELL}>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      className="text-right rc-num"
                      value={l.unitPrice}
                      onChange={(e) => setLine(l.key, { unitPrice: e.target.value })}
                      placeholder="0.00"
                      data-testid={`line-price-${index}`}
                    />
                  </Td>
                  <Td align="right" data-label="Total linie" className={PHONE_CELL}>
                    <span className="rc-num inline-block pt-2.5 text-[13.5px] font-semibold">
                      {lineTotal > 0 ? `${formatNumber(lineTotal)} ${currency}` : "-"}
                    </span>
                  </Td>
                  {/* Fara max-md:text-left: butonul de eliminare ramane in dreapta cardului. */}
                  <Td align="right" className="max-md:col-span-2 max-md:block max-md:border-b-0 max-md:p-0">
                    <button
                      type="button"
                      onClick={() => removeLine(l.key)}
                      disabled={lines.length === 1}
                      title="Elimină poziția"
                      className={`mt-2 w-8 h-8 rounded-[9px] text-rc-muted hover:bg-rc-danger-soft hover:text-rc-danger disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-rc-muted transition-colors max-md:mt-0 ${PHONE_CLOSE}`}
                    >
                      ✕
                    </button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        </div>

        <div className="flex items-start justify-between gap-6 px-5 py-4 bg-rc-paper border-t border-rc-line max-md:flex-col max-md:gap-3">
          <div className="text-[12px] text-rc-muted max-w-[52ch] leading-relaxed">
            Valoarea în {DISPLAY_CURRENCY} nu este o conversie valutară. Nu există sursă de curs, așa
            că se însumează valorile în {DISPLAY_CURRENCY} deja stocate pe fiecare produs din catalog.
          </div>
          <div className="text-right shrink-0 max-md:text-left">
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
          <ul className="mt-1.5 space-y-0.5" data-testid="order-problems">
            {problems.map((p) => (
              <li key={p} className="text-[12.5px] text-rc-danger">
                {p}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {serverError ? (
        <div
          role="alert"
          data-testid="order-error"
          className="rounded-[12px] border border-rc-danger/30 bg-rc-danger-soft px-5 py-3.5 text-[13px] text-rc-danger"
        >
          {serverError}
        </div>
      ) : null}

      <div className="flex items-center justify-between max-md:flex-col max-md:items-stretch max-md:gap-3">
        <p className="text-[12.5px] text-rc-muted-2">
          La confirmare, comanda intră în listă cu starea{" "}
          <span className="font-semibold text-rc-muted">În așteptare</span>. Loturile se creează abia
          la recepție.
        </p>
        <Button onClick={confirm} type="button" disabled={pending} data-testid="order-confirm">
          {pending ? "Se salvează..." : "Confirmă comanda"}
        </Button>
      </div>
    </div>
  );
}
