"use client";

// Facturi, ecranul de lista. Cardul P3-109, goal G65 partea 2.
//
// SASE COLOANE: Număr, Data, Client, Proiect, Total, Stare. Cele cinci din linia
// goalului, plus Proiect, pe care il cere raportul de proiectare si care incape la
// 1440 fara sa inghesuie nimic. Restul (liniile, TVA, nota, IDNO) sunt detaliu si
// tin de ecranul unei facturi, care este partea 3.
//
// FIECARE FILTRU ESTE IN URL, ca pe lista de clienti: o lista filtrata se poate
// trimite cuiva ca legatura si butonul de inapoi o reface intocmai.
//
// ECRANUL NU FILTREAZA NIMIC SI NU ADUNA NIMIC. Randurile, numarul si suma vin
// calculate din lib/data/facturare-list.ts. Linia de totaluri de sub tabel citeste
// exact numerele din care s-au facut randurile de deasupra ei, deci nu poate sa
// spuna altceva decat ele.
//
// CE NU FACEA CARDUL P3-109, si nu din uitare: nu crea nicio factura, nu emitea
// niciuna, nu anula niciuna si nu tiparea niciuna. NU EXISTA NICI BUTON "Factură
// nouă", NICI DEZACTIVAT: regula veche a acestui proiect este ca nimic din ce nu
// se poate folosi nu apare pe ecran, si un buton principal gri pe un ecran nou
// este exact lucrul care il invata pe operator sa nu apese butoane. Crearea si
// ecranul unei facturi sunt partea 3 a aceluiasi goal.
//
// P3-110, PARTEA 3, A CONSTRUIT AMANDOUA, DECI CELE DOUA PROPOZITII DE MAI SUS SUNT
// PASTRATE SI NU MAI DESCRIU ACEST ECRAN. Butonul "Factură nouă" exista acum, in
// antetul ecranului, si deschide /facturare/nou; numarul fiecarui rand este o
// legatura catre ecranul facturii, /facturare/<id>. Motivul pentru care nu existau
// era exact acela: ecranele pe care le deschid nu existau. Regula care le ținea
// afara este aceeasi care le aduce acum, si de aceea textul de deasupra rămâne
// scris: cine citeste P3-109 sau acceptanta lui trebuie sa aterizeze pe o
// explicatie si nu pe o propozitie care a dispărut.
//
// Ce rămâne neconstruit si se spune sub lista: tiparirea si e-Factura.
//
// FARA FILTRU DE LOCATIE, si raportul de proiectare spune de ce in terminii lui:
// "un filtru care are mereu o singura opțiune este un control care il invata pe
// operator sa ignore controalele". Rapid Construct are un singur loc de lucru, iar
// axa echivalenta este proiectul, care este deja coloana si este deja in cautare.
//
// CASUTELE DE DATA SUNT CELE ROMANESTI ALE CARDULUI P3-49, zz.ll.aaaa, si NU un
// <input type="date">: campul nativ aseaza ziua si luna dupa limba browserului, si
// un al doilea stil de casuta de data pe un ecran nou ar desface alegerea aceea.

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  Card,
  CardHeader,
  Chip,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
  type ChipTone,
} from "@/components/ui/primitives";
import { DateField } from "@/components/ui/DateField";
import {
  ALL_INVOICE_STATUSES,
  invoiceNumberText,
  invoiceStatusLabel,
  type InvoiceStatus,
} from "@/lib/data/facturare-types";
import type {
  InvoiceClientChoice,
  InvoiceListQuery,
  InvoiceListRow,
} from "@/lib/data/facturare-list-types";
import { formatDate, formatMoneyExact, plural } from "@/lib/data/format";
import {
  PHONE_CELL,
  PHONE_CONTROL,
  PHONE_LINK,
  PHONE_ROW,
  PHONE_TABLE,
  PHONE_TAP,
  PHONE_WIDE,
} from "@/components/ui/phone";

/** Textul care sta in locul numarului cat timp factura este ciorna.
 *
 *  NU UN NUMAR INVENTAT SI NU O CELULA GOALA. 0063 da numarul numai la Emite, deci
 *  o ciorna chiar nu are unul, si cuvantul spune de ce lipseste. O celula goala
 *  arata ca o eroare de citire. */
const NO_NUMBER = "Fără număr";

/** Linia de sub lista, si textul este cel din goal: operatorul nu trebuie sa caute
 *  un buton de tipar care nu exista. */
const NOT_BUILT_YET = "Tipărirea și e-Factura urmează.";

/** Cipul fiecarei stari.
 *
 *  TOATE PATRU SUNT TONURI CARE EXISTA DEJA si care sunt deja masurate la 4.5:1 de
 *  tests/e2e/button-contrast.spec.ts, cazul care parcurge CHIP_TONE_NAMES. Cardul
 *  acesta nu adauga niciun ton, deci nu are ce adauga acolo.
 *
 *  Ciornă este neutra fiindca nu este inca un document; Emisă este informativa;
 *  Plătită este singura stare buna; Anulată este cea care opreste ochiul. */
const STATUS_TONE: Record<InvoiceStatus, ChipTone> = {
  draft: "neutral",
  issued: "info",
  paid: "ok",
  cancelled: "danger",
};

export function FacturiScreen({
  rows,
  count,
  liveCount,
  liveSumMdl,
  clients,
  query,
  filtered,
}: {
  rows: InvoiceListRow[];
  count: number;
  /** Cate dintre randurile de pe ecran sunt emise sau plătite. */
  liveCount: number;
  /** Suma randurilor EMISE SAU PLATITE, in MDL. P3-115, constatarea G7. */
  liveSumMdl: number;
  clients: InvoiceClientChoice[];
  query: InvoiceListQuery;
  /** Are ecranul vreun filtru peste luna curenta si Toate stările? */
  filtered: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [q, setQ] = React.useState(query.q);

  // CASUTA DE CAUTARE URMEAZA URL-UL, care este adevarul. Acelasi mecanism ca in
  // ClientsScreen, scris acolo pe larg de cardul P3-96: ecranul isi tine minte
  // fiecare valoare pe care a TRIMIS-O el si care nu s-a intors inca, deci butonul
  // de inapoi, o legatura primita sau Șterge filtrele resincronizeaza casuta, iar
  // propriul scris nu i se taie la fiecare tasta.
  const urlQ = React.useRef(query.q);
  const sent = React.useRef<string[]>([]);
  if (urlQ.current !== query.q) {
    urlQ.current = query.q;
    const mine = sent.current.indexOf(query.q);
    if (mine >= 0) {
      sent.current = sent.current.slice(mine + 1);
    } else {
      sent.current = [];
      if (q !== query.q) setQ(query.q);
    }
  }

  React.useEffect(() => {
    if (q === (sent.current.at(-1) ?? urlQ.current)) return;
    const t = setTimeout(() => pushQ(q, {}), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function push(patch: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const search = next.toString();
    router.push(search === "" ? pathname : `${pathname}?${search}`);
  }

  function pushQ(next: string, patch: Record<string, string>) {
    sent.current = [...sent.current, next];
    push({ ...patch, q: next });
  }

  return (
    <>
      <PageHeader
        title="Facturi"
        lead="Facturile emise clienților, pe perioada, pe stare și pe client."
        actions={
          // P3-110. CALEA MANUALA, si este cea mai mica din cele doua: calea care
          // conteaza este "Creează factură" de pe o ieșire, unde cantitatile si
          // preturile exista deja si nu se pot greși. Butonul acesta exista fiindca nu
          // tot ce se factureaza este o eliberare de material.
          <Link href="/facturare/nou" className="max-md:flex max-md:flex-col">
            <Button className={PHONE_TAP} data-testid="facturi-noua">
              Factură nouă
            </Button>
          </Link>
        }
      />

      <Card className={PHONE_TABLE}>
        <CardHeader title="Listă" hint={plural(count, "factură", "facturi")} />

        {/* O GRILA EXPLICITA, ca pe Inventar si pe Clienți (cardul P3-52): Input,
            Select si casuta de data poarta w-full din clasa comuna a campurilor,
            deci intr-un rand flex-wrap fiecare ar cere tot randul si ar trece
            dedesubt. Coloana auto de la final tine Șterge filtrele.
            Pe telefon o singura coloana, si max-md:min-w-0 pe fiecare element,
            fiindca un element de grila nu coboara singur sub latimea lui
            min-content, iar aceea a unui <select> este cea mai lunga optiune a lui
            (constatarea F-telefon a cardului P3-97, scrisa in PHONE_CELL). */}
        <div
          className="p-5 grid grid-cols-[auto_auto_1fr_1.2fr_1.6fr_auto] items-end gap-3 max-md:grid-cols-1"
          data-testid="facturi-filters"
        >
          {/* LATIMEA STA PE ETICHETA, nu pe camp: DateField poarta deja w-full din
              clasa comuna, si o a doua clasa de latime pe acelasi element ar fi o
              cursa intre doua reguli CSS a carei ordine nu o decide ordinea in care
              sunt scrise. */}
          <label className="block w-[150px] max-md:w-full max-md:min-w-0">
            <span className="block text-[12.5px] font-semibold text-rc-black mb-1.5">De la</span>
            <DateField
              value={query.from}
              onChange={(value) => push({ "de-la": value })}
              testId="facturi-de-la"
            />
          </label>

          <label className="block w-[150px] max-md:w-full max-md:min-w-0">
            <span className="block text-[12.5px] font-semibold text-rc-black mb-1.5">Până la</span>
            <DateField
              value={query.to}
              onChange={(value) => push({ "pana-la": value })}
              testId="facturi-pana-la"
            />
          </label>

          <label className="block max-md:min-w-0">
            <span className="block text-[12.5px] font-semibold text-rc-black mb-1.5">Stare</span>
            <Select
              value={query.status}
              onChange={(e) => push({ stare: e.target.value })}
              data-testid="facturi-stare"
              className={PHONE_CONTROL}
            >
              <option value="">Toate stările</option>
              {ALL_INVOICE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {invoiceStatusLabel(status)}
                </option>
              ))}
            </Select>
          </label>

          <label className="block max-md:min-w-0">
            <span className="block text-[12.5px] font-semibold text-rc-black mb-1.5">Client</span>
            <Select
              value={query.clientId}
              onChange={(e) => push({ client: e.target.value })}
              data-testid="facturi-client"
              className={PHONE_CONTROL}
            >
              <option value="">Toți clienții</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </Select>
          </label>

          <label className="block max-md:min-w-0">
            <span className="block text-[12.5px] font-semibold text-rc-black mb-1.5">Caută</span>
            {/* O SINGURA CASUTA, peste numarul facturii si numele clientului, exact
                cum cauta deja lista de clienti. */}
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Caută după număr sau client"
              data-testid="facturi-search"
              className={`${PHONE_CONTROL} max-md:text-ellipsis`}
            />
          </label>

          {filtered ? (
            <Button
              variant="secondary"
              // Scoate exact filtrele pe care le citeste `filtered`, si le scoate
              // din URL: perioada se intoarce atunci la luna curenta fiindca ea
              // este lipsa filtrului, nu o valoare aleasa. Golirea cautarii trece
              // prin pushQ, ca stergerea sa fie si ea o valoare trimisa de ecran.
              onClick={() => {
                setQ("");
                pushQ("", { "de-la": "", "pana-la": "", stare: "", client: "" });
              }}
              data-testid="facturi-clear"
            >
              Șterge filtrele
            </Button>
          ) : null}
        </div>

        {rows.length === 0 ? (
          <div data-testid="facturi-empty">
            <EmptyState
              title="Nicio factură în perioada selectată."
              hint="Ajustează perioada."
            />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Număr</Th>
                <Th>Data</Th>
                <Th>Client</Th>
                <Th>Proiect</Th>
                <Th align="right">Total</Th>
                <Th>Stare</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  data-testid="facturi-row"
                  data-id={row.id}
                  data-status={row.status}
                  className={`hover:bg-rc-paper ${PHONE_ROW}`}
                >
                  <Td data-label="Număr" className={PHONE_CELL}>
                    {/* P3-110. NUMARUL ESTE ACUM O LEGATURA CATRE FACTURA. Cardul P3-109
                        l-a lasat text fiindca ecranul facturii nu exista, si scria in
                        defaults-ul lui (o) ca o legatura care nu duce nicaieri este
                        aceeasi promisiune stricata ca un buton dezactivat. Ecranul
                        exista, deci legatura exista. O ciornă nu are numar, iar textul
                        care spune ce lipseste este tot legatura: ciorna este exact randul
                        pe care operatorul vrea sa il deschida. */}
                    <Link
                      href={`/facturare/${row.id}`}
                      className={`font-semibold text-rc-black tabular-nums hover:underline ${PHONE_LINK}`}
                      data-testid="facturi-numar"
                    >
                      {invoiceNumberText(row.series, row.number) ?? NO_NUMBER}
                    </Link>
                  </Td>
                  <Td data-label="Data" className={PHONE_CELL}>
                    {/* O ciorna nu are zi de emitere, deci ziua ei este ziua in
                        care a fost creata. Cipul Ciornă de pe acelasi rand spune
                        ca factura nu este emisa; indicatia de la trecerea
                        mouse-ului spune ce zi este aceasta. */}
                    <span
                      data-testid="facturi-data"
                      title={row.dateIsCreation ? "Data creării ciornei" : "Data emiterii"}
                    >
                      {formatDate(row.date)}
                    </span>
                  </Td>
                  <Td data-label="Client" className={PHONE_WIDE}>
                    <Link
                      href={`/clienti/${row.clientId}`}
                      className={`text-rc-black hover:underline ${PHONE_LINK}`}
                      data-testid="facturi-client-link"
                    >
                      {row.clientName}
                    </Link>
                  </Td>
                  <Td data-label="Proiect" className={PHONE_WIDE}>
                    {row.projectId && row.projectName ? (
                      <Link
                        href={`/proiecte/${row.projectId}`}
                        className={`text-rc-black hover:underline ${PHONE_LINK}`}
                        data-testid="facturi-proiect-link"
                      >
                        {row.projectName}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </Td>
                  <Td align="right" data-label="Total" className={PHONE_CELL}>
                    <span className="tabular-nums" data-testid="facturi-total-rand">
                      {formatMoneyExact(row.totalMdl)}
                    </span>
                  </Td>
                  <Td data-label="Stare" className={PHONE_CELL}>
                    <Chip tone={STATUS_TONE[row.status]}>
                      <span data-testid="facturi-stare-eticheta">
                        {invoiceStatusLabel(row.status)}
                      </span>
                    </Chip>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        {/* LINIA DE TOTALURI, si raportul de proiectare spune de ce exista: "un
            ecran de facturare fara un total pe perioada vizibila il face pe operator
            sa intinda mana spre un calculator, adica lucrul pe care sistemul exista
            sa il scoata". Se arata si cand lista este goala: "0 facturi" si "0,00
            MDL" sunt un raspuns, nu o lipsa de raspuns.

            CIFRA DE BANI SPUNE CE ADUNA, SI ADUNA NUMAI EMISE SI PLATITE. Cardul
            P3-115, constatarea G7 a raportului
            docs/reports/2026-09-29-critic-bug-sweep-2.md: aici erau desenate doua
            lucruri si nicio eticheta intre ele, numarul la stanga si suma la dreapta,
            iar suma aduna FIECARE rand trecut prin filtre. Filtrul implicit de stare
            este gol, adica Toate stările, deci cifra numara ciorne, care nu sunt
            documente si nu au număr, si facturi anulate, care sunt chiar declaratia ca
            banii NU sunt datorati. Propozitia de deasupra listei promite "facturile
            emise clienților", si cifra spunea altceva.

            DOUA NUMERE SI NU UNUL, fiindca sunt doua intrebari: cate facturi vad pe
            ecran, care este onest pentru orice filtru, si cat s-a facturat, care are
            sens numai peste documentele vii. Amandoua trec prin `plural`, deci
            amandoua iau forma cu "de" peste nouasprezece. */}
        <div
          className="px-5 py-4 border-t border-rc-line flex items-center justify-between gap-4 max-md:flex-col max-md:items-start max-md:gap-2"
          data-testid="facturi-totaluri"
        >
          <span className="text-[12.5px] text-rc-muted" data-testid="facturi-numar-total">
            {plural(count, "factură", "facturi")}
          </span>
          <span className="flex items-baseline gap-2 max-md:flex-wrap">
            <span className="text-[12.5px] text-rc-muted" data-testid="facturi-suma-eticheta">
              Emise și plătite
            </span>
            <span className="text-[12.5px] text-rc-muted" data-testid="facturi-numar-live">
              {plural(liveCount, "factură", "facturi")}
            </span>
            <span className="text-[14px] font-semibold tabular-nums" data-testid="facturi-suma">
              {formatMoneyExact(liveSumMdl)}
            </span>
          </span>
        </div>
      </Card>

      <p className="mt-3 text-[12.5px] text-rc-muted-2" data-testid="facturi-in-lucru">
        {NOT_BUILT_YET}
      </p>
    </>
  );
}
