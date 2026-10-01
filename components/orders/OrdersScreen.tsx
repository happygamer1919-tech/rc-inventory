"use client";

// P2-04 Comenzi.
//
// Un singur ecran cu ambele sensuri ale miscarii: intrari si iesiri, una langa
// alta. Deschiderea unei comenzi arata pozitiile si istoricul de stari, pentru
// ca asta face ciclul de viata lizibil, nu eticheta singura.
//
// Trecerea unei intrari in Recepționată este ce creeaza loturile, iar legatura
// aceasta este scrisa pe ecran, nu doar in date.
//
// Ambele coloane citesc acum din baza de date: intrarile de la P2-04, iesirile
// de la P2-05. Stratul demonstrativ nu mai este folosit de acest ecran.
//
// Deliberat neconstruit: receptii partiale si expedieri partiale. Statusurile
// sunt la nivel de comanda intreaga.

import * as React from "react";
import Link from "next/link";
import { PHONE_WRAP } from "@/components/ui/phone";
import { Button, Card, CardHeader, Chip, PageHeader, Select } from "@/components/ui/primitives";
import type { ChipTone } from "@/components/ui/primitives";
import { PHONE_CONTROL } from "@/components/ui/phone";
import { formatDate, formatMoney } from "@/lib/data/format";
import { INBOUND_STATUS_LABEL } from "@/lib/data/inbound-types";
import type { InboundOrder } from "@/lib/data/inbound-types";
import { ALL_OUTBOUND_MODES } from "@/lib/data/outbound-mode";
import { OUTBOUND_MODE_LABEL, OUTBOUND_STATUS_LABEL } from "@/lib/data/outbound-types";
import type { OutboundIssue, OutboundMode } from "@/lib/data/outbound-types";
import { InboundPanel } from "./InboundPanel";
import { OutboundPanel } from "./OutboundPanel";

type Selection = { kind: "in"; id: string } | { kind: "out"; id: string } | null;

/** P3-120 clauza 4. Ce arata lista: amandoua felurile, sau numai unul.
 *
 *  "toate" ESTE UN TOKEN AL ACESTUI CONTROL si nu un al treilea mod: uniunea
 *  OutboundMode are exact doua valori, si asa rămâne. Scris ca sir romanesc
 *  fiindca el nu se stocheaza nicaieri si nu pleaca spre nicio coloana. */
type ModeFilter = OutboundMode | "toate";

// P3-64. PE TELEFON (sub 768px) cele doua liste stau una sub alta, iar un nume
// lung se rupe pe randuri in loc sa fie taiat, fiindca pe telefon nu exista nimic
// care sa arate restul. Peste 768px nimic nu se schimba: clasele poarta max-md.
//
// P3-100. PHONE_WRAP era scris si aici si in app/(app)/page.tsx, cu valori
// diferite, deci a trecut in components/ui/phone.ts cu valoarea de baza. Cele doua
// locuri de aici pornesc de la `truncate`, deci mai au nevoie si de
// max-md:overflow-visible, scris acolo la locul lui: exact ce face deja randul de
// pe tabloul de bord. Setul de clase desenat ramane cel de azi.

const inboundTone = (s: string): ChipTone => (s === "arrived" ? "ok" : "warn");
const outboundTone = (s: string): ChipTone => (s === "shipped" ? "ok" : "warn");

export function OrdersScreen({
  inbound,
  outbound,
  filter,
  modeVisible = false,
}: {
  inbound: InboundOrder[];
  outbound: OutboundIssue[];
  /** P3-10. Filtrul de destinatie, venit din URL: /comenzi?proiect=<id> sau
   *  /comenzi?client=<id>. Este in URL si nu in starea componentului tocmai ca
   *  legatura din fisa proiectului sa poata fi trimisa cuiva, si ca butonul de
   *  inapoi sa functioneze. */
  filter?: { kind: "proiect" | "client"; id: string; label: string } | null;
  /** P3-120, DECIZIA B. Exista al doilea fel de iesire pe baza catre care arata
   *  aplicatia? Cat timp raspunsul este nu, nimic din acest card nu apare: niciun
   *  cuvant de mod pe randuri, niciun control de filtrare si nicio data de
   *  ridicare pe fisa. Raspunsul vine din lib/data/outbound.ts, unde este scris
   *  si de ce. Implicit fals, ca un apelant care nu il trimite sa arate ecranul
   *  de dinainte de acest card si niciodata un mod inventat. */
  modeVisible?: boolean;
}) {
  const [sel, setSel] = React.useState<Selection>(null);
  // P3-120 clauza 4. "Toate" IMPLICIT: lista se deschide aratand tot, fiindca un
  // filtru pus de la sine ar ascunde randuri pe care nimeni nu a cerut sa fie
  // ascunse. In starea componentului si nu in URL, spre deosebire de filtrul de
  // destinatie de deasupra, fiindca acesta nu vine de pe nicio alta fisa: el se
  // alege chiar aici, deci nu exista nicio legatura de trimis cuiva.
  const [modeFilter, setModeFilter] = React.useState<ModeFilter>("toate");

  // FILTRAREA SE FACE PE INREGISTRARE SI NU PE TEXT. Randurile istorice fara
  // proiect au projectId null si sunt deci excluse de orice filtru, ceea ce este
  // corect: nu se stie catre cine au plecat.
  //
  // P3-120 clauza 4. CELE DOUA FILTRE SE COMPUN SI NU SE INLOCUIESC. Filtrul de
  // destinatie al lui P3-10 rămâne exact cum era, cu butonul lui de golire; cel de
  // mod se adauga peste el. Niciunul nu il goleste pe celalalt: un control care ar
  // desface in tacere alegerea facuta de langa el este chiar defectul pe care
  // constatarea F6 a cardului P3-96 l-a inchis in alta parte. Si acesta filtreaza
  // pe INREGISTRARE, pe `o.mode`, si niciodata pe cuvantul scris pe ecran.
  const byDestination = filter
    ? outbound.filter((o) =>
        filter.kind === "proiect" ? o.projectId === filter.id : o.clientId === filter.id,
      )
    : outbound;
  const outboundShown =
    modeVisible && modeFilter !== "toate"
      ? byDestination.filter((o) => o.mode === modeFilter)
      : byDestination;

  const pendingIn = inbound.filter((o) => o.status === "pending_arrival").length;
  const pendingOut = outboundShown.filter((o) => o.status === "awaiting_shipment").length;

  const selectedIn = sel?.kind === "in" ? inbound.find((o) => o.id === sel.id) ?? null : null;
  const selectedOut = sel?.kind === "out" ? outbound.find((o) => o.id === sel.id) ?? null : null;

  return (
    <>
      <PageHeader
        title="Comenzi"
        lead={
          filter
            ? `Ieșirile către ${filter.label}. Intrările nu sunt filtrate: ele vin de la furnizori.`
            : "Intrările și ieșirile una lângă alta. Apasă pe o comandă pentru poziții și istoricul stărilor."
        }
        actions={
          filter ? (
            <Link href="/comenzi" className="max-md:inline-flex">
              <Button
                variant="secondary"
                data-testid="orders-clear-filter"
                className="max-md:min-h-11"
              >
                Vezi toate ieșirile
              </Button>
            </Link>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <Card>
          <CardHeader
            title="Intrări"
            hint="Comenzi către furnizori"
            right={
              <span className="text-[12px] text-rc-muted" data-testid="inbound-count">
                {pendingIn} în așteptare din {inbound.length}
              </span>
            }
          />
          <ul data-testid="inbound-list">
            {inbound.map((o, i) => (
              <li key={o.id} className={i < inbound.length - 1 ? "border-b border-rc-line" : ""}>
                <button
                  onClick={() => setSel({ kind: "in", id: o.id })}
                  data-testid="inbound-item"
                  data-reference={o.reference}
                  // P2-08a: order_id ESTE cheia de idempotenta a contractului
                  // de extragere, deci trebuie citibila de pe ecran.
                  data-id={o.id}
                  className={[
                    "w-full text-left px-5 py-3.5 transition-colors",
                    sel?.kind === "in" && sel.id === o.id
                      ? "bg-rc-orange-soft"
                      : "hover:bg-rc-paper",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-3 max-md:flex-wrap max-md:gap-y-1">
                    <span className="text-[13.5px] font-semibold text-rc-black max-md:[overflow-wrap:anywhere]">
                      {o.reference}
                    </span>
                    <Chip tone={inboundTone(o.status)}>{INBOUND_STATUS_LABEL[o.status]}</Chip>
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-1">
                    <span className={`text-[12.5px] text-rc-muted truncate max-md:overflow-visible ${PHONE_WRAP}`}>
                      {o.supplierName ?? "Fără furnizor"}
                    </span>
                    <span className="rc-num text-[12.5px] text-rc-muted shrink-0">
                      {formatMoney(o.totalMdl)}
                    </span>
                  </div>
                  <p className="text-[11.5px] text-rc-muted-2 mt-1">
                    {o.lines.length} {o.lines.length === 1 ? "poziție" : "poziții"} ·{" "}
                    {o.arrivedAt
                      ? `recepționată ${formatDate(o.arrivedAt)}`
                      : `estimat ${formatDate(o.expectedAt)}`}
                    {o.documentPath ? " · document atașat" : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          {inbound.length === 0 ? (
            <p
              className="px-5 py-12 text-center text-[13px] text-rc-muted"
              data-testid="inbound-empty"
            >
              Nicio comandă de intrare încă. Adaugă una manual sau încarcă un document.
            </p>
          ) : null}
        </Card>

        <Card>
          <CardHeader
            title="Ieșiri"
            // P3-120. "Eliberări către proiecte" A DEVENIT FALS la migratia 0067 si
            // nu se pastreaza ca pe o doctrina: este text de interfata, iar un text
            // de interfata fals este o minciuna pe ecran si nu o propozitie de citit.
            // De la hotararea R-215 incoace lista poarta amandoua felurile, deci
            // antetul le numeste pe amandoua.
            hint="Eliberări către proiecte și către clienți direcți"
            right={
              <span className="text-[12px] text-rc-muted">
                {pendingOut} de expediat din {outboundShown.length}
              </span>
            }
          />

          {/* P3-120 CLAUZA 4, DECIZIA A A INSTRUCTIUNII. FILTRUL PE MOD, PE ECRAN.
              O lista care arata o deosebire si nu se poate filtra pe ea il pune pe
              operator sa citeasca fiecare rand. Un `Select` cu o opțiune "Toate" este
              chiar tiparul de filtru al acestui depozit, cel de pe /clienti, si nu un
              al doilea fel inventat aici.
              OPTIUNILE VIN DIN ALL_OUTBOUND_MODES si cuvintele din OUTBOUND_MODE_LABEL:
              un mod adaugat mai tarziu apare in filtru fara o a doua editare, si nicio
              eticheta nu este scrisa de mana in acest fisier.
              NU APARE CAT TIMP 0067 NU ESTE APLICATA: atunci nu exista decat un singur
              fel de iesire, deci un filtru intre doua feluri nu ar filtra nimic. */}
          {modeVisible ? (
            <div className="px-5 pb-4" data-testid="outbound-mode-filter">
              <Select
                value={modeFilter}
                onChange={(e) => setModeFilter(e.target.value as ModeFilter)}
                aria-label="Filtrează ieșirile după tipul eliberării"
                data-testid="outbound-mode-filter-select"
                className={PHONE_CONTROL}
              >
                <option value="toate">Toate</option>
                {ALL_OUTBOUND_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {OUTBOUND_MODE_LABEL[mode]}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <ul data-testid="outbound-list">
            {outboundShown.map((o, i) => (
              <li key={o.id} className={i < outbound.length - 1 ? "border-b border-rc-line" : ""}>
                <button
                  onClick={() => setSel({ kind: "out", id: o.id })}
                  data-testid="outbound-item"
                  data-reference={o.reference}
                  className={[
                    "w-full text-left px-5 py-3.5 transition-colors",
                    sel?.kind === "out" && sel.id === o.id
                      ? "bg-rc-orange-soft"
                      : "hover:bg-rc-paper",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-3 max-md:flex-wrap max-md:gap-y-1">
                    <span className="text-[13.5px] font-semibold text-rc-black max-md:[overflow-wrap:anywhere]">
                      {o.reference}
                    </span>
                    <Chip tone={outboundTone(o.status)}>{OUTBOUND_STATUS_LABEL[o.status]}</Chip>
                  </div>
                  {/* max-md:flex-wrap SI max-md:gap-y-1 CA PE RANDUL DE DEASUPRA, si
                      pentru acelasi motiv: pe telefon randul poarta de acum doua
                      lucruri, destinatia si felul eliberarii, iar o destinatie lunga
                      trece pe randul ei in loc sa impinga ceva in afara ecranului.
                      Cazul (4) din phone-lists.spec masoara chiar asta pe /comenzi. */}
                  <div className="flex items-center justify-between gap-3 mt-1 max-md:flex-wrap max-md:gap-y-1">
                    {/* P3-120. DESTINATIA, SI EA TREBUIE SA FIE ADEVARATA PE AMANDOUA
                        FELURILE. O iesire catre client direct NU ARE proiect, prin
                        outbound_issues_direct_client_mode_shape, deci randul ei scria
                        pana acum "Proiect necunoscut": nu o reconciliere lipsa, ci o
                        propozitie falsa. Acolo se scrie cumparatorul, fiindca el ESTE
                        destinatia. Pe o iesire pe proiect nu se schimba nimic. */}
                    <span className={`text-[12.5px] text-rc-black truncate max-md:overflow-visible ${PHONE_WRAP}`}>
                      {o.mode === "direct_client" ? o.clientName : o.projectName}
                    </span>
                    {/* P3-120 CLAUZA 1. MODUL, CA CUVANT ROMANESC SI NICIODATA CA TOKEN.
                        Cuvantul vine din OUTBOUND_MODE_LABEL si nu este scris aici, langa
                        eticheta de status si pentru acelasi motiv, P2-01: valoarea stocata
                        nu este text de interfata.
                        NICIUN TOKEN NU AJUNGE NICI INTR-UN ATRIBUT AL ACESTUI RAND. Testul
                        citeste eticheta prin data-testid si randul prin data-reference, deci
                        nu are nevoie de `direct_client` scris nicaieri in lista: un token
                        pus "doar pentru test" ar fi tot un token in marcaj.
                        DECIZIA B: cat timp 0067 nu este aplicata eticheta nu apare deloc.
                        Atunci fiecare rand este o iesire pe proiect, deci un "Proiect" pe
                        fiecare rand ar fi adevarat si complet nefolositor: ar fi o coloana
                        care nu deosebeste nimic, pe un ecran care nu are inca ce deosebi. */}
                    {modeVisible ? (
                      <span
                        className="shrink-0 text-[11.5px] text-rc-muted"
                        data-testid="outbound-item-mode"
                      >
                        {OUTBOUND_MODE_LABEL[o.mode]}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[11.5px] text-rc-muted-2 mt-1">
                    {/* Pe un rand de client direct cumparatorul este deja scris deasupra,
                        ca destinatie, deci nu se repeta aici: in locul lui sta ziua in care
                        materialul se ridica, pe care clauza 2 o cere vazuta. */}
                    {o.mode === "direct_client"
                      ? `ridicare ${formatDate(o.pickupDate)}`
                      : o.clientName}{" "}
                    · {o.lines.length} {o.lines.length === 1 ? "poziție" : "poziții"} ·{" "}
                    {o.shippedAt
                      ? `expediată ${formatDate(o.shippedAt)}`
                      : `emis ${formatDate(o.issuedAt)}`}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          {outbound.length === 0 ? (
            <p
              className="px-5 py-12 text-center text-[13px] text-rc-muted"
              data-testid="outbound-empty"
            >
              Nicio ieșire încă. Creează un bon de eliberare din ecranul Ieșiri.
            </p>
          ) : null}
        </Card>
      </div>

      <p className="mt-4 text-[12px] text-rc-muted-2 max-w-[80ch] leading-relaxed">
        Starea se schimbă pentru toată comanda odată; o recepție sau o expediere parțială nu se
        poate înregistra.
      </p>

      {selectedIn ? <InboundPanel order={selectedIn} onClose={() => setSel(null)} /> : null}
      {selectedOut ? (
        <OutboundPanel
          issue={selectedOut}
          modeVisible={modeVisible}
          onClose={() => setSel(null)}
        />
      ) : null}
    </>
  );
}
