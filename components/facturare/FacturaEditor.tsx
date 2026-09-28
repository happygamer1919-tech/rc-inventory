"use client";

// Ecranul pe care se face o factura. Cardul P3-110, goal G65 partea 3.
//
// UN SINGUR ECRAN PENTRU CELE TREI CAI, si de aceea un singur component:
//
//   /facturare/nou?iesire=<id>   completat din Iesire: clientul si proiectul sunt
//                                CITITE de pe ea si nu tastate, si exista o linie per
//                                linie de iesire, cu cantitatea, unitatea si pretul ei
//   /facturare/nou               calea manuala, cu totul ales de mana
//   /facturare/<id>/modifica     aceeasi forma, incarcata de pe o ciorna salvata
//
// NIMIC NU ESTE SCRIS PANA LA APASARE. Formularul tine liniile, iar ele se scriu
// intr-un singur moment: la Salvează ciorna sau la Emite. De aici vine si singurul
// lucru pe care acest ecran nu il poate face pe o ciorna DEJA salvata: sa scoata o
// linie. public.invoice_lines nu are nici drept de stergere nici politica de stergere
// (migratia 0063, sectiunile 9 si 10), iar linia goalului spune "Nothing is ever
// deleted", deci nu exista cod care sa o poata scoate. Cat timp factura se COMPUNE,
// scoaterea unei linii nu sterge nimic si este libera; o linie deja scrisa are butonul
// dezactivat CU MOTIVUL LANGA EL, si ecranul spune ce se face in schimb: se anuleaza
// ciorna cu un motiv si se face o factura noua. Un buton gri fara nicio propozitie este
// defectul pentru care au fost ridicate cardurile P3-61 si P3-98.
//
// TOTALURILE DE PE ACEST ECRAN SUNT O PREVIZUALIZARE. Cele stocate sunt scrise de
// declansatoarele invoice_lines_compute_totals si invoice_lines_sync_invoice_totals din
// 0063, si nimic de aici nu trimite un total catre baza. Aritmetica de mai jos
// ROTUNJESTE IN ACEEASI ORDINE ca declansatorul, o data pe figura, tocmai ca numarul de
// pe ecran sa nu difere de cel scris: subtotalul liniei se rotunjeste, TVA se calculeaza
// din subtotalul ROTUNJIT si se rotunjeste la rand, iar subsolul aduna figuri deja
// rotunjite. Rotunjirea numai la final da alt numar si o coloana care nu se adună.
//
// EMITE INTREABA INTAI, o singura propozitie, si numeste numarul pe care il va lua
// factura. Pe acest ecran Emite inseamna doua lucruri: se salveaza ciorna, apoi se
// emite, fiindca o factura nu poate fi emisa inainte sa existe.
//
// CASUTELE DE DATA SUNT CELE ROMANESTI ALE CARDULUI P3-49, zz.ll.aaaa, si nu un
// <input type="date">: campul nativ aseaza ziua si luna dupa limba browserului.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Select,
  Table,
  Td,
  Textarea,
  Th,
} from "@/components/ui/primitives";
import { Combobox, type ComboOption } from "@/components/ui/Combobox";
import { DateField, useInvalidDates } from "@/components/ui/DateField";
import {
  PHONE_ACTIONS_CELL,
  PHONE_CELL,
  PHONE_CONTROL,
  PHONE_STACK,
  PHONE_TABLE,
  PHONE_TAP,
  PHONE_ROW,
  PHONE_WIDE,
} from "@/components/ui/phone";
import { formatMoneyExact } from "@/lib/data/format";
import { ALL_UNITS, unitLabel, type UnitCode } from "@/lib/data/units";
import { VAT_NOTE } from "@/lib/data/facturare-types";
import type {
  InvoiceEditorOptions,
  InvoiceEditorView,
} from "@/lib/data/facturare-create-types";
import { issueInvoice, saveInvoiceDraft } from "@/lib/data/facturare-actions";

/** O linie in formular: ce a venit de pe server, plus o cheie de randare. */
type Line = {
  key: string;
  /** Id-ul randului din baza, sau sir gol pentru o linie care nu a fost scrisa. */
  id: string;
  productId: string;
  productName: string;
  description: string;
  unit: UnitCode;
  quantity: string;
  unitPrice: string;
};

let seq = 0;
function emptyLine(): Line {
  seq += 1;
  return {
    key: `f-${seq}`,
    id: "",
    productId: "",
    productName: "",
    description: "",
    unit: "pcs",
    quantity: "",
    unitPrice: "",
  };
}

/** Bani rotunjiti la banut, exact ca `round(..., 2)` din declansator. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Numarul dintr-un camp, cu virgula zecimala acceptata, sau 0 cand nu este un numar. */
function num(raw: string): number {
  const value = Number(raw.trim().replace(",", "."));
  return Number.isFinite(value) ? value : 0;
}

export function FacturaEditor({
  view,
  options,
}: {
  view: InvoiceEditorView;
  options: InvoiceEditorOptions;
}) {
  const router = useRouter();

  const [clientId, setClientId] = React.useState(view.clientId);
  const [projectId, setProjectId] = React.useState(view.projectId);
  const [issueDate, setIssueDate] = React.useState(view.issueDate);
  const [dueDate, setDueDate] = React.useState(view.dueDate);
  const [notes, setNotes] = React.useState(view.notes);
  const [vatRate, setVatRate] = React.useState(view.vatRate);
  const [lines, setLines] = React.useState<Line[]>(() =>
    view.lines.length === 0
      ? [emptyLine()]
      : view.lines.map((l) => {
          seq += 1;
          return { ...l, key: `f-${seq}` };
        }),
  );
  const [touched, setTouched] = React.useState(false);
  const [asking, setAsking] = React.useState(false);
  const [busy, setBusy] = React.useState<null | "save" | "issue">(null);
  const [error, setError] = React.useState<string | null>(null);

  // P3-92. Cate casute de data sunt in rosu acum, ca butoanele sa se poata opri cat
  // timp exista vreuna: o data tastata pe jumatate ajunge altfel la server ca sir gol.
  const { anyInvalid, mark } = useInvalidDates();

  const productById = React.useMemo(
    () => new Map(options.products.map((p) => [p.id, p])),
    [options.products],
  );
  const projectById = React.useMemo(
    () => new Map(options.projects.map((p) => [p.id, p])),
    [options.projects],
  );

  const clientOptions: ComboOption[] = options.clients.map((c) => ({ value: c.id, label: c.name }));
  // PROIECTELE CLIENTULUI ALES, cand exista unul: o lista cu toate santierele din
  // sistem pe o factura a unui singur client este o lista in care se alege greșit.
  const projectOptions: ComboOption[] = options.projects
    .filter((p) => clientId === "" || p.clientId === clientId)
    .map((p) => ({ value: p.id, label: p.name, hint: p.clientName }));
  const productOptions: ComboOption[] = options.products.map((p) => ({
    value: p.id,
    label: p.name,
    hint: p.sku,
  }));

  const setLine = (key: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  /** Alegerea unui produs aduce si unitatea lui: unitatea este fixa pe produs, deci a
   *  cere-o separat ar fi a doua intrebare cu un singur raspuns. */
  function chooseProduct(key: string, id: string) {
    const product = id === "" ? null : productById.get(id);
    setLine(key, {
      productId: id,
      productName: product?.name ?? "",
      unit: product ? product.unit : "pcs",
    });
  }

  /** Alegerea unui proiect aduce si clientul: un proiect apartine unui singur client. */
  function chooseProject(id: string) {
    setProjectId(id);
    const project = id === "" ? null : projectById.get(id);
    if (project) setClientId(project.clientId);
  }

  const rate = num(vatRate);
  const computed = lines.map((l) => {
    const subtotal = round2(num(l.quantity) * num(l.unitPrice));
    const vat = round2((subtotal * rate) / 100);
    return { key: l.key, subtotal, vat, total: subtotal + vat };
  });
  const subtotalMdl = computed.reduce((s, l) => s + l.subtotal, 0);
  const vatTotalMdl = computed.reduce((s, l) => s + l.vat, 0);
  const totalMdl = subtotalMdl + vatTotalMdl;

  const problems: string[] = [];
  if (clientId === "") problems.push("Alege clientul facturii.");
  if (rate < 0 || rate > 100 || !/^\d+([.,]\d{1,2})?$/.test(vatRate.trim())) {
    problems.push("Cota TVA trebuie să fie un număr între 0 și 100, cu cel mult două zecimale.");
  }
  lines.forEach((l, index) => {
    if (l.productId === "" && l.description.trim() === "") {
      problems.push(`Poziția ${index + 1}: alege un produs sau scrie o denumire.`);
    }
    if (!(num(l.quantity) > 0)) {
      problems.push(`Poziția ${index + 1}: scrie o cantitate mai mare decât zero.`);
    }
    if (l.unitPrice.trim() === "" || num(l.unitPrice) < 0) {
      problems.push(`Poziția ${index + 1}: scrie prețul unitar.`);
    }
  });
  if (anyInvalid) problems.push("O dată nu este scrisă complet. Verifică zilele de mai sus.");

  const hasStoredLine = lines.some((l) => l.id !== "");

  async function save(): Promise<string | null> {
    const result = await saveInvoiceDraft({
      invoiceId: view.invoiceId,
      outboundIssueId: view.fromIssue?.id ?? null,
      clientId,
      projectId,
      dueDate,
      notes,
      vatRate,
      lines: lines.map((l) => ({
        id: l.id,
        productId: l.productId,
        description: l.description,
        unit: l.unit,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      })),
    });
    if (!result.ok) {
      setError(result.message);
      return null;
    }
    return result.invoiceId;
  }

  async function onSave() {
    setTouched(true);
    setError(null);
    if (problems.length > 0) return;
    setBusy("save");
    const id = await save();
    setBusy(null);
    if (id === null) return;
    router.push(`/facturare/${id}`);
  }

  async function onIssue() {
    setError(null);
    setBusy("issue");
    const id = await save();
    if (id === null) {
      setBusy(null);
      return;
    }
    const issued = await issueInvoice(id, issueDate, dueDate);
    setBusy(null);
    if (!issued.ok) {
      // CIORNA A FOST SALVATA SI EMITEREA NU A REUSIT, si asta se spune pe fata: munca
      // nu s-a pierdut, iar ecranul facturii o arata ca ciorna, de unde se poate emite
      // din nou.
      setError(`${issued.message} Ciorna a fost salvată și se poate emite de pe ecranul ei.`);
      router.push(`/facturare/${id}`);
      return;
    }
    router.push(`/facturare/${id}`);
  }

  return (
    <>
      <PageHeader
        title={view.invoiceId === null ? "Factură nouă" : "Modifică ciorna"}
        lead={
          view.fromIssue
            ? `Completată din ieșirea ${view.fromIssue.reference}. Cât timp este ciornă, se poate schimba.`
            : "Alege clientul și scrie pozițiile. Cât timp este ciornă, se poate schimba."
        }
      />

      <div className="space-y-4" data-testid="factura-editor">
        {/* -------------------------------------------------------- partile -- */}
        <Card>
          <CardHeader
            title="Client și proiect"
            hint={
              view.partiesLocked
                ? "Citite din ieșire, nu tastate"
                : "Clientul este obligatoriu. Proiectul este opțional: nu tot ce se facturează este un șantier."
            }
          />
          <div className={`p-5 grid grid-cols-2 gap-4 ${PHONE_STACK}`}>
            {view.partiesLocked ? (
              <>
                <Field label="Client">
                  <div
                    className="h-9 flex items-center px-3 text-[13.5px] text-rc-black max-md:h-11"
                    data-testid="factura-editor-client-nume"
                  >
                    {view.clientName}
                  </div>
                </Field>
                <Field label="Proiect">
                  <div
                    className="h-9 flex items-center px-3 text-[13.5px] text-rc-black max-md:h-11"
                    data-testid="factura-editor-proiect-nume"
                  >
                    {view.projectName === "" ? "Fără proiect" : view.projectName}
                  </div>
                </Field>
              </>
            ) : (
              <>
                <Field label="Client" required>
                  <div data-testid="factura-editor-client">
                    <Combobox
                      options={clientOptions}
                      value={clientId}
                      onChange={setClientId}
                      placeholder="Caută clientul"
                      emptyLabel="Niciun client activ"
                    />
                  </div>
                </Field>
                <Field label="Proiect">
                  <div data-testid="factura-editor-proiect">
                    <Combobox
                      options={projectOptions}
                      value={projectId}
                      onChange={chooseProject}
                      placeholder="Caută șantierul"
                      emptyLabel="Niciun proiect deschis"
                    />
                  </div>
                </Field>
              </>
            )}
          </div>
        </Card>

        {/* --------------------------------------------------------- datele -- */}
        <Card>
          <CardHeader title="Date și cotă" hint="Ziua emiterii, scadența și cota TVA" />
          <div className={`p-5 grid grid-cols-3 gap-4 items-start ${PHONE_STACK}`}>
            <label className="block max-md:min-w-0">
              <span className="block text-[12.5px] font-semibold text-rc-black mb-1.5">
                Data emiterii
              </span>
              <DateField
                value={issueDate}
                onChange={setIssueDate}
                onValidityChange={mark("issueDate")}
                testId="factura-editor-data-emiterii"
              />
              {/* CE SE INTAMPLA CU ACEASTA ZI, spus pe ecran: ea se scrie pe factura in
                  momentul emiterii. 0063 da issue_date la Emite, iar o ciorna care ar
                  purta o zi de emitere ar fi un rand despre care lista ar spune ca a
                  fost emis in ziua aceea. */}
              <span className="block text-[12px] text-rc-muted mt-1">
                Se scrie pe factură la emitere.
              </span>
            </label>

            <label className="block max-md:min-w-0">
              <span className="block text-[12.5px] font-semibold text-rc-black mb-1.5">
                Data scadenței
              </span>
              <DateField
                value={dueDate}
                onChange={setDueDate}
                onValidityChange={mark("dueDate")}
                testId="factura-editor-scadenta"
              />
              <span className="block text-[12px] text-rc-muted mt-1">
                Până când se plătește factura.
              </span>
            </label>

            <Field label="Cotă TVA (%)" required hint={VAT_NOTE}>
              <Input
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                inputMode="decimal"
                className={`text-right rc-num ${PHONE_CONTROL}`}
                data-testid="factura-editor-tva"
              />
            </Field>
          </div>
        </Card>

        {/* ------------------------------------------------------- pozitiile -- */}
        <Card className={PHONE_TABLE}>
          <CardHeader
            title="Poziții"
            hint="Cantitatea este în unitatea produsului. Prețul unitar este cel facturat."
            right={
              <Button
                size="sm"
                variant="secondary"
                type="button"
                onClick={() => setLines((ls) => [...ls, emptyLine()])}
                data-testid="factura-editor-adauga"
                className={PHONE_TAP}
              >
                + Adaugă poziție
              </Button>
            }
          />
          <Table>
            <thead>
              <tr>
                <Th className="w-[38%]">Poziție</Th>
                <Th align="right">Cantitate</Th>
                <Th>Unitate</Th>
                <Th align="right">Preț unitar</Th>
                <Th align="right">Total linie</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, index) => {
                const totals = computed[index]!;
                return (
                  <tr key={l.key} data-testid="factura-editor-linie" className={`align-top ${PHONE_ROW}`}>
                    <Td data-label="Poziție" className={PHONE_WIDE}>
                      <div data-testid={`editor-produs-${index}`}>
                        <Combobox
                          options={productOptions}
                          value={l.productId}
                          onChange={(value) => chooseProduct(l.key, value)}
                          placeholder="Caută produsul din catalog"
                          emptyLabel="Niciun produs"
                        />
                      </div>
                      {/* O LINIE CARE NU ESTE UN PRODUS DIN CATALOG, transportul fiind
                          exemplul evident, isi scrie denumirea aici. Constrangerea
                          invoice_lines_product_or_description din 0063 cere una din cele
                          doua, si ecranul cere acelasi lucru inainte. */}
                      <Input
                        value={l.description}
                        onChange={(e) => setLine(l.key, { description: e.target.value })}
                        placeholder={
                          l.productId === "" ? "sau scrie denumirea, de exemplu Transport" : "denumire pe factură (opțional)"
                        }
                        className={`mt-1.5 text-[13px] ${PHONE_CONTROL}`}
                        data-testid={`editor-denumire-${index}`}
                      />
                    </Td>
                    <Td align="right" data-label="Cantitate" className={PHONE_CELL}>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={l.quantity}
                        onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                        placeholder="0"
                        className={`text-right rc-num ${PHONE_CONTROL}`}
                        data-testid={`editor-cantitate-${index}`}
                      />
                    </Td>
                    <Td data-label="Unitate" className={PHONE_CELL}>
                      <Select
                        value={l.unit}
                        onChange={(e) => setLine(l.key, { unit: e.target.value as UnitCode })}
                        className={PHONE_CONTROL}
                        data-testid={`editor-unitate-${index}`}
                      >
                        {ALL_UNITS.map((unit) => (
                          <option key={unit} value={unit}>
                            {unitLabel(unit)}
                          </option>
                        ))}
                      </Select>
                    </Td>
                    <Td align="right" data-label="Preț unitar" className={PHONE_CELL}>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={l.unitPrice}
                        onChange={(e) => setLine(l.key, { unitPrice: e.target.value })}
                        placeholder="0,00"
                        className={`text-right rc-num ${PHONE_CONTROL}`}
                        data-testid={`editor-pret-${index}`}
                      />
                    </Td>
                    <Td align="right" data-label="Total linie" className={PHONE_CELL}>
                      <span
                        className="rc-num inline-block pt-2.5 text-[13.5px] font-semibold max-md:pt-0"
                        data-testid={`editor-total-${index}`}
                      >
                        {formatMoneyExact(totals.total)}
                      </span>
                    </Td>
                    <Td align="right" className={PHONE_ACTIONS_CELL}>
                      <button
                        type="button"
                        onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                        // O LINIE DEJA SALVATA NU SE SCOATE, si butonul spune de ce la
                        // trecerea mouse-ului; propozitia intreaga este sub tabel.
                        disabled={l.id !== "" || lines.length === 1}
                        title={
                          l.id !== ""
                            ? "Poziția este deja salvată și nu se mai scoate: nimic nu se șterge aici."
                            : "Scoate poziția"
                        }
                        data-testid={`editor-scoate-${index}`}
                        className="mt-2 w-8 h-8 rounded-[9px] text-rc-muted hover:bg-rc-danger-soft hover:text-rc-danger disabled:opacity-30 disabled:cursor-not-allowed transition-colors max-md:mt-0 max-md:h-11 max-md:w-11"
                      >
                        ✕
                      </button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>

          {hasStoredLine ? (
            <p
              className="px-5 py-3 border-t border-rc-line text-[12px] text-rc-muted leading-relaxed"
              data-testid="factura-editor-linii-salvate"
            >
              O poziție deja salvată nu se mai scoate de pe factură: nimic nu se șterge aici.
              Cantitatea și prețul ei se pot schimba oricând factura este ciornă. Dacă poziția nu are
              ce căuta pe factură, anulează ciorna cu un motiv și fă o factură nouă.
            </p>
          ) : null}

          <div
            className="px-5 py-4 border-t border-rc-line flex justify-end"
            data-testid="factura-editor-totaluri"
          >
            <dl className="w-[280px] space-y-1.5 max-md:w-full">
              <Foot label="Subtotal" value={subtotalMdl} testId="factura-editor-subtotal" />
              <Foot label="TVA" value={vatTotalMdl} testId="factura-editor-tva-total" />
              <Foot label="Total de plată" value={totalMdl} testId="factura-editor-total" strong />
            </dl>
          </div>
        </Card>

        {/* ------------------------------------------------------------ nota -- */}
        <Card>
          <CardHeader title="Notă" hint="Ce scrie pe factură, dacă este ceva de scris" />
          <div className="p-5">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="De exemplu: transport inclus, plata prin transfer."
              className={PHONE_CONTROL}
              data-testid="factura-editor-nota"
            />
          </div>
        </Card>

        {touched && problems.length > 0 ? (
          <div className="rounded-[12px] border border-rc-danger/30 bg-rc-danger-soft px-5 py-3.5">
            <p className="text-[13px] font-semibold text-rc-danger">Mai lipsește ceva</p>
            <ul className="mt-1.5 space-y-0.5" data-testid="factura-editor-probleme">
              {[...new Set(problems)].map((p) => (
                <li key={p} className="text-[12.5px] text-rc-danger">
                  {p}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? (
          <p
            role="alert"
            data-testid="factura-editor-eroare"
            className="rounded-[12px] border border-rc-danger/30 bg-rc-danger-soft px-5 py-3.5 text-[13px] text-rc-danger"
          >
            {error}
          </p>
        ) : null}

        {/* CONFIRMAREA DE LA EMITE: O SINGURA PROPOZITIE, INAINTE, CU NUMARUL IN EA. */}
        {asking ? (
          <div
            className="rounded-[12px] border border-rc-orange/40 bg-rc-paper px-5 py-4"
            data-testid="factura-editor-emite-confirmare"
          >
            <p className="text-[13px] text-rc-black leading-relaxed">
              {view.nextNumberText === ""
                ? "Factura primește numărul următor din serie și nu se mai poate modifica după aceea: se poate doar anula."
                : `Factura primește numărul ${view.nextNumberText}, următorul din serie, și nu se mai poate modifica după aceea: se poate doar anula.`}
            </p>
            <p className="mt-1.5 text-[12px] text-rc-muted">
              Numărul este alocat de baza de date în momentul emiterii, ca seria să nu aibă nici
              goluri nici numere repetate.
            </p>
            <div className="mt-3 flex items-center gap-2.5 max-md:flex-col max-md:items-stretch">
              <Button
                type="button"
                onClick={onIssue}
                disabled={busy !== null}
                className={PHONE_TAP}
                data-testid="factura-editor-emite-da"
              >
                {busy === "issue" ? "Se emite..." : "Da, emite factura"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setAsking(false)}
                disabled={busy !== null}
                className={PHONE_TAP}
                data-testid="factura-editor-emite-renunta"
              >
                Renunță
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-4 max-md:flex-col max-md:items-stretch">
          <p className="text-[12.5px] text-rc-muted-2 max-w-[60ch]">
            O ciornă se poate schimba oricând. Emiterea alocă numărul și îngheață factura: după ea se
            poate doar marca plătită sau anula.
          </p>
          <div className="flex items-center gap-2.5 shrink-0 max-md:flex-col max-md:items-stretch">
            {view.invoiceId === null ? (
              <Link href="/facturare" className="max-md:flex max-md:flex-col">
                <Button variant="secondary" className={PHONE_TAP} data-testid="factura-editor-renunta">
                  Înapoi la facturi
                </Button>
              </Link>
            ) : (
              <Link href={`/facturare/${view.invoiceId}`} className="max-md:flex max-md:flex-col">
                <Button variant="secondary" className={PHONE_TAP} data-testid="factura-editor-renunta">
                  Înapoi la factură
                </Button>
              </Link>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={onSave}
              disabled={busy !== null}
              className={PHONE_TAP}
              data-testid="factura-editor-salveaza"
            >
              {busy === "save" ? "Se salvează..." : "Salvează ciorna"}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setTouched(true);
                setError(null);
                if (problems.length > 0) return;
                setAsking(true);
              }}
              disabled={busy !== null}
              className={PHONE_TAP}
              data-testid="factura-editor-emite"
            >
              Emite factura
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function Foot({
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
