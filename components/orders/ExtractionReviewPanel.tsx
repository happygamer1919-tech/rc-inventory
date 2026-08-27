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

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Chip } from "@/components/ui/primitives";
import { EXTRACTION_ERROR_LABEL } from "@/lib/data/extraction-types";
import { ALL_UNITS, unitLabel } from "@/lib/data/units";
import type { ExtractionDraft } from "@/lib/data/extraction-types";
import type { CatalogProduct, Category } from "@/lib/data/products";
import {
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
  const [expectedAt, setExpectedAt] = React.useState("");
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

  return (
    <div className="px-5 py-5" data-testid="review-form">
      <p className="text-[12.5px] text-rc-muted mb-4 max-w-[80ch]">
        Valorile de mai jos sunt citite din document și sunt o sugestie. Ce salvezi este ce este pe
        ecran acum.
      </p>

      <div className="grid grid-cols-4 gap-3">
        <label className="text-[12.5px] text-rc-muted">
          Furnizor
          <input
            data-testid="review-supplier"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            className="mt-1 block w-full rounded-[9px] border border-rc-line px-2.5 py-1.5 text-[13px] text-rc-black"
          />
        </label>
        <label className="text-[12.5px] text-rc-muted">
          Monedă
          <select
            data-testid="review-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="mt-1 block w-full rounded-[9px] border border-rc-line px-2.5 py-1.5 text-[13px] text-rc-black"
          >
            <option value="MDL">MDL</option>
            <option value="EUR">EUR</option>
            <option value="RON">RON</option>
          </select>
        </label>
        <label className="text-[12.5px] text-rc-muted">
          Data documentului
          <input
            type="date"
            data-testid="review-ordered-at"
            value={orderedAt}
            onChange={(e) => setOrderedAt(e.target.value)}
            className="mt-1 block w-full rounded-[9px] border border-rc-line px-2.5 py-1.5 text-[13px] text-rc-black"
          />
        </label>
        <label className="text-[12.5px] text-rc-muted">
          Livrare estimată
          <input
            type="date"
            data-testid="review-expected-at"
            value={expectedAt}
            onChange={(e) => setExpectedAt(e.target.value)}
            className="mt-1 block w-full rounded-[9px] border border-rc-line px-2.5 py-1.5 text-[13px] text-rc-black"
          />
        </label>
      </div>

      <div className="mt-5 space-y-2.5">
        {lines.map((line, index) => (
          <div
            key={index}
            data-testid="review-line"
            data-index={String(index)}
            className="grid grid-cols-[1fr_1fr_110px_110px] gap-2.5 items-end border-t border-rc-line pt-2.5"
          >
            <label className="text-[12px] text-rc-muted">
              Nume pe document
              <input
                data-testid={`review-line-name-${index}`}
                value={line.productName}
                onChange={(e) => setLine(index, { productName: e.target.value })}
                className="mt-1 block w-full rounded-[9px] border border-rc-line px-2.5 py-1.5 text-[13px] text-rc-black"
              />
            </label>
            <label className="text-[12px] text-rc-muted">
              Produs din catalog
              <select
                data-testid={`review-line-product-${index}`}
                value={line.productId}
                onChange={(e) => setLine(index, { productId: e.target.value })}
                className="mt-1 block w-full rounded-[9px] border border-rc-line px-2.5 py-1.5 text-[13px] text-rc-black"
              >
                <option value="">Produs nou, marcat pentru verificare</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} - {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px] text-rc-muted">
              Cantitate
              <input
                data-testid={`review-line-quantity-${index}`}
                value={line.quantity}
                onChange={(e) => setLine(index, { quantity: e.target.value })}
                className="mt-1 block w-full rounded-[9px] border border-rc-line px-2.5 py-1.5 text-[13px] text-rc-black"
              />
            </label>
            <label className="text-[12px] text-rc-muted">
              Preț unitar
              <input
                data-testid={`review-line-price-${index}`}
                value={line.unitPrice}
                onChange={(e) => setLine(index, { unitPrice: e.target.value })}
                className="mt-1 block w-full rounded-[9px] border border-rc-line px-2.5 py-1.5 text-[13px] text-rc-black"
              />
            </label>

            {/* PRODUS NOU: categoria si unitatea se aleg, nu se ghicesc.
                Amandoua sunt obligatorii pe produs, iar o unitate gresita
                reinterpreteaza pentru totdeauna fiecare cantitate stocata pe
                el. Cuvintele documentului stau dedesubt, ca alegerea sa se faca
                uitandu-te la ce scria acolo. */}
            {line.productId === "" ? (
              <div
                className="col-span-4 grid grid-cols-[1fr_1fr] gap-2.5"
                data-testid={`review-line-new-${index}`}
              >
                <label className="text-[12px] text-rc-muted">
                  Categorie pentru produsul nou
                  <select
                    data-testid={`review-line-category-${index}`}
                    value={line.categoryId}
                    onChange={(e) => setLine(index, { categoryId: e.target.value })}
                    className="mt-1 block w-full rounded-[9px] border border-rc-line px-2.5 py-1.5 text-[13px] text-rc-black"
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

                <label className="text-[12px] text-rc-muted">
                  Unitate pentru produsul nou
                  <select
                    data-testid={`review-line-unit-${index}`}
                    value={line.unit}
                    onChange={(e) => setLine(index, { unit: e.target.value })}
                    className="mt-1 block w-full rounded-[9px] border border-rc-line px-2.5 py-1.5 text-[13px] text-rc-black"
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

      <div className="mt-5 flex items-center gap-2.5">
        <Button onClick={confirm} disabled={pending} data-testid="review-confirm">
          {pending ? "Se confirmă..." : "Confirmă și creează comanda"}
        </Button>
        <Button variant="secondary" onClick={onDone} disabled={pending}>
          Renunță
        </Button>
      </div>
    </div>
  );
}

export function ExtractionReviewPanel({
  drafts,
  products,
  categories,
}: {
  drafts: ExtractionDraft[];
  products: CatalogProduct[];
  categories: Category[];
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [refiring, setRefiring] = React.useState<string | null>(null);
  // CRIT-16. Reusita traieste AICI, deasupra listei, nu inauntrul fisei.
  const [created, setCreated] = React.useState<{ reference: string; flagged: number } | null>(null);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setUploadError(null);
    if (!file) return;
    setPending(true);
    const formData = new FormData();
    formData.set("file", file);
    const result = await startExtraction(formData);
    setPending(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!result.ok) {
      setUploadError(result.message);
      return;
    }
    router.refresh();
  }

  async function onRefire(orderId: string) {
    setRefiring(orderId);
    await refireExtraction(orderId);
    setRefiring(null);
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
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={onFile}
          disabled={pending}
          data-testid="extraction-input"
          className="block w-full text-[13px] text-rc-muted file:mr-3 file:rounded-[9px] file:border-0 file:bg-rc-orange file:px-3.5 file:py-2 file:text-[13px] file:font-semibold file:text-white hover:file:bg-rc-orange-dark disabled:opacity-60"
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
                        {draft.lines.length}{" "}
                        {draft.lines.length === 1 ? "poziție citită" : "poziții citite"} au fost
                        păstrate.
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
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
                  </div>
                </div>

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
    </Card>
  );
}
