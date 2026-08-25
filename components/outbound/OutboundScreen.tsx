"use client";

// P2-05 Iesiri materiale, pe date reale.
//
// Eliberare catre santier, nu vanzare cu amanuntul. Marcajul este cel din faza
// 1: aceleasi carduri, aceleasi coloane, acelasi subsol, acelasi Combobox cu
// portalul si filtrarea lui fara diacritice, refolosit NESCHIMBAT.
//
// SUPRATRAGEREA ESTE BLOCATA, NU AVERTIZATA. Faza 1 avertiza pe linie, pentru ca
// nu scria nimic. Faza 2 scrie, deci refuza. Verificarea exista in trei locuri:
// aici (ca operatorul afle imediat), in server action (pentru ca o verificare
// din browser este o curtoazie), si sub blocaj in migratia 0004 (aceea este
// garantia, singura care rezista la doi operatori simultani).

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardHeader,
  Chip,
  Field,
  Input,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import { Combobox } from "@/components/ui/Combobox";
import type { ComboOption } from "@/components/ui/Combobox";
import { DISPLAY_CURRENCY, formatDate, formatMoney, formatNumber } from "@/lib/data/format";
import { unitLabel } from "@/lib/data/units";
import type { CatalogProduct } from "@/lib/data/products";
import { createOutboundIssue } from "@/lib/data/outbound-actions";

type Line = { key: string; productId: string; quantity: string; price: string };

let seq = 0;
function emptyLine(): Line {
  seq += 1;
  return { key: `o-${seq}`, productId: "", quantity: "", price: "" };
}

type Created = {
  id: string;
  reference: string;
  clientName: string;
  projectName: string;
  lineCount: number;
};

export function OutboundScreen({
  products,
  clients,
  projects,
}: {
  products: CatalogProduct[];
  clients: string[];
  projects: string[];
}) {
  const router = useRouter();
  const [client, setClient] = React.useState("");
  const [project, setProject] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([emptyLine()]);
  const [touched, setTouched] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<Created | null>(null);

  const byId = React.useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const clientOptions: ComboOption[] = clients.map((c) => ({ value: c, label: c }));
  const projectOptions: ComboOption[] = projects.map((p) => ({ value: p, label: p }));
  const productOptions: ComboOption[] = products.map((p) => ({
    value: p.id,
    label: p.name,
    hint: `${p.sku} · stoc ${formatNumber(p.stock)} ${unitLabel(p.unit)}`,
  }));

  const setLine = (key: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const filled = lines.filter((l) => l.productId && Number(l.quantity) > 0);

  // Cantitatile aceluiasi produs se aduna INAINTE de verificare: 100 impartit in
  // doua linii de 50 nu are voie sa treaca o verificare pe care 50 ar pica-o.
  const wantedByProduct = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const l of filled) m.set(l.productId, (m.get(l.productId) ?? 0) + Number(l.quantity));
    return m;
  }, [filled]);

  const problems: string[] = [];
  if (!client.trim()) problems.push("Completează clientul.");
  if (!project.trim()) problems.push("Completează proiectul.");
  if (filled.length === 0) problems.push("Adaugă cel puțin o poziție cu produs și cantitate.");
  for (const [productId, wanted] of wantedByProduct) {
    const p = byId.get(productId);
    if (p && wanted > p.stock) {
      problems.push(
        `Stoc insuficient pentru ${p.name}: disponibil ${formatNumber(p.stock)} ${unitLabel(p.unit)}.`,
      );
    }
  }

  const pricedTotal = filled.reduce(
    (s, l) => s + (l.price ? Number(l.quantity) * Number(l.price) : 0),
    0,
  );

  async function submit() {
    setTouched(true);
    setServerError(null);
    if (problems.length > 0) return;

    setPending(true);
    const result = await createOutboundIssue({
      clientName: client,
      projectName: project,
      lines: filled.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        salePriceMdl: l.price,
      })),
    });

    if (!result.ok) {
      setServerError(result.message);
      setPending(false);
      return;
    }

    router.refresh();
    setCreated({
      id: result.value.id,
      reference: result.value.reference,
      clientName: client.trim(),
      projectName: project.trim(),
      lineCount: filled.length,
    });
    setPending(false);
  }

  if (created) {
    return (
      <>
        <PageHeader
          title="Bon de eliberare creat"
          lead="Materialul este pregătit pentru expediere."
        />
        <Card className="max-w-[720px]">
          <div className="px-7 py-8 text-center" data-testid="issue-created">
            <div className="mx-auto w-12 h-12 rounded-full bg-rc-ok-soft text-rc-ok grid place-items-center text-[22px]">
              ✓
            </div>
            <p
              className="mt-4 text-[17px] font-bold text-rc-black"
              data-testid="issue-reference"
            >
              {created.reference}
            </p>
            <p className="text-[13.5px] text-rc-muted mt-1.5">
              {created.projectName} · {created.clientName} · {created.lineCount}{" "}
              {created.lineCount === 1 ? "poziție" : "poziții"} · emis{" "}
              {formatDate(new Date().toISOString())}
            </p>
            <div className="mt-4 flex justify-center">
              <Chip tone="warn">În așteptare expediere</Chip>
            </div>
            <div className="mt-6 flex items-center justify-center gap-2.5">
              <Link href="/comenzi">
                <Button data-testid="issue-go-to-orders">Vezi în lista de comenzi</Button>
              </Link>
              <Button
                variant="secondary"
                onClick={() => {
                  setCreated(null);
                  setClient("");
                  setProject("");
                  setLines([emptyLine()]);
                  setTouched(false);
                }}
              >
                Creează alt bon
              </Button>
            </div>
          </div>
        </Card>
      </>
    );
  }

  if (products.length === 0) {
    return (
      <>
        <PageHeader
          title="Ieșiri materiale"
          lead="Eliberare de material către un șantier."
        />
        <Card>
          <div className="px-7 py-12 text-center" data-testid="outbound-no-products">
            <p className="text-[15px] font-semibold text-rc-black">Catalogul este gol</p>
            <p className="text-[13px] text-rc-muted mt-2 max-w-[52ch] mx-auto">
              Nu se poate elibera material care nu există în catalog. Adaugă produse în Inventar și
              recepționează o comandă de intrare ca să existe stoc.
            </p>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Ieșiri materiale"
        lead="Eliberare de material către un șantier. Alege clientul și proiectul, apoi ce pleacă într-acolo."
      />

      <div className="space-y-4" data-testid="outbound-form">
        <Card>
          <CardHeader title="Destinație" hint="Către cine și către ce șantier pleacă materialul" />
          <div className="p-5 grid grid-cols-2 gap-4">
            <Field label="Client" required>
              <div data-testid="field-client">
                <Combobox
                  options={clientOptions}
                  value={client}
                  onChange={setClient}
                  creatable
                  placeholder="Caută sau scrie un client nou"
                />
              </div>
            </Field>
            <Field label="Proiect" required>
              <div data-testid="field-project">
                <Combobox
                  options={projectOptions}
                  value={project}
                  onChange={setProject}
                  creatable
                  placeholder="Caută sau scrie un proiect nou"
                />
              </div>
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Materiale"
            hint="Cantitatea este în unitatea fixă a produsului. Prețul este opțional."
            right={
              <Button
                size="sm"
                variant="secondary"
                type="button"
                onClick={() => setLines((ls) => [...ls, emptyLine()])}
                data-testid="issue-add-line"
              >
                + Adaugă poziție
              </Button>
            }
          />
          <Table>
            <thead>
              <tr>
                <Th className="w-[42%]">Produs</Th>
                <Th align="right">Cantitate</Th>
                <Th>Unitate</Th>
                <Th align="right">Preț unitar ({DISPLAY_CURRENCY})</Th>
                <Th align="right">Total linie</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, index) => {
                const product = byId.get(l.productId);
                const over = product ? (wantedByProduct.get(l.productId) ?? 0) > product.stock : false;
                const total = l.price ? Number(l.quantity) * Number(l.price) : 0;
                return (
                  <tr key={l.key} className="align-top">
                    <Td>
                      <div data-testid={`issue-product-${index}`}>
                        <Combobox
                          options={productOptions}
                          value={l.productId}
                          onChange={(v) => setLine(l.key, { productId: v })}
                          placeholder="Caută produsul din catalog"
                        />
                      </div>
                      {product ? (
                        <p
                          data-testid={`issue-stock-hint-${index}`}
                          className={[
                            "text-[11.5px] mt-1.5",
                            over ? "text-rc-danger font-semibold" : "text-rc-muted-2",
                          ].join(" ")}
                        >
                          {over ? "Stoc insuficient. " : ""}
                          În stoc: {formatNumber(product.stock)} {unitLabel(product.unit)}
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
                        data-testid={`issue-quantity-${index}`}
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
                        value={l.price}
                        onChange={(e) => setLine(l.key, { price: e.target.value })}
                        placeholder="lasă gol"
                        data-testid={`issue-price-${index}`}
                      />
                    </Td>
                    <Td align="right">
                      <span className="rc-num inline-block pt-2.5 text-[13.5px] font-semibold">
                        {total > 0 ? (
                          formatMoney(total)
                        ) : (
                          <span className="text-rc-muted-2">fără preț</span>
                        )}
                      </span>
                    </Td>
                    <Td align="right">
                      <button
                        type="button"
                        onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                        disabled={lines.length === 1}
                        title="Elimină poziția"
                        className="mt-2 w-8 h-8 rounded-[9px] text-rc-muted hover:bg-rc-danger-soft hover:text-rc-danger disabled:opacity-30 transition-colors"
                      >
                        ✕
                      </button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <div className="flex items-center justify-between gap-6 px-5 py-4 bg-rc-paper border-t border-rc-line">
            <p className="text-[12px] text-rc-muted max-w-[54ch] leading-relaxed">
              Pozițiile fără preț sunt eliberări netarifate, de obicei către un șantier propriu. Nu
              blochează crearea bonului.
            </p>
            <p className="text-[12.5px] text-rc-muted shrink-0">
              Total tarifat:{" "}
              <span className="rc-num font-bold text-rc-black text-[15px]">
                {formatMoney(pricedTotal)}
              </span>
            </p>
          </div>
        </Card>

        {touched && problems.length > 0 ? (
          <div className="rounded-[12px] border border-rc-danger/30 bg-rc-danger-soft px-5 py-3.5">
            <p className="text-[13px] font-semibold text-rc-danger">
              Mai lipsește ceva înainte de creare
            </p>
            <ul className="mt-1.5 space-y-0.5" data-testid="issue-problems">
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
            data-testid="issue-error"
            className="rounded-[12px] border border-rc-danger/30 bg-rc-danger-soft px-5 py-3.5 text-[13px] text-rc-danger"
          >
            {serverError}
          </div>
        ) : null}

        <div className="flex items-center justify-between">
          <p className="text-[12.5px] text-rc-muted-2">
            La creare, bonul primește starea{" "}
            <span className="font-semibold text-rc-muted">În așteptare expediere</span>, iar stocul
            scade imediat: materialul a plecat fizic din depozit.
          </p>
          <Button onClick={submit} type="button" disabled={pending} data-testid="issue-submit">
            {pending ? "Se creează..." : "Creează bonul de eliberare"}
          </Button>
        </div>
      </div>
    </>
  );
}
