"use client";

// Clienti, ecranul de lista. Cardul P3-06.
//
// CINCI COLOANE SI NICI UNA IN PLUS: Denumire, Tip, Telefon, Proiecte active,
// Stare. Adresa, emailul, IDNO-ul si notele sunt detaliu, nu lista. Doctrina de
// densitate spune exact asta si nu se negociaza per ecran: o lista arata cel mai
// mic set de coloane care lasa un om sa aleaga un rand.
//
// FIECARE FILTRU ESTE IN URL, deci o lista filtrata se poate trimite cuiva ca
// legatura si butonul de inapoi o reface intocmai. Un filtru care traieste numai
// in starea componentului este un ecran pe care nu il poti arata nimanui.
//
// FILTRAREA SE FACE PE SERVER, prin public.search_clients din migratia 0020.
// Componentul acesta nu filtreaza nimic in memorie: primeste pagina care i se
// cuvine si o deseneaza.
//
// P3-45. LEADURI ESTE O VEDERE A ACESTUI ECRAN, NU UN ECRAN NOU. `vedere=leaduri`
// arata fiecare client care nu este la etapa Client, `vedere=clienti` doar pe cei
// de la etapa Client, iar /clienti fara parametru arata in continuare fiecare rand,
// exact ca inainte. Vederea si etapa stau in URL, langa filtrele de pana acum, si
// NU in `stare`, care inseamna activ sau inactiv.
//
// In vederea Leaduri coloanele sunt Denumire, Interes, Etapă, Data de reluare,
// Telefon si Stare: tipul si proiectele active nu ajuta pe nimeni sa aleaga pe cine
// suna azi. Numerele pe etapa sunt un rand de cifre in cipuri, nu un al doilea tabel.
//
// P3-48. INTERES ESTE O COLOANA NUMAI A VEDERII LEADURI, imediat dupa Denumire:
// spune ce vrea omul, adica de ce il suni. Vederea Clienți si lista fara vedere isi
// pastreaza coloanele. Un text lung se taie pe un rand, cu textul intreg in title.
//
// P3-89. URMATORUL PAS ESTE O COLOANA A VEDERII LEADURI, imediat dupa Data de
// reluare, numai cand migratia 0058 exista. Lista vine ordonata din baza dupa data
// pasului, altfel dupa data de reluare.
//
// P3-112, goal G68. INACTIVI ESTE A TREIA VEDERE A ACESTUI ECRAN, langa Toți,
// Leaduri si Clienți, si arata fiecare lead SI client dezactivat intr-o singura
// lista, cu numarul pe vedere, cu cautarea de aici si cu Reactivează pe fiecare
// rand. Pana la cardul acesta la ei se ajungea numai schimband filtrul Stare, deci
// pentru proprietar leadurile dezactivate nu aveau unde sa fie.
//
// O VEDERE, NU UN CARD PE /crm, si alegerea nu este de gust. Antetul lui
// app/(app)/crm/page.tsx spune despre ecranul acela: "NU CITESTE NIMIC DIN BAZA.
// Trei carduri si trei legaturi, fara numere: predarea proprietarului nu cere
// niciunul, iar cardul P3-40 a masurat deja in jur de 32 de drumuri la baza pe o
// randare autentificata. Un ecran al carui singur rost este sa fie un meniu nu
// adauga altele." Un card cu numarul celor dezactivati l-ar fi facut sa citeasca.
// Aici numarul nu costa un drum in plus: ecranul citeste oricum baza.
//
// SI NICI O RUTA NOUA. `vedere=inactivi` pe /clienti, ca celelalte doua vederi, deci
// labelForPath si verificarea de legaturi moarte din lib/nav.ts nu au ce sa invete.
//
// VEDEREA ESTE EA INSASI FILTRUL DE STARE, deci selectorul Stare nu se arata acolo:
// ar fi doua controale pentru acelasi lucru, iar unul din ele ar scoate operatorul
// din vedere. Filtrul de pana acum RAMANE NEATINS in celelalte vederi, si cele doua
// propozitii de stare goala pe care le-a scris P3-66, care trimit la el, rămân
// adevarate: cardul acesta adauga un loc unde sa te uiti, nu muta filtrul.
//
// NU EXISTA DATA DEZACTIVARII SI NU SE INVENTEAZA UNA. `clients.active` este un
// boolean (0013:67) si nota migratiei spune "Deactivation is the active boolean;
// deletion is not a feature" (0013:177): nu exista nicio coloana `deactivated_at`
// in tot depozitul. Goalul cere data "daca o avem", si nu o avem, deci coloana nu
// se deseneaza deloc: o coloana mereu goala este un defect, iar una ghicita este
// mai rea. Raportul cardului scrie ce ar putea si ce nu ar putea arata o coloana
// adaugata acum.
//
// P3-96, constatarile F6 si F7 din maturarea de erori. REGULA DIN ANTETUL DE MAI
// SUS SE APLICA SI CELOR DOUA LOCURI CARE O INCALCAU. Șterge filtrele scoate exact
// campurile pe care `filtered` le citeste si lasa `vedere` in URL, in loc sa arunce
// tot si sa mute operatorul din Leaduri in Toți. Iar casuta de cautare urmeaza
// URL-ul: cand `q` se schimba din butonul de inapoi, dintr-o legatura primita sau
// din Șterge filtrele, casuta se resincronizeaza, fara sa atinga scrisul de moment.

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
} from "@/components/ui/primitives";
import {
  CLIENT_REACTIVATED_NOTICE,
  CLIENT_TYPE_LABEL,
  LEADURI_STAGES,
  type ClientListQuery,
  type ClientOwnerChoice,
  type ClientRow,
  type ClientStageCounts,
} from "@/lib/data/clients-types";
import { formatDate, plural } from "@/lib/data/format";
import {
  PHONE_ACTIONS_CELL,
  PHONE_CELL,
  PHONE_CONTROL,
  PHONE_LINK,
  PHONE_ROW,
  PHONE_TABLE,
  PHONE_WIDE,
} from "@/components/ui/phone";
import { ClientForm } from "./ClientForm";
import { ClientImportSheet } from "./ClientImportSheet";
import { LeadImportSheet, download } from "./LeadImportSheet";
import { exportLeads } from "@/lib/data/lead-export-actions";
import { EXPORT_FILE_NAME } from "@/lib/data/lead-import-types";
import { LeaduriForm } from "./LeaduriForm";
import { ReactivateRowButton } from "./ReactivateRowButton";
import { StageMark } from "./StageMark";

// P3-64. PE TELEFON (sub 768px) FIECARE RAND DEVINE UN CARD, iar peste 768px
// nimic nu se schimba: fiecare clasa importata mai sus poarta max-md. ACELASI DOM,
// nu o a doua lista ascunsa, fiindca spec-urile numara client-row si o copie ar
// dubla fiecare numar pe desktop. Eticheta fiecarui camp este textul din antetul
// coloanei, pus pe celula in data-label si desenat din CSS, deci textul celulei
// ramane exact cel de azi. Textele starilor goale nu se ating.
//
// P3-97, constatarea F14. CLASELE SE IMPORTA, NU SE MAI SCRIU AICI. Ecranul
// acesta isi declara pana acum propriile PHONE_TABLE, PHONE_ROW, PHONE_CELL,
// PHONE_WIDE si PHONE_LINK, cu aceleasi nume ca ale fisierului comun pe care il
// importa AziScreen, ClientTabs, InboundOrderForm si restul. Doua dintre ele
// apucasera deja sa se departeze:
//
//   PHONE_TABLE, marginea interioara   aici px-5 pb-5   comun p-4
//   PHONE_LINK, afisarea               aici flex        comun inline-flex
//
// Adica un rand de pe Clienți si un rand de pe Azi aratau altfel pe telefon fara
// ca cineva sa fi cerut asta, si orice reparatie viitoare a fisierului comun ar
// fi ocolit tacut ecranul acesta. Se iau valorile comune asa cum sunt: nici
// raportul CRITIC, nici cardul nu au gasit vreun motiv pentru care lista de
// clienti ar avea nevoie de alta margine sau de alta afisare decat orice alta
// lista, deci nu se adauga nici o clasa in plus la locul folosirii.
//
// PHONE_CONTROL era al saselea nume local si singurul fara pereche in fisierul
// comun. Acum este acolo, fiindca fisa de verificare a extragerii are nevoie de
// exact aceeasi combinatie (constatarea F9).

export function ClientsScreen({
  rows,
  total,
  page,
  pageCount,
  query,
  canWrite,
  stageAvailable,
  nextActionAvailable = false,
  leaduri,
  inactiveCount = null,
}: {
  rows: ClientRow[];
  total: number;
  page: number;
  pageCount: number;
  query: ClientListQuery;
  canWrite: boolean;
  /** P3-43. Daca formularul de client nou poate oferi etapa. */
  stageAvailable: boolean;
  /** P3-89. Daca vederea Leaduri arata coloana Următorul pas, adica 0058 exista. */
  nextActionAvailable?: boolean;
  /** P3-45. Null cat timp migratia 0040 nu exista pe baza: atunci ecranul nu
   *  ofera vederile, cipurile si formularul de lead, exact ca inainte de card. */
  leaduri: { counts: ClientStageCounts; owners: ClientOwnerChoice[] } | null;
  /** P3-112. Cati sunt dezactivati, leaduri si clienti la un loc, sub aceeasi
   *  cautare si acelasi tip ca lista. Numarul de pe vederea Inactivi. Null pe
   *  aceeasi cale ca `leaduri`: inainte de 0040 vederile nu exista. */
  inactiveCount?: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [q, setQ] = React.useState(query.q);
  const [creating, setCreating] = React.useState(false);
  const [creatingLead, setCreatingLead] = React.useState(false);
  // P3-101. Importul este un panou al vederii Leaduri, nu un ecran nou, exact ca
  // formularul de lead de mai sus.
  const [importing, setImporting] = React.useState(false);
  // P3-123. Importul de clienti este un panou al vederii Clienți, langa Client
  // nou, exact ca importul de leaduri langa Lead nou.
  const [importingClients, setImportingClients] = React.useState(false);
  // P3-126. Exportul scrie vederea curenta; propozitia de dupa el (fisier taiat) si
  // refuzul stau sub antetul cardului, ca cele de la reactivare.
  const [exporting, setExporting] = React.useState(false);
  const [exportNotice, setExportNotice] = React.useState<string | null>(null);
  const [exportError, setExportError] = React.useState<string | null>(null);

  async function runExport() {
    setExporting(true);
    setExportNotice(null);
    setExportError(null);
    try {
      const result = await exportLeads({
        q: query.q,
        type: query.type,
        status: query.status,
        view: query.view,
        stage: query.stage,
      });
      if (!result.ok) {
        setExportError(result.message);
        return;
      }
      download(result.value.csv, EXPORT_FILE_NAME);
      setExportNotice(
        result.value.notice ??
          `Am exportat ${result.value.count} ${result.value.count === 1 ? "rând" : "rânduri"}.`,
      );
    } catch {
      setExportError("Exportul nu a reușit. Încearcă din nou.");
    } finally {
      setExporting(false);
    }
  }

  // P3-96, constatarea F7. CASUTA DE CAUTARE URMEAZA URL-UL, care este adevarul.
  //
  // Ecranul isi tine minte fiecare valoare a lui `q` pe care a TRIMIS-O el in URL si
  // care nu s-a intors inca. Cand `q` din URL devine o valoare care nu este a lui,
  // adica butonul de inapoi sau de inainte, o legatura primita sau Șterge filtrele,
  // casuta se resincronizeaza. Cand devine una trimisa de el, casuta nu se atinge:
  // altfel un nume pe jumatate tastat ar fi sters la fiecare tasta. Acelasi tipar ca
  // `seen` din components/ui/DateField.tsx, pentru exact aceeasi problema.
  //
  // FARA ASTA, lista si casuta spuneau lucruri diferite: dupa butonul de inapoi lista
  // se refacea din URL, iar casuta ramanea cu termenul tastat inainte, si Șterge
  // filtrele disparea in aceeasi clipa, fiindca `filtered` citeste URL-ul.
  //
  // O LISTA SI NU O SINGURA VALOARE, fiindca o navigare ceruta de ecran poate ajunge
  // DUPA cea de dupa ea: la 300ms de intarziere si o pagina care isi cere randurile
  // din baza, randarea pentru "abc" poate veni dupa ce ecranul a trimis deja "abcd",
  // iar o singura valoare ar citi-o ca venita din afara si ar taia tastele de la
  // urma. Gasirea unei valori trimise arunca si tot ce a fost trimis inaintea ei,
  // deci lista nu creste cand o randare intermediara nu mai ajunge.
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

  // Casuta de cautare se scrie local si se trimite in URL cu intarziere. Fara
  // debounce, fiecare tasta ar fi o navigare si o interogare.
  //
  // P3-96. Comparatia nu se mai face cu `query.q`, ci cu ultima valoare pe care
  // ecranul a cerut-o, fiindca o cerere in drum spre server nu se vede inca in
  // `query.q` si un al doilea push ar trimite acelasi text a doua oara.
  // Intarzierea ramane 300ms si nici o tasta nu se pierde.
  React.useEffect(() => {
    if (q === (sent.current.at(-1) ?? urlQ.current)) return;
    const t = setTimeout(() => pushQ(q, { pagina: "1" }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function push(patch: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`${pathname}?${next.toString()}`);
  }

  /** P3-96. Acelasi `push`, plus valoarea lui `q` tinuta minte ca trimisa de ecran:
   *  numai asa resincronizarea de mai sus deosebeste o schimbare venita din afara. */
  function pushQ(next: string, patch: Record<string, string>) {
    sent.current = [...sent.current, next];
    push({ ...patch, q: next });
  }

  const inLeaduri = leaduri !== null && query.view === "leaduri";
  // P3-112. Ca la `inLeaduri`: fara migratia 0040 ecranul nu ofera vederile deloc, si
  // o adresa scrisa de mana cade pe lista de pana atunci, nu pe o vedere pe jumatate.
  const inInactivi = leaduri !== null && query.view === "inactivi";

  // P3-112. IN VEDEREA INACTIVI STAREA NU ESTE UN FILTRU, este vederea, deci nu intra
  // in socoteala lui `filtered`. Altfel Șterge filtrele s-ar vedea mereu acolo si nu ar
  // avea ce sa stearga: `stare` este `inactive` prin definitia vederii.
  const filtered = inInactivi
    ? query.q !== "" || query.type !== ""
    : query.q !== "" || query.type !== "" || query.status !== "active" || query.stage !== "";

  const leaduriTotal = leaduri
    ? LEADURI_STAGES.reduce((sum, s) => sum + leaduri.counts[s], 0)
    : 0;

  // P3-112. Propozitia de dupa o reactivare de pe un rand, si refuzul, amandoua sub
  // antetul cardului: randul reactivat pleaca din lista in aceeasi clipa, deci o
  // confirmare scrisa in rand ar pleca cu el. role=status si role=alert, ca pe fisa.
  const [rowNotice, setRowNotice] = React.useState<string | null>(null);
  const [rowError, setRowError] = React.useState<string | null>(null);

  /** P3-112. Iese din vederea Inactivi: starea se intoarce la implicitul Activi.
   *  Din celelalte vederi `stare` NU se atinge, exact ca pana acum, ca o lista pusa
   *  pe Inactivi din selector sa nu se reseteze cand se schimba vederea. */
  function leaveInactivi(): Record<string, string> {
    return inInactivi ? { stare: "" } : {};
  }

  return (
    <>
      {/* P3-50. VEDEREA LEADURI SE DESCRIE SINGURA: subtitlul ei, iar Lead nou este
          singurul buton, cel principal. Client nou lipseste de aici fiindca un lead
          devine client printr-o schimbare de etapa (P3-45), iar a doua cale de
          creare pe vederea Leaduri ar aduce acelasi om de doua ori. Vederea Clienți
          si lista fara vedere raman exact ca inainte. */}
      {/* P3-112. VEDEREA INACTIVI SE DESCRIE SINGURA, ca vederea Leaduri, si nu are
          niciun buton de creare: nimeni nu adauga un rand direct la cei dezactivati.
          Un rand ajunge aici numai pentru ca cineva l-a dezactivat de pe fisa lui. */}
      <PageHeader
        title={inInactivi ? "Inactivi" : inLeaduri ? "Leaduri" : "Clienți"}
        lead={
          inInactivi
            ? "Leadurile și clienții dezactivați. Nu apar în liste și în selectoare până la reactivare."
            : inLeaduri
              ? "Persoanele și firmele care nu sunt încă clienți, cu etapa lor și data la care trebuie sunate."
              : "Beneficiarii, cu datele lor de contact și proiectele lor."
        }
        actions={
          !canWrite || inInactivi ? null : inLeaduri ? (
            // P3-101. Importa leaduri sta LANGA Lead nou, ca buton secundar: a
            // adauga un lead pe rand ramane actiunea principala a vederii, iar
            // importul este drumul pe care il face cineva o data, la inceput.
            <>
              <Button
                variant="secondary"
                onClick={() => setImporting(true)}
                data-testid="leaduri-import"
                className="max-md:min-h-11"
              >
                Importă din CSV
              </Button>
              {/* P3-126. Exporta vederea de acum, cu toate filtrele, toate randurile. */}
              <Button
                variant="secondary"
                onClick={runExport}
                disabled={exporting}
                data-testid="leaduri-export"
                className="max-md:min-h-11"
              >
                Exportă CSV
              </Button>
              <Button
                onClick={() => setCreatingLead(true)}
                data-testid="leaduri-new"
                className="max-md:min-h-11"
              >
                Lead nou
              </Button>
            </>
          ) : (
            <>
              {leaduri ? (
                <Button
                  variant="secondary"
                  onClick={() => setCreatingLead(true)}
                  data-testid="leaduri-new"
                  className="max-md:min-h-11"
                >
                  Lead nou
                </Button>
              ) : null}
              <Button
                variant="secondary"
                onClick={() => setImportingClients(true)}
                data-testid="clienti-import"
                className="max-md:min-h-11"
              >
                Importă din CSV
              </Button>
              <Button
                onClick={() => setCreating(true)}
                data-testid="client-new"
                className="max-md:min-h-11"
              >
                Client nou
              </Button>
            </>
          )
        }
      />

      <Card className={PHONE_TABLE}>
        <CardHeader
          title="Listă"
          hint={
            // P3-112. NUMARATORUL VEDERII INACTIVI TRECE PRIN `plural`, ca ceilalti:
            // "1 înregistrare dezactivată", "3 înregistrări dezactivate" si "20 de
            // înregistrări dezactivate". Cardul P3-98 a reparat sase locuri care
            // scriau numarul lipit de substantiv; acesta nu devine al saptelea.
            // "Înregistrare" si nu "lead" sau "client", fiindca lista le tine pe
            // amandoua si coloana Fel spune despre fiecare rand care este.
            inInactivi
              ? plural(total, "înregistrare dezactivată", "înregistrări dezactivate")
              : inLeaduri
                ? plural(total, "lead", "leaduri")
                : plural(total, "client", "clienți")
          }
        />

        {/* P3-112. Propozitia de dupa o reactivare de pe un rand, si refuzul, sub
            antetul cardului: acolo unde s-a apasat, fiindca randul a plecat. */}
        {rowNotice ? (
          <p
            role="status"
            data-testid="inactivi-notice"
            className="mx-5 mt-3 rounded-[10px] border border-rc-ok/25 bg-rc-ok-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
          >
            {rowNotice}
          </p>
        ) : null}
        {exportNotice ? (
          <p
            role="status"
            data-testid="leaduri-export-notice"
            className="mx-5 mt-3 rounded-[10px] border border-rc-ok/25 bg-rc-ok-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
          >
            {exportNotice}
          </p>
        ) : null}
        {exportError ? (
          <p
            role="alert"
            data-testid="leaduri-export-error"
            className="mx-5 mt-3 rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
          >
            {exportError}
          </p>
        ) : null}
        {rowError ? (
          <p
            role="alert"
            data-testid="inactivi-error"
            className="mx-5 mt-3 rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
          >
            {rowError}
          </p>
        ) : null}

        {leaduri ? (
          <div className="px-5 pt-5 flex flex-wrap items-center gap-2" data-testid="clients-views">
            <ViewButton
              active={query.view === ""}
              onClick={() => push({ vedere: "", etapa: "", pagina: "1", ...leaveInactivi() })}
              testId="view-toti"
            >
              Toți
            </ViewButton>
            <ViewButton
              active={query.view === "leaduri"}
              onClick={() => push({ vedere: "leaduri", etapa: "", pagina: "1", ...leaveInactivi() })}
              testId="view-leaduri"
            >
              Leaduri
              <span className="tabular-nums text-rc-muted" data-testid="view-count">
                {leaduriTotal}
              </span>
            </ViewButton>
            <ViewButton
              active={query.view === "clienti"}
              onClick={() => push({ vedere: "clienti", etapa: "", pagina: "1", ...leaveInactivi() })}
              testId="view-clienti"
            >
              Clienți
              <span
                className="tabular-nums text-rc-muted"
                data-testid="stage-count"
                data-stage="client"
              >
                {leaduri.counts.client}
              </span>
            </ViewButton>
            {/* P3-112. A PATRA PASTILA SI A TREIA VEDERE, cu numarul in acelasi stil ca
                celelalte doua: cifra langa eticheta, fara substantiv. Substantivul, cu
                forma romaneasca de plural, sta in explicatia de sub titlul cardului.
                `etapa` se goleste: vederea aceasta nu are cipuri de etapa. */}
            {inactiveCount === null ? null : (
              <ViewButton
                active={query.view === "inactivi"}
                onClick={() => push({ vedere: "inactivi", etapa: "", pagina: "1" })}
                testId="view-inactivi"
              >
                Inactivi
                <span className="tabular-nums text-rc-muted" data-testid="inactivi-count">
                  {inactiveCount}
                </span>
              </ViewButton>
            )}
          </div>
        ) : null}

        {inLeaduri && leaduri ? (
          // PATRU CIPURI, IN ORDINEA ETAPELOR, fiecare cu culoarea langa eticheta si
          // cu numarul ei. Un cip apasat din nou scoate filtrul.
          <div className="px-5 pt-3 flex flex-wrap items-center gap-2" data-testid="stage-chips">
            <ViewButton
              active={query.stage === ""}
              onClick={() => push({ etapa: "", pagina: "1" })}
              testId="stage-chip-all"
            >
              Toate etapele
            </ViewButton>
            {LEADURI_STAGES.map((s) => (
              <button
                key={s}
                type="button"
                data-testid="stage-chip"
                data-stage={s}
                aria-pressed={query.stage === s}
                onClick={() =>
                  push({ vedere: "leaduri", etapa: query.stage === s ? "" : s, pagina: "1" })
                }
                className={chipClass(query.stage === s)}
              >
                <StageMark
                  stage={s}
                  testId="stage-chip-mark"
                  colourTestId="stage-chip-colour"
                  labelTestId="stage-chip-label"
                  labelClassName="text-[12.5px] font-semibold"
                />
                <span className="tabular-nums text-rc-muted" data-testid="stage-count" data-stage={s}>
                  {leaduri.counts[s]}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {/* P3-52. Grila explicita, ca pe Inventar: Input si Select poarta w-full,
            deci intr-un rand flex-wrap fiecare cerea tot randul. Coloana auto de
            la final tine Șterge filtrele, ca selecturile sa nu treaca dedesubt
            cand butonul apare. */}
        {/* P3-112. In vederea Inactivi grila are trei coloane si nu patru: selectorul
            Stare nu se arata acolo, fiindca vederea insasi este starea. Sub 768px
            raman toate una sub alta, neschimbat. */}
        <div
          className={`p-5 grid items-center gap-3 max-md:grid-cols-1 ${
            inInactivi ? "grid-cols-[1.6fr_1fr_auto]" : "grid-cols-[1.6fr_1fr_1fr_auto]"
          }`}
          data-testid="clients-filters"
        >
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Caută după denumire, IDNO, telefon sau email"
            data-testid="clients-search"
            // Indiciul cautarii este mai lung decat caseta pe telefon: se termina
            // in puncte de suspensie, nu intr-o litera taiata. Textul nu se schimba.
            className={`${PHONE_CONTROL} max-md:text-ellipsis`}
          />

          <Select
            value={query.type}
            onChange={(e) => push({ tip: e.target.value, pagina: "1" })}
            data-testid="clients-type"
            className={PHONE_CONTROL}
          >
            <option value="">Toate tipurile</option>
            <option value="company">{CLIENT_TYPE_LABEL.company}</option>
            <option value="individual">{CLIENT_TYPE_LABEL.individual}</option>
          </Select>

          {/* P3-112. FILTRUL DE STARE RAMANE EXACT CUM ERA in celelalte vederi, cu
              cele trei optiuni ale lui: cardul acesta adauga o vedere, nu muta si nu
              scoate filtrul, iar cele doua propozitii de stare goala scrise de P3-66
              trimit la el si rămân adevarate. In vederea Inactivi nu se arata, fiindca
              acolo ar fi al doilea control pentru acelasi lucru. */}
          {inInactivi ? null : (
            <Select
              value={query.status}
              onChange={(e) => push({ stare: e.target.value, pagina: "1" })}
              data-testid="clients-status"
              className={PHONE_CONTROL}
            >
              <option value="active">Activi</option>
              <option value="inactive">Inactivi</option>
              <option value="toate">Toate</option>
            </Select>
          )}

          {filtered ? (
            <Button
              variant="secondary"
              // P3-96, constatarea F6. STERGE EXACT FILTRELE PE CARE LE NUMESTE SI
              // RAMANE IN VEDEREA DE ACUM. `router.push(pathname)` arunca fiecare
              // parametru, `vedere` inclusiv, deci operatorul care voia sa scoata un
              // cip de etapa ajungea din Leaduri in Toți: alt titlu, alt subtitlu,
              // alt buton principal si alt numar de coloane. Acum trece prin acelasi
              // `push` ca fiecare alt control de pe ecran, cu exact cele patru campuri
              // pe care `filtered` le citeste. `stare` se intoarce la "active", care
              // este lipsa filtrului pentru acel camp, nu la sirul gol, care nu este
              // o valoare a lui.
              //
              // SI CASUTA DE CAUTARE SE GOLESTE AICI, nu numai in URL. Cu un cip de
              // etapa pus, butonul se vede si cat timp textul tastat nu a ajuns inca
              // in URL: atunci `q` din URL nu se schimba, deci resincronizarea de mai
              // sus nu s-ar declansa, iar intarzierea de 300ms ar aduce termenul
              // inapoi imediat dupa ce filtrele au fost sterse. Golirea trece prin
              // `pushQ`, ca stergerea sa fie si ea o valoare trimisa de ecran.
              // P3-112. IN VEDEREA INACTIVI `stare` RAMANE `inactive`. Acelasi motiv
              // pe care F6 il da mai sus pentru `vedere`: a sterge cautarea nu are voie
              // sa mute operatorul intr-o alta lista. `inactive` este lipsa filtrului
              // pentru acel camp in vederea aceasta, asa cum "active" este in celelalte.
              onClick={() => {
                setQ("");
                pushQ("", {
                  tip: "",
                  stare: inInactivi ? "inactive" : "active",
                  etapa: "",
                  pagina: "1",
                });
              }}
              data-testid="clients-clear"
              className="max-md:min-h-11"
            >
              Șterge filtrele
            </Button>
          ) : null}
        </div>

        {rows.length === 0 ? (
          // P3-66. PE FILTRUL ACTIVI, O LISTA GOALA SPUNE CA CEI DEZACTIVATI SUNT
          // ASCUNSI si ofera un buton spre Inactivi, in fiecare vedere. Acolo parea
          // pierdut un lead dezactivat. Pe Inactivi si pe Toate starea goala ramane
          // cum era.
          <EmptyState
            title={
              // P3-112. Pe Inactivi starea goala este o VESTE BUNA si asa este scrisa:
              // nimeni nu este dezactivat. Nu ofera niciun buton, fiindca nu exista
              // nimic ascuns la care sa trimita si nimeni nu se adauga direct aici.
              inInactivi
                ? filtered
                  ? "Nicio înregistrare pentru filtrele alese"
                  : "Nimeni dezactivat"
                : inLeaduri
                  ? filtered
                    ? "Niciun lead pentru filtrele alese"
                    : "Niciun lead încă"
                  : filtered
                    ? "Niciun client pentru filtrele alese"
                    : "Niciun client încă"
            }
            hint={[
              filtered
                ? "Schimbă căutarea sau șterge filtrele."
                : inInactivi
                  ? "Fiecare lead și fiecare client este activ. Un rând ajunge aici doar dacă îl dezactivezi din fișa lui."
                  : inLeaduri
                    ? "Primul lead se adaugă din butonul de sus."
                    : "Primul client se adaugă din butonul de sus.",
              query.status === "active"
                ? inLeaduri
                  ? "Leadurile dezactivate nu apar aici, ci la filtrul Inactivi."
                  : "Clienții dezactivați nu apar aici, ci la filtrul Inactivi."
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            action={
              query.status === "active" ? (
                <Button
                  variant="secondary"
                  onClick={() => push({ stare: "inactive", pagina: "1" })}
                  data-testid="clients-show-inactive"
                  className="max-md:min-h-11"
                >
                  Arată inactivii
                </Button>
              ) : undefined
            }
          />
        ) : inInactivi ? (
          // P3-112. PATRU COLOANE SI O CELULA DE ACTIUNI, si nici una in plus, dupa
          // aceeasi doctrina de densitate din antetul acestui fisier: cel mai mic set
          // care lasa un om sa aleaga un rand. Denumire ca sa il recunoasca, Fel ca sa
          // stie daca a fost lead sau client, Etapă pentru unde ramasese, Telefon ca sa
          // il poata suna de aici, si butonul.
          //
          // STARE NU ESTE O COLOANA AICI. Fiecare rand din lista aceasta este inactiv:
          // o coloana in care fiecare celula scrie acelasi cuvant nu ajuta pe nimeni sa
          // aleaga un rand, iar titlul, explicatia de sub el si pastila apasata o spun
          // deja de trei ori.
          //
          // DATA DEZACTIVARII LIPSESTE FIINDCA NU EXISTA, si antetul fisierului spune
          // de ce nu se inventeaza.
          <Table>
            <thead>
              <tr>
                <Th>Denumire</Th>
                {/* "Fel" si nu "Tip": Tip inseamna deja companie sau persoana fizica
                    pe celelalte vederi ale acestui ecran, si doua coloane cu acelasi
                    nume si alt inteles este exact felul de ecran pe care nimeni nu il
                    citeste de doua ori la fel. */}
                <Th>Fel</Th>
                <Th>Etapă</Th>
                <Th>Telefon</Th>
                {canWrite ? <Th aria-label="Acțiuni" /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  data-testid="client-row"
                  data-id={c.id}
                  data-name={c.name}
                  className={`hover:bg-rc-paper ${PHONE_ROW}`}
                >
                  <Td data-label="Denumire" className={PHONE_WIDE}>
                    <Link
                      href={`/clienti/${c.id}`}
                      className={`font-semibold text-rc-black hover:underline ${PHONE_LINK}`}
                      data-testid="client-link"
                    >
                      {c.name}
                    </Link>
                  </Td>
                  <Td data-label="Fel" className={PHONE_CELL}>
                    {/* Un rand la etapa Client este un client; oricare alta etapa este
                        un lead. Cele cinci etape partitioneaza randurile, iar `stage`
                        este NOT NULL din 0039, deci nu exista un al treilea caz.
                        Liniuta acopera doar calea de dinainte de 0040, pe care vederile
                        nici nu se ofera. */}
                    <span data-testid="row-kind">
                      {c.stage === null ? "-" : c.stage === "client" ? "Client" : "Lead"}
                    </span>
                  </Td>
                  <Td data-label="Etapă" className={PHONE_CELL}>
                    {c.stage ? (
                      <StageMark
                        stage={c.stage}
                        testId="row-stage"
                        colourTestId="row-stage-colour"
                        labelTestId="row-stage-label"
                      />
                    ) : (
                      "-"
                    )}
                  </Td>
                  <Td data-label="Telefon" className={PHONE_CELL}>
                    {/* Telefonul ca legatura tel:, exact ca pe ecranul Azi: pe telefon
                        suna, pe birou nu strica nimic. */}
                    {c.phone ? (
                      <a
                        href={`tel:${c.phone.replace(/\s+/g, "")}`}
                        className={`text-rc-black underline decoration-rc-line-strong underline-offset-2 hover:decoration-rc-orange ${PHONE_LINK}`}
                        data-testid="inactivi-call"
                      >
                        {c.phone}
                      </a>
                    ) : (
                      "-"
                    )}
                  </Td>
                  {canWrite ? (
                    <Td align="right" className={PHONE_ACTIONS_CELL}>
                      <ReactivateRowButton
                        id={c.id}
                        name={c.name}
                        onDone={(name) => {
                          setRowError(null);
                          setRowNotice(`${name}: ${CLIENT_REACTIVATED_NOTICE}`);
                          router.refresh();
                        }}
                        onFailed={(message) => {
                          setRowNotice(null);
                          setRowError(message);
                        }}
                      />
                    </Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Table>
        ) : inLeaduri ? (
          <Table>
            <thead>
              <tr>
                <Th>Denumire</Th>
                <Th>Interes</Th>
                <Th>Etapă</Th>
                <Th>Data de reluare</Th>
                {nextActionAvailable ? <Th>Următorul pas</Th> : null}
                <Th>Telefon</Th>
                <Th>Stare</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  data-testid="client-row"
                  data-id={c.id}
                  data-name={c.name}
                  className={`hover:bg-rc-paper ${PHONE_ROW}`}
                >
                  <Td data-label="Denumire" className={PHONE_WIDE}>
                    <Link
                      href={`/clienti/${c.id}`}
                      className={`font-semibold text-rc-black hover:underline ${PHONE_LINK}`}
                      data-testid="client-link"
                    >
                      {c.name}
                    </Link>
                  </Td>
                  <Td data-label="Interes" className={PHONE_WIDE}>
                    {/* Pe telefon nu exista title la trecerea mouse-ului, deci
                        interesul se rupe pe randuri in loc sa fie taiat. */}
                    <span
                      className="block max-w-[260px] truncate max-md:max-w-none max-md:overflow-visible max-md:whitespace-normal"
                      title={c.interest?.trim() || undefined}
                      data-testid="row-interest"
                    >
                      {c.interest?.trim() || "-"}
                    </span>
                  </Td>
                  <Td data-label="Etapă" className={PHONE_CELL}>
                    {c.stage ? (
                      <StageMark
                        stage={c.stage}
                        testId="row-stage"
                        colourTestId="row-stage-colour"
                        labelTestId="row-stage-label"
                      />
                    ) : (
                      "-"
                    )}
                  </Td>
                  <Td data-label="Data de reluare" className={PHONE_CELL}>
                    <span className="inline-flex items-center gap-2 max-md:flex-wrap">
                      {formatDate(c.followUpDate)}
                      {/* Intarziat inseamna inainte de azi in Chisinau, calculat in
                          baza. Azi este datorat, nu intarziat. */}
                      {c.overdue ? (
                        <Chip tone="danger">
                          <span data-testid="row-overdue">Întârziat</span>
                        </Chip>
                      ) : null}
                    </span>
                  </Td>
                  {nextActionAvailable ? (
                    // P3-89. La De reluat data pasului este data de reluare din
                    // coloana alaturata, deci aici se scrie numai textul: aceeasi
                    // data de doua ori ar fi zgomot.
                    <Td data-label="Următorul pas" className={PHONE_WIDE}>
                      <span
                        className="block max-w-[240px] truncate max-md:max-w-none max-md:overflow-visible max-md:whitespace-normal"
                        title={c.nextAction?.trim() || undefined}
                        data-testid="row-next-action"
                      >
                        {[
                          c.stage !== "follow_up" && c.nextActionAt ? formatDate(c.nextActionAt) : null,
                          c.nextAction?.trim() || null,
                        ]
                          .filter(Boolean)
                          .join(", ") || "-"}
                      </span>
                    </Td>
                  ) : null}
                  <Td data-label="Telefon" className={PHONE_CELL}>
                    {c.phone ?? "-"}
                  </Td>
                  <Td data-label="Stare" className={PHONE_CELL}>
                    <Chip tone={c.active ? "ok" : "neutral"}>
                      {c.active ? "Activ" : "Inactiv"}
                    </Chip>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Denumire</Th>
                <Th>Tip</Th>
                <Th>Telefon</Th>
                <Th align="right">Proiecte active</Th>
                <Th>Stare</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  data-testid="client-row"
                  data-id={c.id}
                  data-name={c.name}
                  className={`hover:bg-rc-paper ${PHONE_ROW}`}
                >
                  <Td data-label="Denumire" className={PHONE_WIDE}>
                    <Link
                      href={`/clienti/${c.id}`}
                      className={`font-semibold text-rc-black hover:underline ${PHONE_LINK}`}
                      data-testid="client-link"
                    >
                      {c.name}
                    </Link>
                  </Td>
                  <Td data-label="Tip" className={PHONE_CELL}>
                    {CLIENT_TYPE_LABEL[c.type]}
                  </Td>
                  <Td data-label="Telefon" className={PHONE_CELL}>
                    {c.phone ?? "-"}
                  </Td>
                  <Td align="right" data-label="Proiecte active" className={PHONE_CELL}>
                    {c.activeProjects}
                  </Td>
                  <Td data-label="Stare" className={PHONE_CELL}>
                    <Chip tone={c.active ? "ok" : "neutral"}>
                      {c.active ? "Activ" : "Inactiv"}
                    </Chip>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        {pageCount > 1 ? (
          <div
            className="px-5 py-4 flex items-center justify-between border-t border-rc-line max-md:flex-wrap max-md:gap-3"
            data-testid="clients-pagination"
          >
            <span className="text-[12.5px] text-rc-muted">
              Pagina {page} din {pageCount}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => push({ pagina: String(page - 1) })}
                data-testid="clients-prev"
                className="max-md:min-h-11"
              >
                Înapoi
              </Button>
              <Button
                variant="secondary"
                disabled={page >= pageCount}
                onClick={() => push({ pagina: String(page + 1) })}
                data-testid="clients-next"
                className="max-md:min-h-11"
              >
                Înainte
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      {creating ? (
        <ClientForm
          stageAvailable={stageAvailable}
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false);
            router.push(`/clienti/${id}`);
          }}
        />
      ) : null}

      {importing ? <LeadImportSheet onClose={() => setImporting(false)} /> : null}

      {importingClients ? <ClientImportSheet onClose={() => setImportingClients(false)} /> : null}

      {creatingLead && leaduri ? (
        <LeaduriForm
          owners={leaduri.owners}
          onClose={() => setCreatingLead(false)}
          onSaved={(id) => {
            setCreatingLead(false);
            router.push(`/clienti/${id}`);
          }}
        />
      ) : null}
    </>
  );
}

function chipClass(active: boolean): string {
  return [
    // P3-64: pe telefon cipul este o tinta de atingere de 44px.
    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold leading-none whitespace-nowrap transition-colors max-md:min-h-11",
    active
      ? "bg-rc-white text-rc-black border-rc-orange"
      : "bg-rc-paper text-rc-muted border-rc-line-strong hover:text-rc-black",
  ].join(" ");
}

function ViewButton({
  active,
  onClick,
  testId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      data-testid={testId}
      className={chipClass(active)}
    >
      {children}
    </button>
  );
}
