"use client";

// P3-119, MODUL "CLIENT DIRECT". Hotararea R-215, Itemul 2 al lui Ivan.
//
// CE ESTE ACEST ECRAN. Cumparatorul sta la tejghea si ridica materialul de la
// depozit, fara niciun proiect in spate. Se cere un client CRM, ziua ridicarii si
// pozitiile; pretul pe poziție este opțional. Banii se aseaza in afara acestei
// platforme, deci nu se face nicio factura si niciun document de vanzare.
//
// DE CE UN FISIER AL LUI SI NU RAMURI IN CEL AL PROIECTULUI. Clauza 1 a cardului si
// hotararea R-215: modul "Proiect" este COMPLET NESCHIMBAT, aceleasi campuri,
// aceeasi validare, acelasi comportament, acelasi efect pe stoc. Deviatia cardului
// spune ce se face cand impartirea ar cere altceva: "keep the project path
// byte-for-byte and add beside it". Asta este fisierul de alaturi.
//
// TABELUL DE POZITII SEMANA CU CEL DIN OutboundProjectForm.tsx SI NU ESTE O SCAPARE.
// A-l scoate intr-un component comun ar fi rescris chiar randurile caii
// proiectului, adica exact ce clauza 1 interzice. Cardul cantareste cele doua
// riscuri si alege acesta: cand modul proiect va fi liber sa se mute, un card de mai
// tarziu poate uni cele doua tabele, si atunci schimbarea va fi a unui card care are
// dreptul sa o faca. Ce NU se repeta nicaieri: unitatile (vin din ALL_UNITS prin
// unitLabel), propozitiile de refuz (vin din ISSUE_REFUSAL), casuta de data (este
// DateField, cea a cardului P3-49) si calea de creare a clientului (este
// createClientRecord, cea de pe ecranul Clienți).
//
// NICIO LISTA DE UNITATI SCRISA AICI, deviatia D3: unitatea unei pozitii este cea a
// produsului, citita prin unitLabel, deci toate cele noua apar fara ca fisierul sa
// numeasca niciuna.
//
// O SINGURA CASUTA DE DATA, SI ESTE CEA STANDARD. Cardul P3-49 si constatarea F4 au
// facut din DateField singurul control de data al acestei aplicatii, zz.ll.aaaa, cu
// campul nativ ascuns. Un al doilea fel de casuta de data nu se introduce.
//
// UN NUME SCRIS DE MANA NU SE PRIMESTE, R-215: clientul este un RAND pe care cineva
// il poate deschide. De aceea nu exista niciun camp de text liber pentru client, iar
// singurul fel de a avea un client nou este de a-l CREA, prin aceeasi actiune pe
// care o foloseste ecranul Clienți.

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardHeader,
  Chip,
  Field,
  Input,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import { Combobox } from "@/components/ui/Combobox";
import type { ComboOption } from "@/components/ui/Combobox";
import { DateField, DATE_INVALID_MESSAGE } from "@/components/ui/DateField";
import { DISPLAY_CURRENCY, formatDate, formatMoney, formatMoneyExact, formatNumber, formatQty } from "@/lib/data/format";
import { unitLabel } from "@/lib/data/units";
import type { CatalogProduct } from "@/lib/data/products";
import { createOutboundIssue } from "@/lib/data/outbound-actions";
import { createClientRecord } from "@/lib/data/client-actions";
import { ISSUE_REFUSAL } from "@/lib/data/outbound-mode";
import { CLIENT_TYPE_LABEL } from "@/lib/data/clients-types";
import type { ClientType } from "@/lib/data/clients-types";
import { DIRECT_CLIENT_NOT_INVOICEABLE } from "@/lib/data/facturare-create-types";
import type { OutboundMode } from "@/lib/data/outbound-types";
import { OutboundModeChoice } from "./OutboundModeChoice";
import {
  PHONE_CELL,
  PHONE_CONTROL,
  PHONE_ROW,
  PHONE_TABLE,
  PHONE_TAP,
  PHONE_WIDE,
} from "@/components/ui/phone";

export type ClientChoice = { id: string; name: string };

type Line = { key: string; productId: string; quantity: string; price: string };

let seq = 0;
function emptyLine(): Line {
  seq += 1;
  return { key: `d-${seq}`, productId: "", quantity: "", price: "" };
}

type Created = {
  reference: string;
  clientName: string;
  pickupDate: string;
  lineCount: number;
};

export function OutboundDirectClientForm({
  products,
  clients,
  canCreateClient,
  mode,
  onModeChange,
}: {
  products: CatalogProduct[];
  clients: ClientChoice[];
  /**
   * Poate acest utilizator sa creeze un client?
   *
   * VINE DE PE SESIUNE SI NU SE GHICESTE AICI. createClientRecord este numai a
   * administratorului, de la cardul P3-06, iar acelasi card scrie regula pentru care
   * exista aceasta proprietate: ecranul nu are voie sa ofere un buton pe care baza il
   * va refuza. Un manager de cont vede deci lista de clienti si nu vede butonul de
   * creare, exact ca pe ecranul Clienți.
   */
  canCreateClient: boolean;
  mode: OutboundMode;
  onModeChange: (mode: OutboundMode) => void;
}) {
  const router = useRouter();

  const [clientId, setClientId] = React.useState("");
  const [pickupDate, setPickupDate] = React.useState("");
  const [pickupInvalid, setPickupInvalid] = React.useState(false);
  const [lines, setLines] = React.useState<Line[]>([emptyLine()]);
  const [touched, setTouched] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<Created | null>(null);

  // CLIENTII CREATI DIN ACEST ECRAN, pana la reincarcarea paginii.
  //
  // router.refresh() aduce lista de la server, dar nu pe loc, iar operatorul trebuie
  // sa poata alege chiar clientul pe care l-a creat in secunda de dinainte. Randul
  // este deja scris in public.clients: aceasta lista este numai ecranul care il
  // ajunge din urma, si de aceea clientul apare in Clienți ca orice alt rand.
  const [addedClients, setAddedClients] = React.useState<ClientChoice[]>([]);

  const allClients = React.useMemo(() => {
    const seen = new Map<string, ClientChoice>();
    for (const c of [...clients, ...addedClients]) seen.set(c.id, c);
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, "ro"));
  }, [clients, addedClients]);

  const client = allClients.find((c) => c.id === clientId) ?? null;

  const byId = React.useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const clientOptions: ComboOption[] = allClients.map((c) => ({ value: c.id, label: c.name }));
  const productOptions: ComboOption[] = products.map((p) => ({
    value: p.id,
    label: p.name,
    hint: `${p.sku} · ${formatQty(p.stock, p.unit)}`,
  }));

  const setLine = (key: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const filled = lines.filter((l) => l.productId && Number(l.quantity) > 0);

  // Cantitatile aceluiasi produs se aduna INAINTE de verificare, exact ca la modul
  // proiect: 100 impartit in doua linii de 50 nu are voie sa treaca o verificare pe
  // care 50 ar pica-o.
  const wantedByProduct = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const l of filled) m.set(l.productId, (m.get(l.productId) ?? 0) + Number(l.quantity));
    return m;
  }, [filled]);

  // CE LIPSESTE, IN ROMANA, PE ECRAN, INAINTE CA CEREREA SA PLECE. Clauza 6 a
  // cardului. Propozitiile nu se scriu aici: ele sunt ISSUE_REFUSAL din
  // lib/data/outbound-mode.ts, adica EXACT cele pe care le intoarce si validateNewIssue
  // din calea de scriere, si aceleasi lipsuri le refuza si restrictiile migratiei
  // 0067. Cele trei refuzuri nu sunt o dublare: ecranul ii spune operatorului, calea
  // de scriere ii spune oricarui alt apelant, iar baza de date le apara pe toate.
  const problems: string[] = [];
  if (!client) problems.push(ISSUE_REFUSAL.client);
  // O DATA TASTATA PE JUMATATE NU ESTE O DATA LIPSA, si cele doua nu se confunda:
  // DateField trimite sirul gol pentru amandoua, deci fara aceasta stare o zi
  // imposibila ar fi raportata ca "alege data" si operatorul ar reintroduce-o la fel.
  if (pickupInvalid) problems.push(DATE_INVALID_MESSAGE);
  else if (pickupDate === "") problems.push(ISSUE_REFUSAL.pickupDate);
  if (filled.length === 0) problems.push("Adaugă cel puțin o poziție cu produs și cantitate.");
  for (const [productId, wanted] of wantedByProduct) {
    const p = byId.get(productId);
    if (p && wanted > p.stock) {
      problems.push(
        `Stoc insuficient pentru ${p.name}: disponibil ${formatQty(p.stock, p.unit)}.`,
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
      // MODUL ESTE SINGURUL LUCRU IN PLUS pe care il trimite acest formular.
      // Scaderea de stoc este aceeasi rutina, public.outbound_issue_take_stock, pe
      // care o cheama si modul proiect: cardul P3-118 a asezat-o asa anume ca sa nu
      // existe o a doua aritmetica.
      mode: "direct_client",
      clientId: client!.id,
      pickupDate,
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
      reference: result.value.reference,
      clientName: client!.name,
      pickupDate,
      lineCount: filled.length,
    });
    setPending(false);
  }

  if (created) {
    return (
      <>
        <PageHeader
          title="Bon de eliberare creat"
          lead="Materialul poate fi ridicat de client."
        />
        <Card className="max-w-[720px]">
          <div className="px-7 py-8 text-center" data-testid="issue-created">
            <div className="mx-auto w-12 h-12 rounded-full bg-rc-ok-soft text-rc-ok grid place-items-center text-[22px]">
              ✓
            </div>
            <p className="mt-4 text-[17px] font-bold text-rc-black" data-testid="issue-reference">
              {created.reference}
            </p>
            <p className="text-[13.5px] text-rc-muted mt-1.5">
              {created.clientName} · client direct · ridicare{" "}
              {formatDate(created.pickupDate)} · {created.lineCount}{" "}
              {created.lineCount === 1 ? "poziție" : "poziții"} · emis{" "}
              {formatDate(new Date().toISOString())}
            </p>
            <div className="mt-4 flex justify-center">
              <Chip tone="warn">În așteptare expediere</Chip>
            </div>
            <div className="mt-6 flex items-center justify-center gap-2.5 max-md:flex-col max-md:items-stretch">
              <Button
                className={PHONE_TAP}
                variant="secondary"
                onClick={() => {
                  setCreated(null);
                  setClientId("");
                  setPickupDate("");
                  setLines([emptyLine()]);
                  setTouched(false);
                }}
              >
                Creează alt bon
              </Button>
            </div>

            {/* P3-119 CLAUZA 7. NICIUN BUTON DE FACTURA, si aici se vede cel mai bine
                ca este o absenta si nu un buton strica: confirmarea modului proiect
                are chiar in acest loc un buton "Creează factură". Propozitia este cea
                pe care o intoarce P3-118 pe fisa iesirii, aceeasi si nu una scrisa
                aici, fiindca doua explicatii ale aceluiasi refuz s-ar abate una de la
                alta la prima corectare. */}
            <div className="mt-6 pt-5 border-t border-rc-line">
              <p className="text-[12px] text-rc-muted" data-testid="issue-invoice-reason">
                {DIRECT_CLIENT_NOT_INVOICEABLE}
              </p>
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
        lead="Eliberare de material către un client care ridică de la depozit. Alege clientul și ziua ridicării, apoi ce pleacă cu el."
      />

      <div className="space-y-4" data-testid="outbound-form">
        {/* P3-119 clauza 1: ALEGEREA VINE PRIMA, aceeasi in amandoua modurile. */}
        <OutboundModeChoice
          value={mode}
          onChange={(next) => {
            // P3-144: si fara `disabled`, o schimbare sosita in timpul trimiterii nu se aplica.
            if (!pending) onModeChange(next);
          }}
          disabled={pending}
        />

        <Card>
          <CardHeader title="Client direct" hint="Cine ridică materialul și în ce zi" />
          <div className="p-5 grid grid-cols-2 gap-4 max-md:grid-cols-1">
            <Field label="Client" required>
              <div data-testid="field-client">
                <Combobox
                  options={clientOptions}
                  value={clientId}
                  onChange={setClientId}
                  placeholder="Caută clientul după nume"
                  emptyLabel={
                    canCreateClient
                      ? "Niciun client cu acest nume. Creează-l mai jos."
                      : "Niciun client cu acest nume."
                  }
                />
              </div>
            </Field>
            <Field label="Data ridicării" required>
              <div data-testid="field-pickup-date">
                <DateField
                  value={pickupDate}
                  onChange={setPickupDate}
                  onValidityChange={setPickupInvalid}
                  testId="issue-pickup-date"
                />
              </div>
            </Field>
          </div>

          {/* CREAREA PE LOC, FARA SA SE PLECE DE PE ECRAN. Cardul spune de ce:
              cumparatorul sta la tejghea, iar trimiterea operatorului pe alt ecran ca
              sa creeze un client este chiar felul in care a inceput obiceiul
              proiectelor inventate. */}
          {canCreateClient ? (
            <InlineClientCreate
              onCreated={(choice) => {
                setAddedClients((cs) => [...cs, choice]);
                setClientId(choice.id);
                router.refresh();
              }}
            />
          ) : null}
        </Card>

        <Card className={PHONE_TABLE}>
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
                className={PHONE_TAP}
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
                  <tr key={l.key} className={`align-top ${PHONE_ROW}`}>
                    <Td data-label="Produs" className={PHONE_WIDE}>
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
                          În stoc: {formatQty(product.stock, product.unit)}
                        </p>
                      ) : null}
                    </Td>
                    <Td align="right" data-label="Cantitate" className={PHONE_CELL}>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        className={`text-right rc-num ${PHONE_CONTROL}`}
                        value={l.quantity}
                        onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                        placeholder="0"
                        data-testid={`issue-quantity-${index}`}
                      />
                    </Td>
                    {/* UNITATEA ESTE CEA A PRODUSULUI, CITITA PRIN unitLabel. Nicio
                        lista de unitati nu este scrisa in acest fisier, deviatia D3:
                        toate cele noua din ALL_UNITS apar prin chiar acest rand. */}
                    <Td data-label="Unitate" className={PHONE_CELL}>
                      <span className="inline-flex items-center h-[38px] px-2.5 rounded-[10px] bg-rc-paper border border-rc-line text-[13px] text-rc-muted max-md:h-11">
                        {product ? unitLabel(product.unit) : "-"}
                      </span>
                    </Td>
                    <Td align="right" data-label={`Preț unitar (${DISPLAY_CURRENCY})`} className={PHONE_CELL}>
                      {/* OPTIONAL, SI GOL FARA NICIO PLANGERE, exact cum trateaza o
                          iesire pe proiect sale_price_mdl. Cand produsul poarta o
                          valoare, ea se arata ca indicatie in casuta goala: clauza 4
                          spune "when the product carries one", iar o indicatie este
                          singurul fel de a spune asta fara sa completeze nimic in
                          locul operatorului. */}
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        className={`text-right rc-num ${PHONE_CONTROL}`}
                        value={l.price}
                        onChange={(e) => setLine(l.key, { price: e.target.value })}
                        placeholder={
                          product && product.unitValueMdl > 0
                            ? formatNumber(product.unitValueMdl)
                            : "lasă gol"
                        }
                        data-testid={`issue-price-${index}`}
                      />
                    </Td>
                    <Td align="right" data-label="Total linie" className={PHONE_CELL}>
                      <span className="rc-num inline-block pt-2.5 text-[13.5px] font-semibold max-md:pt-0">
                        {total > 0 ? (
                          formatMoneyExact(total)
                        ) : (
                          <span className="text-rc-muted-2">fără preț</span>
                        )}
                      </span>
                    </Td>
                    <Td align="right" className="max-md:col-span-2 max-md:block max-md:border-b-0 max-md:p-0">
                      <button
                        type="button"
                        onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                        disabled={lines.length === 1}
                        title="Elimină poziția"
                        className="mt-2 w-8 h-8 rounded-[9px] text-rc-muted hover:bg-rc-danger-soft hover:text-rc-danger disabled:opacity-30 transition-colors max-md:mt-0 max-md:h-11 max-md:w-11"
                      >
                        ✕
                      </button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <div className="flex items-center justify-between gap-6 px-5 py-4 bg-rc-paper border-t border-rc-line max-md:flex-col max-md:items-start max-md:gap-3">
            <p className="text-[12px] text-rc-muted max-w-[54ch] leading-relaxed">
              Prețul pe poziție este opțional și poate rămâne gol. Banii de la un client
              direct se încasează în afara sistemului, deci din acest bon nu se face nicio
              factură.
            </p>
            <p className="text-[12.5px] text-rc-muted shrink-0">
              Total tarifat:{" "}
              <span className="rc-num font-bold text-rc-black text-[15px]">
                {formatMoneyExact(pricedTotal)}
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

        <div className="flex items-center justify-between max-md:flex-col max-md:items-stretch max-md:gap-3">
          <p className="text-[12.5px] text-rc-muted-2">
            La creare, bonul primește starea{" "}
            <span className="font-semibold text-rc-muted">În așteptare expediere</span>, iar stocul
            scade imediat: materialul a plecat fizic din depozit.
          </p>
          <Button
            onClick={submit}
            type="button"
            disabled={pending}
            data-testid="issue-submit"
            className={`${PHONE_TAP} max-md:whitespace-normal`}
          >
            {pending ? "Se creează..." : "Creează bonul de eliberare"}
          </Button>
        </div>
      </div>
    </>
  );
}

/**
 * UN CLIENT NOU, DE PE ACEST ECRAN, PRIN CALEA CARE EXISTA DEJA.
 *
 * SE CHEAMA createClientRecord SI NU SE ADAUGA NICIUN PUNCT DE INTRARE NOU. Deviatia
 * cardului o cere pe nume: "reuse the existing client create path. A second way to
 * create a client is a second set of validation rules that will drift". Tot ce
 * verifica ecranul Clienți se verifica deci si aici, cuvant cu cuvant aceleasi
 * propozitii, si randul scris este un client CRM obisnuit: apare in Clienți, se poate
 * deschide, modifica si dezactiva ca oricare altul.
 *
 * CATE CAMPURI. Denumirea si tipul, fiindca acelea sunt cele pe care createClientRecord
 * le cere, plus IDNO si telefonul, care sunt cele pe care un om de la tejghea le poate
 * spune pe loc. Restul se completeaza mai tarziu, din fisa clientului: un formular de
 * tejghea care ar cere tot ce cere fisa completa nu ar fi folosit.
 */
function InlineClientCreate({ onCreated }: { onCreated: (choice: ClientChoice) => void }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<ClientType>("company");
  const [fiscalCode, setFiscalCode] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    setError(null);
    setPending(true);
    const result = await createClientRecord({
      name,
      type,
      fiscalCode,
      phone,
      address: "",
      email: "",
      notes: "",
      active: true,
    });
    if (!result.ok) {
      // MESAJUL ESTE AL ACTIUNII, NETRADUS SI NEREFORMULAT. Tot ce poate refuza o
      // creare de client o refuza deja in romana, pe ecranul Clienți, cu aceeasi
      // propozitie: o a doua formulare aici ar fi al doilea set de reguli pe care
      // deviatia cardului il interzice.
      setError(result.message);
      setPending(false);
      return;
    }
    onCreated({ id: result.value.id, name: name.trim() });
    setName("");
    setFiscalCode("");
    setPhone("");
    setType("company");
    setPending(false);
    setOpen(false);
  }

  if (!open) {
    return (
      <div className="px-5 pb-5">
        <Button
          size="sm"
          variant="secondary"
          type="button"
          onClick={() => setOpen(true)}
          data-testid="client-create-open"
          className={PHONE_TAP}
        >
          + Client nou
        </Button>
        <p className="text-[12px] text-rc-muted mt-2 max-w-[60ch]">
          Clientul se creează aici, fără să pleci de pe ecran, și apare apoi în Clienți ca
          orice alt client.
        </p>
      </div>
    );
  }

  return (
    <div
      className="mx-5 mb-5 rounded-[10px] border border-rc-line bg-rc-paper p-4"
      data-testid="client-create-form"
    >
      <p className="text-[12.5px] font-semibold text-rc-black">Client nou</p>
      <div className="mt-3 grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <Field label="Denumire" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Numele clientului"
            data-testid="client-create-name"
          />
        </Field>
        <Field label="Tip" required>
          <Select
            value={type}
            onChange={(e) => setType(e.target.value as ClientType)}
            data-testid="client-create-type"
          >
            {/* CELE DOUA TIPURI VIN DIN CLIENT_TYPE_LABEL, migratia 0013, si nu sunt
                scrise aici, acelasi motiv pentru care unitatile vin din ALL_UNITS. */}
            {(Object.keys(CLIENT_TYPE_LABEL) as ClientType[]).map((t) => (
              <option key={t} value={t}>
                {CLIENT_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="IDNO">
          <Input
            value={fiscalCode}
            onChange={(e) => setFiscalCode(e.target.value)}
            placeholder="Lasă gol pentru o persoană fizică"
            data-testid="client-create-fiscal-code"
          />
        </Field>
        <Field label="Telefon">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Lasă gol dacă nu îl ai"
            data-testid="client-create-phone"
          />
        </Field>
      </div>

      {error ? (
        <p
          role="alert"
          data-testid="client-create-error"
          className="mt-3 text-[12.5px] text-rc-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-2.5 max-md:flex-col max-md:items-stretch">
        <Button
          size="sm"
          type="button"
          onClick={save}
          disabled={pending}
          data-testid="client-create-save"
          className={PHONE_TAP}
        >
          {pending ? "Se salvează..." : "Salvează clientul"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          data-testid="client-create-cancel"
          className={PHONE_TAP}
        >
          Renunță
        </Button>
      </div>
    </div>
  );
}
