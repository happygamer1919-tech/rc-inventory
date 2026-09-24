"use client";

// Ecranul de verificare a extragerii, plus suprafata vizibila a esecului.
//
// DE CE ESUATE SI PARTIALE STAU IN ACEEASI LISTA cu cele reusite: un document
// cazut care nu apare nicaieri este un document care pare ca se proceseaza la
// nesfarsit, iar operatorul invata sa nu creada tot ecranul. Fiecare document
// isi arata starea, motivul in intregime si propozitia romaneasca a codului de
// eroare, niciodata tokenul brut.
//
// PARTIAL PASTREAZA LINIILE CARE S-AU EXTRAS. Noua linii bune si una ilizibila
// inseamna noua linii pe care operatorul nu le mai tasteaza.
//
// CRIT-16. MESAJUL DE REUSITA NU STA IN FISA CARE TOCMAI A DISPARUT.
//
// Confirmarea consuma ciorna, iar ciorna consumata iese din lista. Fisa de
// verificare este randata INAUNTRUL randului acelei ciorne, deci reimprospatarea
// care urmeaza confirmarii demonteaza fisa impreuna cu mesajul ei de reusita. Se
// vedea ca o confirmare care lasa ecranul gol: operatorul apasa, ceva clipeste,
// si nu mai are cum sa stie daca s-a creat comanda. Reusita traieste in panou,
// deasupra listei, si supravietuieste tocmai reimprospatarii care sterge ciorna.
//
// RETRIMITEREA FOLOSESTE ACELASI order_id. Prin regula de idempotenta a
// contractului rezultatul inlocuieste extragerea precedenta in loc sa adauge a
// doua ciorna, deci butonul este sigur apasat de doua ori.
//
// P3-97, constatarea F9. FISA DE VERIFICARE PE TELEFON, si ea a fost singura
// din aplicatie ramasa pe dinafara celor patru carduri de telefon, P3-60, P3-64,
// P3-65 si P3-67. Patru lucruri, toate sub 768px si niciunul peste:
//   - randul de sus, sase controale in patru coloane, se aseaza unul sub altul;
//   - randul fiecarei pozitii, din care 220px erau doua coloane fixe de 110px,
//     trece la doua coloane, cu cele doua campuri late pe randul intreg;
//   - fiecare camp si fiecare lista scrise de mana aici, adica in afara lui Input
//     si Select din primitives, primesc PHONE_CONTROL: 44px inaltime si text de
//     16px, sub care iOS Safari mareste pagina la atingerea campului;
//   - cele doua butoane de la capatul fisei stau unul sub altul. Button din
//     primitives poarta whitespace-nowrap, deliberat, ca o eticheta sa nu se
//     rupa la mijlocul unei expresii, iar un rand de asemenea butoane are
//     latimea minima egala cu suma lor: masurat la 390px, "Confirmă și creează
//     comanda" tinea 250px din cei 284 ai fisei, iar "Renunță" pleca de la 293
//     si se termina la 383. Acelasi tratament ca blocul de renuntare, din P3-84.
//
// SI FIECARE ETICHETA DIN CELE DOUA GRILE POARTA max-md:min-w-0, care nu este
// decor. Un element de grila are min-width: auto, adica nu se strange niciodata
// sub latimea lui de continut minim, iar continutul minim al unei liste de
// selectie este optiunea ei cea mai lunga: "Produs din catalog" tine tot
// catalogul, cu SKU si denumire. Coloana este minmax(0, 1fr) si se stramteaza
// cum trebuie, dar eticheta dinauntru iese din ea, si atunci fisa deruleaza
// lateral degeaba. Acelasi motiv pentru care PHONE_CELL din fisierul comun
// poarta max-md:min-w-0 de la P3-64.
//
// Cele sapte clase max-md de dinainte, de pe blocul de renuntare si de pe capul
// fisei documentului, raman neatinse.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Chip } from "@/components/ui/primitives";
import { DateField, useInvalidDates } from "@/components/ui/DateField";
import { FilePicker } from "@/components/ui/FilePicker";
import { PHONE_CONTROL, PHONE_STACK } from "@/components/ui/phone";
import {
  DERIVED_PARTIAL_NOTICE,
  EXTRACTION_ERROR_LABEL,
  EXTRACTION_INBOUND_LABEL,
  EXTRACTION_META_ABSENT,
  EXTRACTION_META_LABEL,
  EXTRACTION_META_TITLE,
  QUANTITIES_ONLY_NOTICE,
  SCAN_LINE_NOTICE,
  effectiveSource,
  formatExtractionDuration,
  hasExtractionMeta,
  isQuantitiesOnly,
  lineTotalSourceLabel,
  scanReadLines,
} from "@/lib/data/extraction-types";
import { formatDate, formatMoney, plural } from "@/lib/data/format";

/** P3-82. Un document citit, cu linii, fara niciun pret si fara niciun total.
 *  Numai pe `extracted` si `partial`: un `failed` nu a fost acceptat. */
function quantitiesOnlyDraft(d: ExtractionDraft): boolean {
  return (
    (d.status === "extracted" || d.status === "partial") &&
    isQuantitiesOnly({
      lineTotals: d.lines.map((l) => l.lineTotal),
      subtotal: d.subtotal,
      documentTotal: d.documentTotal,
    })
  );
}

/** EXT-15. O scanare al carei continut nu a fost citit.
 *
 *  O SINGURA DEFINITIE, FOLOSITA SI DE LISTA SI DE PANOU. Doua copii ale acestei
 *  conditii ar putea sa nu fie de acord, iar dezacordul care conteaza este cel in
 *  care lista ofera un buton catre un panou care randeaza formularul. */
function unreadScanDraft(d: { documentSource: unknown; status: unknown }): boolean {
  return effectiveSource(d.documentSource) === "scan" && d.status === "failed";
}

/** Un rand din blocul de diagnostic. Absenta se scrie, nu se ascunde: un camp
 *  care lipseste de pe ecran nu se deosebeste de unul care nu exista. */
function MetaRow({ label, value, testId }: { label: string; value: string | null; testId: string }) {
  return (
    <div data-testid={testId}>
      <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-rc-muted">{label}</dt>
      <dd className="text-[13.5px] text-rc-black">
        {value === null ? <span className="text-rc-muted">{EXTRACTION_META_ABSENT}</span> : value}
      </dd>
    </div>
  );
}

/** P3-72, constatarea F5 a lui Ivan. CE A RAPORTAT MODELUL DESPRE PROPRIA
 *  CITIRE, aratat operatorului.
 *
 *  DE CE EXISTA. `_meta` este stocat verbatim de la migratia 0008 incoace si
 *  comentariul acelei coloane spunea, in termeni, "stocat si niciodata aratat
 *  operatorului". Rostul lui este ca o extragere gresita sa poata fi EXPLICATA
 *  in loc sa fie discutata in contradictoriu, iar un camp pe care nimeni nu il
 *  poate vedea nu explica nimic nimanui. Constatarea F5 este exact asta.
 *
 *  INTR-UN `details` INCHIS, SI ACEASTA ESTE TOATA GRIJA. Ecranul acesta are un
 *  singur rost, reconcilierea documentului cu ce se salveaza, iar numele unui
 *  model si o durata in milisecunde nu au ce cauta in fata acelei sarcini. Se
 *  deschid cand cineva intreaba de ce a iesit asa, care este singurul moment in
 *  care conteaza.
 *
 *  PE RANDUL CIORNEI SI NU INAUNTRUL FISEI DE VERIFICARE, fiindca fisa nu se
 *  randeaza pentru orice ciorna: un esec DIGITAL nu are nici buton "Verifica"
 *  nici "Vezi antetul", deci un bloc pus acolo ar fi invizibil exact pe forma pe
 *  care constatarea o numeste.
 *
 *  NUMARUL DE PAGINI AL MODELULUI NUMAI PE FORMA ESUATA, cuvintele constatarii.
 *  Pe un document citit cu succes numarul nu spune nimic ce nu spun deja
 *  liniile; pe unul esuat este singurul indiciu ca modelul a citit o pagina
 *  dintr-un document de patru si a raspuns consecvent cu sine. Langa el sta
 *  numarul NOSTRU, numarat din bytes, fiindca un numar singur nu se poate
 *  compara cu nimic si doua numere cu etichete diferite sunt exact intrebarea. */
function ExtractionMetaDetails({ draft }: { draft: ExtractionDraft }) {
  const meta = hasExtractionMeta(draft.meta) ? draft.meta : null;
  const showPages = draft.status === "failed";
  if (meta === null && !showPages) return null;

  const durationMs = meta === null ? null : meta.durationMs;

  return (
    <details className="mt-2" data-testid="draft-meta" data-order-id={draft.orderId}>
      <summary className="cursor-pointer text-[12px] text-rc-muted" data-testid="draft-meta-toggle">
        {EXTRACTION_META_TITLE}
      </summary>
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2" data-testid="draft-meta-body">
        <MetaRow
          testId="draft-meta-model"
          label={EXTRACTION_META_LABEL.model}
          value={meta?.model ?? null}
        />
        <MetaRow
          testId="draft-meta-prompt-version"
          label={EXTRACTION_META_LABEL.promptVersion}
          value={meta?.promptVersion ?? null}
        />
        <MetaRow
          testId="draft-meta-duration"
          label={EXTRACTION_META_LABEL.durationMs}
          value={durationMs === null ? null : formatExtractionDuration(durationMs)}
        />
        {/* Cauza se arata NUMAI CAND A SOSIT. Ea nu este in contract, deci un
            rand "Nu s-a raportat" ar promite un camp pe care nimeni nu s-a
            angajat sa il trimita. Celelalte trei sunt in contract si absenta lor
            este ea insasi un fapt despre citire. */}
        {meta?.partialCause ? (
          <MetaRow
            testId="draft-meta-partial-cause"
            label={EXTRACTION_META_LABEL.partialCause}
            value={meta.partialCause}
          />
        ) : null}
        {showPages ? (
          <>
            <MetaRow
              testId="draft-meta-model-pages"
              label={EXTRACTION_META_LABEL.modelPageCount}
              value={draft.modelPageCount === null ? null : String(draft.modelPageCount)}
            />
            <MetaRow
              testId="draft-meta-upload-pages"
              label={EXTRACTION_META_LABEL.uploadPageCount}
              value={draft.uploadPageCount === null ? null : String(draft.uploadPageCount)}
            />
          </>
        ) : null}
      </dl>
    </details>
  );
}
/** EXT-34. Codul furnizorului, descrierea si sursa totalului unei linii, asa
 *  cum le-a trimis citirea. Numai citite: nu intra in formular si nu schimba
 *  nimic din ce se salveaza.
 *
 *  P3-97. Randul acesta sta INAUNTRUL grilei pozitiei si o traverseaza, deci
 *  intinderea lui urmeaza numarul de coloane al grilei: patru peste 768px, doua
 *  sub. Un col-span-4 intr-o grila de doua coloane ar naste doua coloane
 *  implicite si ar impinge randul inapoi in afara ecranului. */
function InboundLineDetails({ line, index }: { line: ExtractionLine | undefined; index: number }) {
  if (!line || (!line.supplierCode && !line.lineDescription && !line.lineTotalSource)) return null;
  return (
    <p
      className="col-span-4 max-md:col-span-2 max-md:min-w-0 max-md:[overflow-wrap:anywhere] flex flex-wrap gap-x-5 text-[11.5px] text-rc-muted-2"
      data-testid={`review-line-inbound-${index}`}
    >
      {line.supplierCode ? (
        <span data-testid={`review-line-supplier-code-${index}`}>
          {EXTRACTION_INBOUND_LABEL.supplierCode}: {line.supplierCode}
        </span>
      ) : null}
      {line.lineDescription ? (
        <span data-testid={`review-line-desc-${index}`}>
          {EXTRACTION_INBOUND_LABEL.lineDescription}: {line.lineDescription}
        </span>
      ) : null}
      {line.lineTotalSource ? (
        <span data-testid={`review-line-total-source-${index}`}>
          {EXTRACTION_INBOUND_LABEL.lineTotalSource}: {lineTotalSourceLabel(line.lineTotalSource)}
        </span>
      ) : null}
    </p>
  );
}
import { ALL_UNITS, unitLabel } from "@/lib/data/units";
import type { ExtractionDraft, ExtractionLine } from "@/lib/data/extraction-types";
import type { CatalogProduct, Category } from "@/lib/data/products";
import {
  cancelExtractionDraft,
  confirmExtractionDraft,
  refireExtraction,
  startExtraction,
  type ReviewedLine,
} from "@/lib/data/extraction-actions";

const ACCEPT = "application/pdf,image/png,image/jpeg";

/** Eticheta de stare. null inseamna trimis si fara raspuns inca. */
function stateLabel(draft: ExtractionDraft): { text: string; tone: "ok" | "warn" | "danger" | "neutral" } {
  if (draft.status === null) return { text: "În lucru", tone: "neutral" };
  if (draft.status === "extracted") return { text: "De verificat", tone: "ok" };
  if (draft.status === "partial") return { text: "Parțial", tone: "warn" };
  return { text: "Eșuat", tone: "danger" };
}

function ReviewForm({
  draft,
  products,
  categories,
  onDone,
  onCreated,
}: {
  draft: ExtractionDraft;
  products: CatalogProduct[];
  categories: Category[];
  onDone: () => void;
  /** CRIT-16. Reusita se raporteaza in sus si se afiseaza acolo, NU aici. */
  onCreated: (result: { reference: string; flagged: number }) => void;
}) {
  const router = useRouter();
  const [supplierName, setSupplierName] = React.useState(draft.supplierName ?? "");
  const [currency, setCurrency] = React.useState(draft.currency ?? "MDL");
  const [orderedAt, setOrderedAt] = React.useState(draft.orderDate ?? "");
  // EXT-11. Seria si numarul documentului furnizorului, in doua campuri.
  //
  // PE ECRAN SI NU NUMAI IN BAZA. Seria este partea identificatorului pe care
  // operatorul o vede tiparita pe hartie inaintea numarului. Daca ea ajunge in
  // baza si nu pe ecran, singurul om care poate corecta o citire gresita nu stie
  // ca exista ce sa corecteze.
  const [orderRef, setOrderRef] = React.useState(draft.orderRef ?? "");
  const [orderRefSeries, setOrderRefSeries] = React.useState(draft.orderRefSeries ?? "");
  const [expectedAt, setExpectedAt] = React.useState("");
  // P3-92, constatarea F4. Cat timp una dintre cele doua date ale foii arata
  // mesajul rosu, confirmarea sta oprita: sirul gol pe care campul il da nu se
  // deosebeste de o casuta golita anume, iar aici el ar sterge data citita din
  // document.
  const { anyInvalid: dateInvalid, mark } = useInvalidDates();
  const [lines, setLines] = React.useState<ReviewedLine[]>(() =>
    draft.lines.map((l) => ({
      // Nimic nu se potriveste automat pe un SKU asemanator. Operatorul alege,
      // sau nu alege si linia devine un produs marcat.
      productId: "",
      productName: l.productName,
      quantity: l.quantity === null ? "" : String(l.quantity),
      unitPrice: l.unitPrice === null ? "" : String(l.unitPrice),
      // NICIUN GHICIT AICI. Unitatea si categoria se precompleteaza numai daca
      // extragerea CHIAR le-a mapat; altfel raman goale si operatorul alege.
      // Contractul, sectiunea 4.4: ce nu se mapeaza este null, iar unit_raw si
      // category_raw poarta oricum cuvintele documentului, dedesubt pe ecran.
      unit: l.unit ?? "",
      categoryId: categories.find((c) => c.name === l.category)?.id ?? "",
    })),
  );
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  function setLine(index: number, patch: Partial<ReviewedLine>) {
    setLines((current) => current.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  async function confirm() {
    setPending(true);
    setError(null);
    const result = await confirmExtractionDraft(draft.orderId, {
      supplierName,
      currency,
      orderedAt,
      expectedAt,
      orderRef,
      orderRefSeries,
      lines,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    // CRIT-16. Se raporteaza in sus INAINTE de reimprospatare, si mesajul de
    // reusita se randeaza in afara acestui component. Vezi antetul.
    onCreated({ reference: result.value.reference, flagged: result.value.flagged });
    router.refresh();
  }

  // EXT-15. O SCANARE AL CAREI CONTINUT NU A FOST CITIT NU PRIMESTE UN FORMULAR.
  //
  // Regula proprietarului, din rezultatul scanarii din 2026-09-02: nicio cale de
  // acceptare, niciun camp de linie precompletat, si ecranul trebuie sa SPUNA ca
  // continutul nu a fost citit.
  //
  // ANTETUL SE ARATA SI ESTE ROSTUL ECRANULUI. Furnizorul, numarul documentului,
  // data, moneda, cota si totalurile tiparite s-au citit corect pe scanarea
  // observata, si ele sunt ce ii permite proprietarului sa identifice documentul
  // si sa bata liniile de mana contra unui total cunoscut.
  //
  // SE RANDEAZA CA TEXT, NU CA INTRARI. Un camp de formular precompletat este o
  // invitatie de a apasa Salveaza, iar aici nu exista nimic de salvat.
  const unreadScan = unreadScanDraft(draft);

  // EXT-17. O CIORNA DINTR-O IMAGINE, INDIFERENT DACA CIFRELE EI SE ADUNA.
  // Se calculeaza aici, o data, si se trece pe fiecare linie mai jos.
  const scanRead = scanReadLines(draft);

  if (unreadScan) {
    return (
      <div className="px-5 py-5" data-testid="review-unread-scan">
        <p
          className="rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3.5 py-2.5 text-[13px] text-rc-black max-w-[80ch]"
          data-testid="review-unread-notice"
        >
          Conținutul acestui document nu a fost citit. Este o scanare, iar liniile
          nu au putut fi verificate, deci nu se afișează niciuna. Datele de mai jos
          sunt antetul documentului, ca să îl poți identifica.
        </p>

        <dl className="mt-4 grid grid-cols-3 gap-x-6 gap-y-2.5" data-testid="review-unread-header">
          {[
            ["Furnizor", draft.supplierName],
            ["Data documentului", draft.orderDate],
            ["Monedă", draft.currencyRaw ?? draft.currency],
            ["Cotă TVA", draft.vatRate === null ? null : `${draft.vatRate}%`],
            ["Subtotal", draft.subtotal === null ? null : formatMoney(draft.subtotal)],
            ["TVA", draft.vatAmount === null ? null : formatMoney(draft.vatAmount)],
            ["Total document", draft.documentTotal === null ? null : formatMoney(draft.documentTotal)],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-rc-muted">
                {label}
              </dt>
              <dd className="text-[13.5px] text-rc-black">
                {value === null || value === "" ? (
                  <span className="text-rc-muted">Nu s-a citit</span>
                ) : (
                  value
                )}
              </dd>
            </div>
          ))}
          {/* EXT-28. CATE PAGINI ARE DOCUMENTUL, NUMARATE DE NOI LA INCARCARE.
              Aceasta este forma pe care un om o bate de mana, si fara numar el nu
              poate deosebi un aviz de o pagina de prima pagina din patru. Forma
              nu poarta _meta, deci numarul modelului nu exista aici niciodata;
              al nostru exista, fiindca vine din fisier. Eticheta spune de unde
              vine, ca nimeni sa nu il citeasca drept ce a citit extractorul.

              P3-72, CONSTATAREA F5: PROPOZITIA "FORMA NU POARTA _meta" ESTE
              ADEVARATA DESPRE CONTRACT SI FALSA DESPRE CE PRIMIM. Se pastreaza
              scrisa, in spiritul CLAUDE.md sectiunea 9c, fiindca randul de mai
              jos a fost asezat pe ea. Sectiunea 4.1a din contract enumera
              saisprezece campuri "si nimic altceva" si _meta nu este printre
              ele; ruta de callback insa refuza cu 400 NUMAI cheia `lines` pe o
              scanare esuata, si scrie `body._meta` verbatim orice ar sosi.
              Lista expeditorului, citita in
              docs/reports/2026-09-15-executor-orange-sample-count-notes-callback-keys.md,
              poarta _meta si pe forma de esec. Numarul modelului poate deci sa
              existe. De la acest card se arata, langa al nostru si cu eticheta
              lui, in blocul de diagnostic de pe randul ciornei. */}
          <div data-testid="review-unread-pages">
            <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-rc-muted">
              {EXTRACTION_META_LABEL.uploadPageCount}
            </dt>
            <dd className="text-[13.5px] text-rc-black">
              {draft.uploadPageCount === null ? (
                <span className="text-rc-muted">Nu s-au putut număra</span>
              ) : (
                draft.uploadPageCount
              )}
            </dd>
          </div>
        </dl>

        {draft.reason ? (
          <p className="mt-4 text-[12.5px] text-rc-muted max-w-[80ch]" data-testid="review-unread-reason">
            {draft.reason}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="px-5 py-5" data-testid="review-form">
      <p className="text-[12.5px] text-rc-muted mb-4 max-w-[80ch]">
        Valorile de mai jos sunt citite din document și sunt o sugestie. Ce salvezi este ce este pe
        ecran acum.
      </p>

      {/* P3-97, constatarea F9. PE TELEFON CELE SASE CONTROALE STAU UNUL SUB
          ALTUL, nu patru coloane intr-un ecran de 390px. Nu doua coloane, ca la
          liniile de mai jos: doua dintre ele sunt casute de data, al caror buton
          de calendar este singur o tinta de 44px, si nu incap la jumatate de
          latime. Peste 768px raman cele patru coloane de azi. */}
      <div className={`grid grid-cols-4 gap-3 ${PHONE_STACK}`}>
        <label className="text-[12.5px] text-rc-muted max-md:min-w-0">
          Furnizor
          <input
            data-testid="review-supplier"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            className={`mt-1 block w-full rounded-[9px] border border-rc-line px-2.5 py-1.5 text-[13px] text-rc-black ${PHONE_CONTROL}`}
          />
        </label>
        <label className="text-[12.5px] text-rc-muted max-md:min-w-0">
          Monedă
          <select
            data-testid="review-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={`mt-1 block w-full rounded-[9px] border border-rc-line px-2.5 py-1.5 text-[13px] text-rc-black ${PHONE_CONTROL}`}
          >
            <option value="MDL">MDL</option>
            <option value="EUR">EUR</option>
            <option value="RON">RON</option>
          </select>
        </label>
        <label className="text-[12.5px] text-rc-muted max-md:min-w-0">
          Data documentului
          <span className="mt-1 block">
            <DateField
              testId="review-ordered-at"
              value={orderedAt}
              onChange={setOrderedAt}
              onValidityChange={mark("orderedAt")}
              className="rounded-[9px] border-rc-line py-1.5 text-[13px]"
            />
          </span>
        </label>
        <label className="text-[12.5px] text-rc-muted max-md:min-w-0">
          Livrare estimată
          <span className="mt-1 block">
            <DateField
              testId="review-expected-at"
              value={expectedAt}
              onChange={setExpectedAt}
              onValidityChange={mark("expectedAt")}
              className="rounded-[9px] border-rc-line py-1.5 text-[13px]"
            />
          </span>
        </label>
        {/* EXT-11. DOUA CAMPURI SI NU UNUL. `TG 0009312` scris intr-un singur
            camp este doua fapte lipite la tastare, si nimic nu le mai poate
            dezlipi: un ecran care le vrea impreuna le poate alatura, unul care
            cauta dupa numar nu poate desface ce a fost concatenat. */}
        <label className="text-[12.5px] text-rc-muted max-md:min-w-0">
          Seria documentului
          <input
            data-testid="review-order-ref-series"
            value={orderRefSeries}
            onChange={(e) => setOrderRefSeries(e.target.value)}
            placeholder="TG"
            className={`mt-1 block w-full rounded-[9px] border border-rc-line px-2.5 py-1.5 text-[13px] text-rc-black ${PHONE_CONTROL}`}
          />
        </label>
        <label className="text-[12.5px] text-rc-muted max-md:min-w-0">
          Numărul documentului
          <input
            data-testid="review-order-ref"
            value={orderRef}
            onChange={(e) => setOrderRef(e.target.value)}
            placeholder="0009312"
            className={`mt-1 block w-full rounded-[9px] border border-rc-line px-2.5 py-1.5 text-[13px] text-rc-black ${PHONE_CONTROL}`}
          />
        </label>
      </div>

      {/* EXT-34. CE A MAI TRIMIS CITIREA DESPRE DOCUMENT, NUMAI CITIT. Nu se
          editeaza si nu se salveaza pe comanda: este acolo ca cineva care
          verifica hartia sa aiba si aceste doua repere. Randul lipseste cand
          niciunul nu a sosit, ca ecranul de reconciliere sa nu creasca degeaba. */}
      {draft.documentType || draft.clientRef ? (
        <p className="mt-3 flex flex-wrap gap-x-5 text-[12px] text-rc-muted" data-testid="review-inbound-document">
          {draft.documentType ? (
            <span data-testid="review-document-type">
              {EXTRACTION_INBOUND_LABEL.documentType}: <span className="text-rc-black">{draft.documentType}</span>
            </span>
          ) : null}
          {draft.clientRef ? (
            <span data-testid="review-client-ref">
              {EXTRACTION_INBOUND_LABEL.clientRef}: <span className="text-rc-black">{draft.clientRef}</span>
            </span>
          ) : null}
        </p>
      ) : null}

      {/* P3-97, constatarea F9. RANDUL UNEI POZITII: PE TELEFON DOUA COLOANE, ca
          la pozitiile comenzii manuale, care au aceeasi forma si au primit
          tratamentul in P3-65. Cele doua campuri late, numele de pe document si
          produsul din catalog, tin randul intreg; cantitatea si pretul, amandoua
          scurte, il impart. Cele doua coloane de 110px sunt exact ce nu incape:
          220px fixe dintr-un ecran de 390px lasau celorlalte doua cate vreo 70px.
          Peste 768px raman cele patru coloane de azi. */}
      <div className="mt-5 space-y-2.5">
        {lines.map((line, index) => (
          <div
            key={index}
            data-testid="review-line"
            data-index={String(index)}
            data-scan-read={scanRead ? "true" : "false"}
            className="grid grid-cols-[1fr_1fr_110px_110px] gap-2.5 items-end border-t border-rc-line pt-2.5 max-md:grid-cols-2"
          >
            {/* EXT-17. MARCAJUL STA PE LINIE, NU NUMAI PE PAGINA.
                Un banner in capul ecranului se citeste o data si apoi se
                deruleaza pe langa el. Linia este ce se uita cineva cand decide,
                deci aici sta propozitia.

                SE ARATA SI CAND DOCUMENTUL SE ADUNA CORECT, si acela este tot
                rostul cardului: reconcilierea a prins esecul observat NUMAI
                fiindca modelul citise corect totalurile si gresit liniile. Un set
                de linii fabricate care se intampla sa dea totalul tiparit trece
                de aritmetica. Nu trece de un om care stie ca se uita la o
                fotografie. */}
            {scanRead ? (
              <p
                className="col-span-4 max-md:col-span-2 text-[11.5px] text-rc-muted-2"
                data-testid={`review-line-scan-${index}`}
              >
                {SCAN_LINE_NOTICE}
              </p>
            ) : null}
            {/* P3-97, constatarea F9. Cele doua campuri late tin randul intreg
                pe telefon; cantitatea si pretul, amandoua scurte, il impart. */}
            <label className="text-[12px] text-rc-muted max-md:col-span-2 max-md:min-w-0">
              Nume pe document
              <input
                data-testid={`review-line-name-${index}`}
                value={line.productName}
                onChange={(e) => setLine(index, { productName: e.target.value })}
                className={`mt-1 block w-full rounded-[9px] border border-rc-line px-2.5 py-1.5 text-[13px] text-rc-black ${PHONE_CONTROL}`}
              />
            </label>
            <label className="text-[12px] text-rc-muted max-md:col-span-2 max-md:min-w-0">
              Produs din catalog
              <select
                data-testid={`review-line-product-${index}`}
                value={line.productId}
                onChange={(e) => setLine(index, { productId: e.target.value })}
                className={`mt-1 block w-full rounded-[9px] border border-rc-line px-2.5 py-1.5 text-[13px] text-rc-black ${PHONE_CONTROL}`}
              >
                <option value="">Produs nou, marcat pentru verificare</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} - {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px] text-rc-muted max-md:min-w-0">
              Cantitate
              <input
                data-testid={`review-line-quantity-${index}`}
                value={line.quantity}
                onChange={(e) => setLine(index, { quantity: e.target.value })}
                className={`mt-1 block w-full rounded-[9px] border border-rc-line px-2.5 py-1.5 text-[13px] text-rc-black ${PHONE_CONTROL}`}
              />
            </label>
            <label className="text-[12px] text-rc-muted max-md:min-w-0">
              Preț unitar
              <input
                data-testid={`review-line-price-${index}`}
                value={line.unitPrice}
                onChange={(e) => setLine(index, { unitPrice: e.target.value })}
                className={`mt-1 block w-full rounded-[9px] border border-rc-line px-2.5 py-1.5 text-[13px] text-rc-black ${PHONE_CONTROL}`}
              />
            </label>

            {/* EXT-34. CE A MAI TRIMIS CITIREA DESPRE LINIE, NUMAI CITIT, pe un
                rand mic sub campuri. Lipseste cand nu a sosit nimic. */}
            <InboundLineDetails line={draft.lines[index]} index={index} />

            {/* PRODUS NOU: categoria si unitatea se aleg, nu se ghicesc.
                Amandoua sunt obligatorii pe produs, iar o unitate gresita
                reinterpreteaza pentru totdeauna fiecare cantitate stocata pe
                el. Cuvintele documentului stau dedesubt, ca alegerea sa se faca
                uitandu-te la ce scria acolo. */}
            {line.productId === "" ? (
              <div
                className="col-span-4 max-md:col-span-2 grid grid-cols-[1fr_1fr] gap-2.5 max-md:grid-cols-1"
                data-testid={`review-line-new-${index}`}
              >
                <label className="text-[12px] text-rc-muted max-md:min-w-0">
                  Categorie pentru produsul nou
                  <select
                    data-testid={`review-line-category-${index}`}
                    value={line.categoryId}
                    onChange={(e) => setLine(index, { categoryId: e.target.value })}
                    className={`mt-1 block w-full rounded-[9px] border border-rc-line px-2.5 py-1.5 text-[13px] text-rc-black ${PHONE_CONTROL}`}
                  >
                    <option value="">Alege categoria</option>
                    {categories
                      .filter((c) => c.active)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                  {draft.lines[index]?.categoryRaw ? (
                    <span
                      className="mt-1 block text-[11.5px] text-rc-muted-2"
                      data-testid={`review-line-category-raw-${index}`}
                    >
                      Pe document: {draft.lines[index]!.categoryRaw}
                    </span>
                  ) : null}
                </label>

                <label className="text-[12px] text-rc-muted max-md:min-w-0">
                  Unitate pentru produsul nou
                  <select
                    data-testid={`review-line-unit-${index}`}
                    value={line.unit}
                    onChange={(e) => setLine(index, { unit: e.target.value })}
                    className={`mt-1 block w-full rounded-[9px] border border-rc-line px-2.5 py-1.5 text-[13px] text-rc-black ${PHONE_CONTROL}`}
                  >
                    <option value="">Alege unitatea</option>
                    {ALL_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {unitLabel(u)}
                      </option>
                    ))}
                  </select>
                  {draft.lines[index]?.unitRaw ? (
                    <span
                      className="mt-1 block text-[11.5px] text-rc-muted-2"
                      data-testid={`review-line-unit-raw-${index}`}
                    >
                      Pe document: {draft.lines[index]!.unitRaw}
                    </span>
                  ) : null}
                </label>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {error ? (
        <p
          role="alert"
          data-testid="review-error"
          className="mt-3 rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3 py-2 text-[12.5px] text-rc-black"
        >
          {error}
        </p>
      ) : null}

      {/* P3-97, constatarea F9. CELE DOUA BUTOANE STAU UNUL SUB ALTUL PE TELEFON,
          la fel ca butoanele blocului de renuntare de mai jos, care au primit
          acelasi tratament in P3-84. Butoanele poarta whitespace-nowrap din
          primitives, deci randul nu se rupe singur: masurat la 390px, Confirmă
          si creează comanda tine 250px din cei 284 ai fisei, iar Renunță pleca
          de la 293 si se termina la 383, adica in afara fisei. */}
      <div className="mt-5 flex items-center gap-2.5 max-md:flex-col max-md:items-stretch">
        <Button onClick={confirm} disabled={pending || dateInvalid} data-testid="review-confirm">
          {pending ? "Se confirmă..." : "Confirmă și creează comanda"}
        </Button>
        <Button variant="secondary" onClick={onDone} disabled={pending}>
          Renunță
        </Button>
      </div>
    </div>
  );
}

/** P3-84, constatarea F20. Pasul de confirmare al renuntarii, INAUNTRUL fisei
 *  documentului si nu o fereastra a browserului: fereastra nu poarta motivul,
 *  nu se poate citi de test si nu arata ca restul aplicatiei. Pe un ecran ingust
 *  campul si butoanele se aseaza unul sub altul. */
function CancelDraftBlock({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const router = useRouter();
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function confirm() {
    setPending(true);
    setError(null);
    const result = await cancelExtractionDraft(orderId, reason);
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div className="border-t border-rc-line bg-rc-paper px-5 py-4" data-testid="draft-cancel-block">
      <p className="text-[12.5px] text-rc-black max-w-[80ch]">
        Documentul dispare din listă, dar rămâne păstrat și poate fi găsit la Documente la care s-a
        renunțat.
      </p>
      <div className="mt-3 flex items-end gap-2.5 max-md:flex-col max-md:items-stretch">
        <label className="w-[420px] text-[12px] text-rc-muted max-md:w-full">
          Motiv (opțional)
          <input
            data-testid="draft-cancel-reason"
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 block w-full rounded-[9px] border border-rc-line px-2.5 py-1.5 text-[13px] text-rc-black max-md:text-[16px]"
          />
        </label>
        <div className="flex items-center gap-2 max-md:flex-col max-md:items-stretch">
          <Button size="sm" onClick={confirm} disabled={pending} data-testid="draft-cancel-confirm">
            {pending ? "Se renunță..." : "Da, renunț la document"}
          </Button>
          <Button size="sm" variant="secondary" onClick={onClose} disabled={pending} data-testid="draft-cancel-keep">
            Nu, păstrează
          </Button>
        </div>
      </div>
      {error ? (
        <p
          role="alert"
          data-testid="draft-cancel-error"
          className="mt-3 rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3 py-2 text-[12.5px] text-rc-black"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** P3-84, constatarea F20. Documentele la care s-a renuntat, INCHISE implicit
 *  sub coada. Nu au niciun buton: o renuntare nu se desface in acest card. */
function CancelledSection({ drafts }: { drafts: ExtractionDraft[] }) {
  if (drafts.length === 0) return null;
  return (
    <details className="border-t border-rc-line" data-testid="cancelled-section">
      <summary className="cursor-pointer px-5 py-3 text-[13px] font-semibold text-rc-black">
        Documente la care s-a renunțat ({drafts.length})
      </summary>
      <ul className="divide-y divide-rc-line border-t border-rc-line">
        {drafts.map((draft) => (
          <li
            key={draft.orderId}
            data-testid="cancelled-card"
            data-order-id={draft.orderId}
            className="flex items-start justify-between gap-4 px-5 py-3 max-md:flex-col max-md:gap-2"
          >
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-rc-black truncate">{draft.documentFilename}</p>
              <p className="text-[12.5px] text-rc-muted mt-0.5" data-testid="cancelled-meta">
                Încărcat la {formatDate(draft.uploadedAt ?? null)}. S-a renunțat la{" "}
                {formatDate(draft.cancelledAt ?? null)}, de{" "}
                <span data-testid="cancelled-by">{draft.cancelledBy ?? "un utilizator al cărui nume nu îl poți vedea"}</span>.
              </p>
              <p className="text-[12.5px] text-rc-muted mt-0.5" data-testid="cancelled-reason">
                {draft.cancelReason ? `Motiv: ${draft.cancelReason}` : "Fără motiv."}
              </p>
            </div>
            <div className="shrink-0">
              <Chip tone="neutral">Renunțat</Chip>
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function ExtractionReviewPanel({
  drafts,
  products,
  categories,
  cancelled = null,
  canCancel = false,
}: {
  drafts: ExtractionDraft[];
  products: CatalogProduct[];
  categories: Category[];
  /** P3-84. null cand 0056 nu este inca aplicata. */
  cancelled?: ExtractionDraft[] | null;
  /** P3-84. Numai proprietarul vede butonul "Renunță la document". */
  canCancel?: boolean;
}) {
  const router = useRouter();
  // P3-84. Fisa al carei pas de renuntare este deschis, cel mult una.
  const [cancelId, setCancelId] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [refiring, setRefiring] = React.useState<string | null>(null);
  // P3-93, constatarea F5. REFUZUL RETRIMITERII, PE FISA CARE L-A PRIMIT.
  // Numarul comenzii sta in stare alaturi de mesaj fiindca butonul este unul pe
  // fiecare fisa: un singur sir ar aseza motivul unui document sub altul.
  const [refireError, setRefireError] = React.useState<{ orderId: string; message: string } | null>(
    null,
  );
  // CRIT-16. Reusita traieste AICI, deasupra listei, nu inauntrul fisei.
  const [created, setCreated] = React.useState<{ reference: string; flagged: number } | null>(null);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setUploadError(null);
    // NUMELE RAMANE PE ECRAN si dupa ce campul nativ este golit mai jos: campul
    // se goleste ca acelasi fisier sa poata fi ales din nou, iar numele scris
    // ramane dovada a ce s-a trimis.
    setFileName(file?.name ?? null);
    if (!file) return;
    setPending(true);
    const formData = new FormData();
    formData.set("file", file);
    const result = await startExtraction(formData);
    setPending(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!result.ok) {
      setUploadError(result.message);
      // P3-85. Documentul este pastrat, dar citirea nu a pornit: mesajul ramane
      // pe ecran SI lista se reimprospateaza, ca fisa esuata sa apara sub el.
      if (result.saved) router.refresh();
      return;
    }
    router.refresh();
  }

  async function onRefire(orderId: string) {
    // Orice motiv ramas de la o apasare precedenta pleaca ACUM, si nu numai cel
    // al acestei fise: altfel motivul unui document ar sta pe ecran in timp ce
    // altul se retrimite.
    setRefireError(null);
    setRefiring(orderId);
    const result = await refireExtraction(orderId);
    setRefiring(null);
    if (!result.ok) {
      setRefireError({ orderId, message: result.message });
      // NU SE REIMPROSPATEAZA DUPA UN REFUZ, aceeasi disciplina ca onFile mai
      // sus (P3-85): patru dintre cele cinci refuzuri se intorc INAINTE de orice
      // scriere, deci o reimprospatare nu ar avea ce aduce, iar unul dintre ele
      // ("Documentul nu mai există.") ar scoate din lista chiar fisa sub care
      // tocmai s-a scris mesajul. Al cincilea, esecul trimiterii, scrie randul
      // si isi cheama singur revalidatePath inauntrul actiunii, iar motivul lui
      // este exact textul de mai sus, deci ajunge la operator oricum.
      return;
    }
    router.refresh();
  }

  const open = openId ? drafts.find((d) => d.orderId === openId) ?? null : null;

  return (
    <Card className="mb-4">
      <div className="border-b border-rc-line px-5 py-4">
        <p className="text-[13.5px] font-semibold text-rc-black">Citire automată din document</p>
        <p className="text-[12.5px] text-rc-muted mt-1 mb-3 max-w-[80ch]">
          Încarcă documentul furnizorului. Se citește automat, apoi verifici datele extrase și
          confirmi. PDF, PNG sau JPG, până în 10 MB.
        </p>
        <FilePicker
          inputRef={inputRef}
          accept={ACCEPT}
          onChange={onFile}
          disabled={pending}
          fileName={fileName}
          inputTestId="extraction-input"
          chooseTestId="extraction-choose"
          nameTestId="extraction-chosen"
        />
        {pending ? (
          <p className="mt-2.5 text-[12.5px] text-rc-muted" data-testid="extraction-pending">
            Se trimite spre citire...
          </p>
        ) : null}
        {uploadError ? (
          <p
            role="alert"
            data-testid="extraction-error"
            className="mt-2.5 rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3 py-2 text-[12.5px] text-rc-black"
          >
            {uploadError}
          </p>
        ) : null}
      </div>

      {created ? (
        <div
          className="border-b border-rc-line bg-rc-ok-soft px-5 py-4"
          data-testid="review-created"
          data-reference={created.reference}
        >
          <p className="text-[13.5px] font-bold text-rc-black">
            Comandă creată: {created.reference}
          </p>
          <p className="text-[12.5px] text-rc-muted mt-1" data-testid="review-flagged">
            {created.flagged === 0
              ? "Toate pozițiile s-au potrivit cu produse din catalog."
              : `${created.flagged} ${created.flagged === 1 ? "produs nou marcat" : "produse noi marcate"} pentru verificare în catalog.`}
          </p>
          <div className="mt-3 flex items-center gap-2.5">
            <Link href="/comenzi">
              <Button size="sm">Vezi comanda în listă</Button>
            </Link>
            <Button size="sm" variant="secondary" onClick={() => setCreated(null)} data-testid="review-created-dismiss">
              Închide
            </Button>
          </div>
        </div>
      ) : null}

      {drafts.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-rc-muted" data-testid="drafts-empty">
          Niciun document în așteptare.
        </p>
      ) : (
        <ul className="divide-y divide-rc-line">
          {drafts.map((draft) => {
            const label = stateLabel(draft);
            const isOpen = open?.orderId === draft.orderId;
            return (
              <li
                key={draft.orderId}
                data-testid="draft-card"
                data-order-id={draft.orderId}
                data-status={draft.status ?? "pending"}
                data-lines={String(draft.lines.length)}
              >
                <div className="flex items-start justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-rc-black truncate">
                      {draft.documentFilename}
                    </p>
                    {draft.supplierName ? (
                      <p className="text-[12.5px] text-rc-muted mt-0.5">{draft.supplierName}</p>
                    ) : null}

                    {draft.errorCode ? (
                      <p
                        className="text-[12.5px] text-rc-black mt-2"
                        data-testid="draft-error-sentence"
                        data-error-code={draft.errorCode}
                      >
                        {EXTRACTION_ERROR_LABEL[draft.errorCode]}
                      </p>
                    ) : null}
                    {draft.reason ? (
                      <p className="text-[12.5px] text-rc-muted mt-1" data-testid="draft-reason">
                        {draft.reason}
                      </p>
                    ) : null}
                    {draft.status === "partial" ? (
                      <p className="text-[12.5px] text-rc-muted mt-1" data-testid="draft-kept-lines">
                        {plural(draft.lines.length, "poziție citită", "poziții citite")} au fost
                        păstrate.
                      </p>
                    ) : null}
                    {/* P3-80, constatarea F6. De ce un document trimis ca citit
                        complet sta in Parțial: mutarea este a NOASTRA, si fara
                        aceasta propozitie operatorul ar cauta un motiv al
                        cititorului care nu exista. */}
                    {draft.derivedPartial === true ? (
                      <p className="text-[12.5px] text-rc-black mt-1" data-testid="draft-derived-partial">
                        {DERIVED_PARTIAL_NOTICE}
                      </p>
                    ) : null}
                    {/* P3-82, constatarea F17, hotararea R-208. Un aviz fara
                        preturi este acceptat; nota spune de unde vin preturile.
                        Derivata din liniile si totalurile stocate prin ACEEASI
                        conditie pe care o foloseste reconcilierea, deci nu poate
                        aparea pe un document refuzat si nu poate lipsi de pe unul
                        acceptat pe aceasta forma. */}
                    {quantitiesOnlyDraft(draft) ? (
                      <p className="text-[12.5px] text-rc-black mt-1" data-testid="draft-quantities-only">
                        {QUANTITIES_ONLY_NOTICE}
                      </p>
                    ) : null}
                    {/* P3-72, constatarea F5. Diagnosticul modelului, inchis. */}
                    <ExtractionMetaDetails draft={draft} />
                  </div>

                  {/* P3-84. max-md:flex-wrap: cu butonul de renuntare grupul
                      depaseste 390px pe telefon; peste 768px nimic nu se schimba. */}
                  <div className="flex items-center gap-2 shrink-0 max-md:shrink max-md:flex-wrap">
                    <Chip tone={label.tone}>{label.text}</Chip>
                    {draft.status === "extracted" || draft.status === "partial" ? (
                      <Button
                        size="sm"
                        data-testid="draft-review"
                        onClick={() => setOpenId(isOpen ? null : draft.orderId)}
                      >
                        {isOpen ? "Închide" : "Verifică"}
                      </Button>
                    ) : null}
                    {/* EXT-15. O SCANARE NECITITA NU AVEA NICIO CALE CATRE ANTETUL EI.
                        Un document `failed` arata pana acum eroarea si un buton de
                        retrimitere, si nimic altceva: furnizorul, numarul, data si
                        totalurile tiparite, care S-AU CITIT CORECT pe scanarea
                        observata, nu erau vizibile nicaieri.

                        Butonul se numeste "Vezi antetul" si NU "Verifica", fiindca
                        nu exista nimic de verificat si niciun formular in spatele
                        lui. Un buton numit ca celalalt ar promite o cale de
                        acceptare care nu exista si nu are voie sa existe. */}
                    {unreadScanDraft(draft) ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        data-testid="draft-header"
                        onClick={() => setOpenId(isOpen ? null : draft.orderId)}
                      >
                        {isOpen ? "Închide" : "Vezi antetul"}
                      </Button>
                    ) : null}
                    {draft.status === "failed" || draft.status === "partial" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        data-testid="draft-refire"
                        disabled={refiring === draft.orderId}
                        onClick={() => onRefire(draft.orderId)}
                      >
                        {refiring === draft.orderId ? "Se retrimite..." : "Retrimite"}
                      </Button>
                    ) : null}
                    {/* P3-84, constatarea F20. Pe orice stare, inclusiv "În lucru":
                        un document de test sau gresit nu trebuie sa astepte un
                        raspuns ca sa poata iesi din lista. "Renunță" din fisa de
                        verificare inchide fisa si nu are legatura cu acesta. */}
                    {canCancel ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        data-testid="draft-cancel"
                        onClick={() => setCancelId(cancelId === draft.orderId ? null : draft.orderId)}
                      >
                        Renunță la document
                      </Button>
                    ) : null}
                  </div>
                </div>

                {/* P3-93, constatarea F5. Motivul pentru care retrimiterea a
                    fost refuzata, sub randul cu butonul care a primit refuzul.
                    Aceeasi cutie rosie ca eroarea de incarcare si ca cea a
                    renuntarii; mx-5 fiindca aici nu mai suntem inauntrul
                    randului cu px-5. */}
                {refireError?.orderId === draft.orderId ? (
                  <p
                    role="alert"
                    data-testid="draft-refire-error"
                    className="mx-5 mb-4 rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3 py-2 text-[12.5px] text-rc-black"
                  >
                    {refireError.message}
                  </p>
                ) : null}

                {canCancel && cancelId === draft.orderId ? (
                  <CancelDraftBlock orderId={draft.orderId} onClose={() => setCancelId(null)} />
                ) : null}

                {isOpen && open ? (
                  <div className="border-t border-rc-line bg-rc-paper">
                    <ReviewForm
                      draft={open}
                      products={products}
                      categories={categories}
                      onDone={() => setOpenId(null)}
                      onCreated={(result) => {
                        // Fisa se inchide, ciorna dispare din lista fiindca a
                        // fost consumata, iar confirmarea ramane pe ecran.
                        setCreated(result);
                        setOpenId(null);
                      }}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {cancelled ? <CancelledSection drafts={cancelled} /> : null}
    </Card>
  );
}
