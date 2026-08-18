"use client";

// RC-07 Iesiri materiale.
//
// Iesirea este eliberare catre un proiect, nu vanzare cu amanuntul, si
// formularul trebuie sa se citeasca asa: intai clientul si santierul, apoi
// materialul care pleaca intr-acolo. Pretul de vanzare este optional si marcat
// vizibil ca atare, pentru ca Rapid Construct elibereaza des material catre
// propriul santier fara sa il tarifeze.

import * as React from "react";
import Link from "next/link";
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
import {
  DISPLAY_CURRENCY,
  formatDate,
  formatMoney,
  formatNumber,
  knownClients,
  knownProjects,
  unitLabel,
} from "@/lib/mock";
import type { OutboundIssue } from "@/lib/mock";
import { useStore } from "@/lib/store";

type Line = { key: string; productId: string; quantity: string; price: string };

let seq = 0;
const emptyLine = (): Line => {
  seq += 1;
  return { key: `o-${seq}`, productId: "", quantity: "", price: "" };
};

export default function OutboundPage() {
  const store = useStore();
  const [client, setClient] = React.useState("");
  const [project, setProject] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([emptyLine()]);
  const [touched, setTouched] = React.useState(false);
  const [created, setCreated] = React.useState<OutboundIssue | null>(null);

  const clientOptions: ComboOption[] = knownClients().map((c) => ({ value: c, label: c }));
  const projectOptions: ComboOption[] = knownProjects().map((p) => ({
    value: p.project,
    label: p.project,
    hint: p.client,
  }));
  const productOptions: ComboOption[] = store.products.map((p) => ({
    value: p.id,
    label: p.name,
    hint: `${p.sku} · stoc ${formatNumber(p.stock)} ${unitLabel(p.unit)}`,
  }));

  const setLine = (key: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const filled = lines.filter((l) => l.productId && Number(l.quantity) > 0);

  const problems: string[] = [];
  if (!client.trim()) problems.push("Completează clientul.");
  if (!project.trim()) problems.push("Completează proiectul.");
  if (filled.length === 0) problems.push("Adaugă cel puțin o poziție cu produs și cantitate.");
  for (const l of filled) {
    const p = store.products.find((x) => x.id === l.productId);
    if (p && Number(l.quantity) > p.stock) {
      problems.push(`Stoc insuficient pentru ${p.sku}: sunt ${formatNumber(p.stock)} ${unitLabel(p.unit)}.`);
    }
  }

  const pricedTotal = filled.reduce(
    (s, l) => s + (l.price ? Number(l.quantity) * Number(l.price) : 0),
    0,
  );

  function submit() {
    setTouched(true);
    if (problems.length > 0) return;

    const reference = store.nextOutboundReference();
    const now = new Date();
    const p2 = (n: number) => String(n).padStart(2, "0");
    const stampNow = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())} ${p2(now.getHours())}:${p2(now.getMinutes())}`;

    const issue: OutboundIssue = {
      id: `out-${reference}`,
      reference,
      clientName: client.trim(),
      projectName: project.trim(),
      issuedAt: stampNow.slice(0, 10),
      shippedAt: null,
      status: "În așteptare expediere",
      lines: filled.map((l) => ({
        productId: l.productId,
        quantity: Number(l.quantity),
        salePriceMdl: l.price ? Number(l.price) : null,
      })),
      history: [
        {
          at: stampNow,
          status: "În așteptare expediere",
          note: "Bon de eliberare creat de operator.",
          by: "Operator",
        },
      ],
    };

    store.addOutbound(issue);
    setCreated(issue);
  }

  if (created) {
    return (
      <>
        <PageHeader title="Bon de eliberare creat" lead="Materialul este pregătit pentru expediere." />
        <Card className="max-w-[720px]">
          <div className="px-7 py-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-rc-ok-soft text-rc-ok grid place-items-center text-[22px]">
              ✓
            </div>
            <p className="mt-4 text-[17px] font-bold text-rc-black">{created.reference}</p>
            <p className="text-[13.5px] text-rc-muted mt-1.5">
              {created.projectName} · {created.clientName} · {created.lines.length}{" "}
              {created.lines.length === 1 ? "poziție" : "poziții"} · emis {formatDate(created.issuedAt)}
            </p>
            <div className="mt-4 flex justify-center">
              <Chip tone="warn">În așteptare expediere</Chip>
            </div>
            <div className="mt-6 flex items-center justify-center gap-2.5">
              <Link href="/comenzi">
                <Button>Vezi în lista de comenzi</Button>
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

  return (
    <>
      <PageHeader
        title="Ieșiri materiale"
        lead="Eliberare de material către un șantier. Alege clientul și proiectul, apoi ce pleacă într-acolo."
      />

      <div className="space-y-4">
        <Card>
          <CardHeader title="Destinație" hint="Către cine și către ce șantier pleacă materialul" />
          <div className="p-5 grid grid-cols-2 gap-4">
            <Field label="Client" required>
              <Combobox
                options={clientOptions}
                value={client}
                onChange={setClient}
                creatable
                placeholder="Caută sau scrie un client nou"
              />
            </Field>
            <Field label="Proiect" required>
              <Combobox
                options={projectOptions}
                value={project}
                onChange={setProject}
                creatable
                placeholder="Caută sau scrie un proiect nou"
              />
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
              {lines.map((l) => {
                const product = store.products.find((p) => p.id === l.productId);
                const over = product ? Number(l.quantity) > product.stock : false;
                const total = l.price ? Number(l.quantity) * Number(l.price) : 0;
                return (
                  <tr key={l.key} className="align-top">
                    <Td>
                      <Combobox
                        options={productOptions}
                        value={l.productId}
                        onChange={(v) => setLine(l.key, { productId: v })}
                        placeholder="Caută produsul din catalog"
                      />
                      {product ? (
                        <p
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
                      />
                    </Td>
                    <Td align="right">
                      <span className="rc-num inline-block pt-2.5 text-[13.5px] font-semibold">
                        {total > 0 ? formatMoney(total) : <span className="text-rc-muted-2">fără preț</span>}
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
              Pozițiile fără preț sunt eliberări netarifate, de obicei către un șantier propriu.
              Nu blochează crearea bonului.
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
            La creare, bonul primește starea{" "}
            <span className="font-semibold text-rc-muted">În așteptare expediere</span>.
          </p>
          <Button onClick={submit} type="button">
            Creează bonul de eliberare
          </Button>
        </div>
      </div>
    </>
  );
}
