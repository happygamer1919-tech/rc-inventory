"use client";

// Tabelul de inventar. Marcajul este cel din faza 1, rand cu rand: aceleasi
// coloane, aceeasi ordine, aceleasi tokenuri, aceleasi texte. S-a schimbat
// numai de unde vin datele, plus randurile inactive si butoanele de scriere,
// care nu existau cand nu exista baza de date.

import * as React from "react";
import { Pager, useListUrl } from "@/components/ui/Pager";
import {
  Button,
  Card,
  Chip,
  Input,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import { PHONE_CELL, PHONE_CONTROL, PHONE_ROW, PHONE_TABLE } from "@/components/ui/phone";
import { formatMoney, formatNumber, formatQty, plural } from "@/lib/data/format";
import { unitLabel, type UnitCode } from "@/lib/data/units";
import type { CatalogProduct, Category } from "@/lib/data/products";
import { ProductPanel } from "./ProductPanel";
import { ProductForm } from "./ProductForm";
import { MaterialImportSheet, download, downloadMaterialTemplate } from "./MaterialImportSheet";
import { exportMaterials } from "@/lib/data/material-export-actions";
import { MATERIAL_EXPORT_FILE_NAME } from "@/lib/data/material-export-types";
import type { ProductFilter, StockLevel, Visibility } from "@/lib/data/product-filter";
import type { SupplierOption } from "@/lib/data/suppliers-types";
import type { SheetOption } from "@/lib/data/sheet-options-types";

const STOCK_LEVELS: Array<{ value: StockLevel; label: string }> = [
  { value: "toate", label: "Toate nivelurile" },
  { value: "redus", label: "Stoc redus" },
  { value: "epuizat", label: "Epuizat" },
  { value: "suficient", label: "Stoc suficient" },
];

// P3-64. PE TELEFON (sub 768px) FIECARE RAND DEVINE UN CARD, iar peste 768px
// nimic nu se schimba: fiecare clasa de mai jos poarta max-md. ACELASI DOM, nu o a
// doua lista ascunsa, fiindca spec-urile numara randurile dupa data-testid si o
// copie ar dubla fiecare numar pe desktop. Eticheta fiecarui camp este textul din
// antetul coloanei, pus pe celula in data-label si desenat din CSS, deci textul
// celulei ramane exact cel de azi.
//
// P3-100. Doua dintre cele patru nume scrise aici se departasera de fisierul comun
// si se rezolva diferit, fiindca sunt deosebiri de feluri diferite.
// (1) PHONE_TABLE avea p-3 acolo unde fisierul comun are p-4, fara niciun motiv
// scris: se ia valoarea comuna, deci pe telefon un card de produs are 16px de jur
// imprejur in loc de 12px, ca pe orice alta lista.
// (2) PHONE_CELL avea IN PLUS max-md:[&>span]:whitespace-normal, ca eticheta din
// casuta de stoc sa se rupa in loc sa fie tinuta pe un rand: clasa aceea trece pe
// cele sapte celule unde se foloseste, scrisa acolo si nu sub un nume nou, deci
// setul de clase desenat ramane exact cel de azi.

const VISIBILITY: Array<{ value: Visibility; label: string }> = [
  { value: "active", label: "Doar produse active" },
  { value: "toate", label: "Active și inactive" },
  { value: "inactive", label: "Doar produse inactive" },
];

export function InventoryScreen({
  products,
  filter,
  page,
  total,
  visibleTotal,
  catalogTotal,
  openProduct,
  categories,
  units,
  suppliers,
  canWrite,
  imagesActive,
  sheetOptions,
}: {
  /** P3-142. DOAR RANDURILE PAGINII DESCHISE, deja filtrate si ordonate de server. */
  products: CatalogProduct[];
  /** Filtrele din adresa, cu care s-a citit pagina. */
  filter: ProductFilter;
  page: number;
  /** Randurile listei cu toate filtrele, nu ale paginii. */
  total: number;
  /** Randurile dupa filtrul activ/inactiv singur. */
  visibleTotal: number;
  /** Tot catalogul, ca sa se poata spune "Catalogul este gol". */
  catalogTotal: number;
  /** Produsul numit de `?produs=<sku>`, citit separat: nu este neaparat pe pagina. */
  openProduct: CatalogProduct | null;
  categories: Category[];
  units: UnitCode[];
  suppliers: SupplierOption[];
  canWrite: boolean;
  /** P3-56: migratia 0045 este aplicata, deci formularul ofera campul de imagine. */
  imagesActive: boolean;
  /** P3-57: combinatiile de tabla Dasterum. Goala cat timp migratia 0046 lipseste. */
  sheetOptions: SheetOption[];
}) {
  // P3-10. FILTRUL DE FURNIZOR SI PRODUSUL DESCHIS VIN DIN URL, ca legaturile
  // din alte ecrane sa fie navigabile si partajabile. Cardul cere legaturi
  // reale catre rute reale, iar un filtru care traieste doar in starea
  // componentului nu este nici mers pe jos de un test, nici trimis cuiva.
  //
  // Restul filtrelor raman locale: nimic nu leaga catre ele si a le muta pe
  // toate in URL ar fi o redesenare a ecranului, care este scop pe care acest
  // card nu il are.
  //
  // P3-142. DE ACUM TOATE FILTRELE SI PAGINA SUNT IN URL: lista vine pe pagini de la server,
  // care are nevoie de ele ca sa aleaga randurile din tot catalogul si nu doar din pagina
  // deschisa. Ecranul tine local doar ce se tasteaza si ce tocmai s-a ales, pana vine
  // raspunsul serverului.
  const { params, setFilter, setPage } = useListUrl();
  const skuFromUrl = params.get("produs") ?? "";
  // Un sku din URL deschide panoul produsului la prima randare. Un sku care nu
  // exista nu deschide nimic si nu este o eroare: legatura poate fi veche.
  const productFromUrl = skuFromUrl && openProduct?.sku === skuFromUrl ? openProduct : null;
  // P3-42. camp=prag vine de pe ecranul de memento si deschide direct fisa
  // produsului, cu pragul in focus. ESTE ACELASI FORMULAR, deci aceeasi scriere,
  // updateProduct; legatura doar scurteaza drumul. Fara drept de scriere nu
  // deschide formularul, ci panoul de citire, exact ca produs= singur: o adresa
  // scrisa de mana nu poate da mai mult decat butonul Modifica.
  const editFromUrl = canWrite && productFromUrl !== null && params.get("camp") === "prag";

  const [q, setQ] = React.useState(filter.q);
  const [category, setCategory] = React.useState(filter.category);
  const [supplier, setSupplier] = React.useState(filter.supplier);
  const [level, setLevel] = React.useState<StockLevel>(filter.level);
  const [visibility, setVisibility] = React.useState<Visibility>(filter.visibility);

  // Alegerile din liste se aliniaza la adresa cand ea se schimba din alta parte (butonul
  // inapoi al browserului, o legatura).
  React.useEffect(() => setCategory(filter.category), [filter.category]);
  React.useEffect(() => setSupplier(filter.supplier), [filter.supplier]);
  React.useEffect(() => setLevel(filter.level), [filter.level]);
  React.useEffect(() => setVisibility(filter.visibility), [filter.visibility]);

  // CAUTAREA SE TRIMITE LA SERVER DUPA O PAUZA din tastat (300 ms), nu la fiecare litera.
  // Adresa se copiaza inapoi in camp numai cand operatorul nu a tastat nimic nou de la ultima
  // trimitere: un raspuns intarziat nu sterge literele tastate intre timp, iar butonul inapoi
  // al browserului (adresa se schimba, campul a ramas pe ultima trimitere) il aduce la zi.
  const lastSent = React.useRef(filter.q);
  React.useEffect(() => {
    if (q.trim() === filter.q.trim()) return;
    const timer = setTimeout(() => {
      lastSent.current = q.trim();
      setFilter({ q: q.trim() });
    }, 300);
    return () => clearTimeout(timer);
  }, [q, filter.q, setFilter]);
  React.useEffect(() => {
    setQ((current) => (current.trim() === lastSent.current ? filter.q : current));
    lastSent.current = filter.q;
  }, [filter.q]);

  const [openId, setOpenId] = React.useState<string | null>(
    editFromUrl ? null : (productFromUrl?.id ?? null),
  );
  const [editing, setEditing] = React.useState<CatalogProduct | null>(
    editFromUrl ? productFromUrl : null,
  );
  const [focusThreshold, setFocusThreshold] = React.useState(editFromUrl);
  const [creating, setCreating] = React.useState(false);
  // P3-125. Importul de produse este un panou al ecranului, langa Adaugă produs.
  const [importing, setImporting] = React.useState(false);
  // P3-129. Exportul scrie vederea curenta; propozitia de dupa el (fisier taiat) si refuzul
  // stau sub filtre.
  const [exporting, setExporting] = React.useState(false);
  const [exportNotice, setExportNotice] = React.useState<string | null>(null);
  const [exportError, setExportError] = React.useState<string | null>(null);

  async function runExport() {
    setExporting(true);
    setExportNotice(null);
    setExportError(null);
    try {
      // Exportul ia ce arata comenzile de filtrare in clipa apasarii (starea locala, care poate
      // fi cu o clipa inaintea listei, pana vine raspunsul serverului) si scrie TOATE randurile
      // filtrului, nu pagina deschisa.
      const result = await exportMaterials({ q, category, supplier, level, visibility });
      if (!result.ok) {
        setExportError(result.message);
        return;
      }
      download(result.value.csv, MATERIAL_EXPORT_FILE_NAME);
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

  // P3-129. Alegerea randurilor sta pe server, in lib/data/products.ts (listProductsPage), cu
  // aceleasi filtre ca exportul. Ecranul arata exact randurile primite.
  const rows = products;

  const filtersActive =
    filter.q !== "" ||
    filter.category !== "" ||
    filter.supplier !== "" ||
    filter.level !== "toate" ||
    filter.visibility !== "active";
  const open = openId
    ? (products.find((p) => p.id === openId) ?? (openProduct?.id === openId ? openProduct : null))
    : null;

  function reset() {
    setQ("");
    lastSent.current = "";
    setCategory("");
    setSupplier("");
    setLevel("toate");
    setVisibility("active");
    setFilter({ q: null, categorie: null, furnizor: null, nivel: null, vizibilitate: null });
  }

  return (
    <>
      <PageHeader
        title="Inventar"
        lead="Toate produsele din depozitul central. Apasă pe un rând pentru loturile și mișcările produsului."
        actions={
          <div className="flex items-center gap-2 max-md:flex-col max-md:items-end">
            {filtersActive ? (
              <Button variant="secondary" onClick={reset} className="max-md:min-h-11">
                Șterge filtrele
              </Button>
            ) : null}
            {canWrite ? (
              <>
                <button
                  type="button"
                  onClick={downloadMaterialTemplate}
                  data-testid="products-import-template"
                  className="text-[13px] font-semibold text-rc-black underline underline-offset-2 hover:text-rc-orange max-md:min-h-11"
                >
                  Descarcă modelul de import
                </button>
                <Button
                  variant="secondary"
                  onClick={() => setImporting(true)}
                  data-testid="products-import"
                  className="max-md:min-h-11"
                >
                  Importă din CSV
                </Button>
                {/* P3-129. Exporta vederea de acum, cu toate filtrele, toate randurile. */}
                <Button
                  variant="secondary"
                  onClick={runExport}
                  disabled={exporting}
                  data-testid="products-export"
                  className="max-md:min-h-11"
                >
                  Exportă CSV
                </Button>
                <Button
                  onClick={() => setCreating(true)}
                  data-testid="product-new"
                  className="max-md:min-h-11"
                >
                  Adaugă produs
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      <Card className="mb-4">
        <div className="p-4 grid grid-cols-[1.6fr_1fr_1.3fr_1fr_1.1fr] gap-3 max-md:grid-cols-1">
          <Input
            placeholder="Caută după denumire sau cod SKU"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="product-search"
            className={PHONE_CONTROL}
          />
          <Select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setFilter({ categorie: e.target.value });
            }}
            data-testid="filter-category"
            className={PHONE_CONTROL}
          >
            <option value="">Toate categoriile</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            value={supplier}
            onChange={(e) => {
              setSupplier(e.target.value);
              setFilter({ furnizor: e.target.value });
            }}
            data-testid="filter-supplier"
            className={PHONE_CONTROL}
          >
            <option value="">Toți furnizorii</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select
            value={level}
            onChange={(e) => {
              const next = e.target.value as StockLevel;
              setLevel(next);
              setFilter({ nivel: next === "toate" ? null : next });
            }}
            data-testid="filter-level"
            className={PHONE_CONTROL}
          >
            {STOCK_LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </Select>
          <Select
            value={visibility}
            onChange={(e) => {
              const next = e.target.value as Visibility;
              setVisibility(next);
              setFilter({ vizibilitate: next === "active" ? null : next });
            }}
            data-testid="filter-visibility"
            className={PHONE_CONTROL}
          >
            {VISIBILITY.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </Select>
        </div>
        {exportNotice ? (
          <p
            role="status"
            data-testid="products-export-notice"
            className="mx-4 mb-3 rounded-[10px] border border-rc-ok/25 bg-rc-ok-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
          >
            {exportNotice}
          </p>
        ) : null}
        {exportError ? (
          <p
            role="alert"
            data-testid="products-export-error"
            className="mx-4 mb-3 rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
          >
            {exportError}
          </p>
        ) : null}
        <div className="px-4 pb-3 -mt-1">
          <p className="text-[12.5px] text-rc-muted" data-testid="product-count">
            {/* P3-51. Substantivul se acorda cu primul numar afisat: "1 produs din 42". */}
            {total === visibleTotal
              ? plural(total, "produs", "produse")
              : `${plural(total, "produs", "produse")} din ${formatNumber(visibleTotal)}`}
          </p>
        </div>
      </Card>

      <Card className={PHONE_TABLE}>
        <Table>
          <thead>
            <tr>
              <Th>SKU</Th>
              <Th>Denumire</Th>
              <Th>Categorie</Th>
              <Th>Furnizor</Th>
              <Th align="right">Stoc</Th>
              <Th align="right">Prag</Th>
              <Th align="right">Valoare</Th>
            </tr>
          </thead>
          <tbody data-testid="product-rows">
            {rows.map((p) => {
              const low = p.stock <= p.threshold;
              const empty = p.stock === 0;
              return (
                <tr
                  key={p.id}
                  onClick={() => setOpenId(p.id)}
                  data-testid="product-row"
                  data-sku={p.sku}
                  data-name={p.name}
                  data-needs-review={String(p.needsReview)}
                  className={[
                    "cursor-pointer transition-colors",
                    PHONE_ROW,
                    !p.active
                      ? "opacity-60 hover:bg-rc-paper"
                      : empty
                        ? "bg-rc-danger-soft/60 hover:bg-rc-danger-soft"
                        : low
                          ? "bg-rc-warn-soft/50 hover:bg-rc-warn-soft"
                          : "hover:bg-rc-paper",
                  ].join(" ")}
                >
                  <Td data-label="SKU" className={`${PHONE_CELL} max-md:[&>span]:whitespace-normal`}>
                    <span className="rc-num text-[12.5px] font-semibold text-rc-muted whitespace-nowrap">
                      {p.sku}
                    </span>
                  </Td>
                  {/* Pe telefon denumirea deschide cardul, pe tot randul lui. */}
                  <Td
                    data-label="Denumire"
                    className={`${PHONE_CELL} max-md:[&>span]:whitespace-normal max-md:order-first max-md:col-span-2`}
                  >
                    <span className="text-[13.5px] font-medium text-rc-black">{p.name}</span>
                    {!p.active ? (
                      <span className="ml-2 align-middle">
                        <Chip tone="danger">Inactiv</Chip>
                      </span>
                    ) : null}
                    {p.needsReview ? (
                      <span className="ml-2 align-middle">
                        <Chip tone="orange">De verificat</Chip>
                      </span>
                    ) : null}
                  </Td>
                  <Td data-label="Categorie" className={`${PHONE_CELL} max-md:[&>span]:whitespace-normal`}>
                    <span className="text-[12.5px] text-rc-muted whitespace-nowrap">
                      {p.category}
                    </span>
                  </Td>
                  <Td data-label="Furnizor" className={`${PHONE_CELL} max-md:[&>span]:whitespace-normal`}>
                    <span className="text-[12.5px] text-rc-muted">{p.supplierName ?? "-"}</span>
                  </Td>
                  <Td align="right" data-label="Stoc" className={`${PHONE_CELL} max-md:[&>span]:whitespace-normal`}>
                    {empty ? (
                      <Chip tone="danger">Epuizat</Chip>
                    ) : (
                      <span
                        className={[
                          "rc-num text-[13.5px] font-semibold whitespace-nowrap",
                          low ? "text-rc-warn" : "text-rc-black",
                        ].join(" ")}
                      >
                        {formatQty(p.stock, p.unit)}
                      </span>
                    )}
                  </Td>
                  <Td align="right" data-label="Prag" className={`${PHONE_CELL} max-md:[&>span]:whitespace-normal`}>
                    <span className="rc-num text-[13px] text-rc-muted whitespace-nowrap">
                      {formatNumber(p.threshold)} {unitLabel(p.unit)}
                    </span>
                  </Td>
                  <Td align="right" data-label="Valoare" className={`${PHONE_CELL} max-md:[&>span]:whitespace-normal`}>
                    <span className="rc-num text-[13px] text-rc-black whitespace-nowrap">
                      {formatMoney(p.stock * p.unitValueMdl)}
                    </span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        {rows.length === 0 ? (
          <div className="px-6 py-14 text-center" data-testid="product-empty">
            {catalogTotal === 0 ? (
              <>
                <p className="text-[14px] font-semibold text-rc-black">
                  Catalogul este gol
                </p>
                <p className="text-[13px] text-rc-muted mt-1.5">
                  {canWrite
                    ? "Adaugă primul produs ca să pornească inventarul."
                    : "Administratorul nu a adăugat încă niciun produs."}
                </p>
              </>
            ) : (
              <>
                <p className="text-[14px] font-semibold text-rc-black">
                  Niciun produs nu se potrivește
                </p>
                <p className="text-[13px] text-rc-muted mt-1.5">
                  Schimbă filtrele sau șterge-le pentru a vedea tot catalogul.
                </p>
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={reset}
                    className="max-md:min-h-11"
                  >
                    Șterge filtrele
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : null}
        <Pager page={page} total={total} onPage={setPage} />
      </Card>

      {open ? (
        <ProductPanel
          product={open}
          canWrite={canWrite}
          onClose={() => setOpenId(null)}
          onEdit={() => {
            setEditing(open);
            setOpenId(null);
          }}
        />
      ) : null}

      {creating ? (
        <ProductForm
          categories={categories}
          units={units}
          suppliers={suppliers}
          imagesActive={imagesActive}
          sheetOptions={sheetOptions}
          onClose={() => setCreating(false)}
        />
      ) : null}

      {importing ? <MaterialImportSheet onClose={() => setImporting(false)} /> : null}

      {editing ? (
        <ProductForm
          product={editing}
          categories={categories}
          units={units}
          suppliers={suppliers}
          imagesActive={imagesActive}
          sheetOptions={sheetOptions}
          focusField={focusThreshold ? "threshold" : undefined}
          onClose={() => {
            setEditing(null);
            setFocusThreshold(false);
          }}
        />
      ) : null}
    </>
  );
}
