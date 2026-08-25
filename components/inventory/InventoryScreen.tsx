"use client";

// Tabelul de inventar. Marcajul este cel din faza 1, rand cu rand: aceleasi
// coloane, aceeasi ordine, aceleasi tokenuri, aceleasi texte. S-a schimbat
// numai de unde vin datele, plus randurile inactive si butoanele de scriere,
// care nu existau cand nu exista baza de date.

import * as React from "react";
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
import { formatMoney, formatNumber, formatQty, normalizeText } from "@/lib/data/format";
import { unitLabel, type UnitCode } from "@/lib/data/units";
import type { CatalogProduct, Category } from "@/lib/data/products";
import { ProductPanel } from "./ProductPanel";
import { ProductForm } from "./ProductForm";

type StockLevel = "toate" | "redus" | "epuizat" | "suficient";

const STOCK_LEVELS: Array<{ value: StockLevel; label: string }> = [
  { value: "toate", label: "Toate nivelurile" },
  { value: "redus", label: "Stoc redus" },
  { value: "epuizat", label: "Epuizat" },
  { value: "suficient", label: "Stoc suficient" },
];

type Visibility = "active" | "toate" | "inactive";

const VISIBILITY: Array<{ value: Visibility; label: string }> = [
  { value: "active", label: "Doar produse active" },
  { value: "toate", label: "Active și inactive" },
  { value: "inactive", label: "Doar produse inactive" },
];

export function InventoryScreen({
  products,
  categories,
  units,
  suppliers,
  canWrite,
}: {
  products: CatalogProduct[];
  categories: Category[];
  units: UnitCode[];
  suppliers: string[];
  canWrite: boolean;
}) {
  const [q, setQ] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [supplier, setSupplier] = React.useState("");
  const [level, setLevel] = React.useState<StockLevel>("toate");
  const [visibility, setVisibility] = React.useState<Visibility>("active");
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<CatalogProduct | null>(null);
  const [creating, setCreating] = React.useState(false);

  const visible = React.useMemo(
    () =>
      products.filter((p) =>
        visibility === "active" ? p.active : visibility === "inactive" ? !p.active : true,
      ),
    [products, visibility],
  );

  const rows = React.useMemo(() => {
    const needle = normalizeText(q.trim());
    return visible.filter((p) => {
      if (
        needle &&
        !normalizeText(p.name).includes(needle) &&
        !normalizeText(p.sku).includes(needle)
      )
        return false;
      if (category && p.categoryId !== category) return false;
      if (supplier && (p.supplierName ?? "") !== supplier) return false;
      const low = p.stock <= p.threshold;
      if (level === "redus" && !(low && p.stock > 0)) return false;
      if (level === "epuizat" && p.stock !== 0) return false;
      if (level === "suficient" && low) return false;
      return true;
    });
  }, [visible, q, category, supplier, level]);

  const filtersActive =
    q !== "" || category !== "" || supplier !== "" || level !== "toate" || visibility !== "active";
  const open = openId ? products.find((p) => p.id === openId) ?? null : null;

  function reset() {
    setQ("");
    setCategory("");
    setSupplier("");
    setLevel("toate");
    setVisibility("active");
  }

  return (
    <>
      <PageHeader
        title="Inventar"
        lead="Toate produsele din depozitul central. Apasă pe un rând pentru loturile și mișcările produsului."
        actions={
          <div className="flex items-center gap-2">
            {filtersActive ? (
              <Button variant="secondary" onClick={reset}>
                Șterge filtrele
              </Button>
            ) : null}
            {canWrite ? (
              <Button onClick={() => setCreating(true)} data-testid="product-new">
                Adaugă produs
              </Button>
            ) : null}
          </div>
        }
      />

      <Card className="mb-4">
        <div className="p-4 grid grid-cols-[1.6fr_1fr_1.3fr_1fr_1.1fr] gap-3">
          <Input
            placeholder="Caută după denumire sau cod SKU"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="product-search"
          />
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            data-testid="filter-category"
          >
            <option value="">Toate categoriile</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
            <option value="">Toți furnizorii</option>
            {suppliers.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Select value={level} onChange={(e) => setLevel(e.target.value as StockLevel)}>
            {STOCK_LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </Select>
          <Select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as Visibility)}
            data-testid="filter-visibility"
          >
            {VISIBILITY.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="px-4 pb-3 -mt-1">
          <p className="text-[12.5px] text-rc-muted" data-testid="product-count">
            {rows.length === visible.length
              ? `${rows.length} produse`
              : `${rows.length} din ${visible.length} produse`}
          </p>
        </div>
      </Card>

      <Card>
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
                  className={[
                    "cursor-pointer transition-colors",
                    !p.active
                      ? "opacity-60 hover:bg-rc-paper"
                      : empty
                        ? "bg-rc-danger-soft/60 hover:bg-rc-danger-soft"
                        : low
                          ? "bg-rc-warn-soft/50 hover:bg-rc-warn-soft"
                          : "hover:bg-rc-paper",
                  ].join(" ")}
                >
                  <Td>
                    <span className="rc-num text-[12.5px] font-semibold text-rc-muted whitespace-nowrap">
                      {p.sku}
                    </span>
                  </Td>
                  <Td>
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
                  <Td>
                    <span className="text-[12.5px] text-rc-muted whitespace-nowrap">
                      {p.category}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-[12.5px] text-rc-muted">{p.supplierName ?? "-"}</span>
                  </Td>
                  <Td align="right">
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
                  <Td align="right">
                    <span className="rc-num text-[13px] text-rc-muted whitespace-nowrap">
                      {formatNumber(p.threshold)} {unitLabel(p.unit)}
                    </span>
                  </Td>
                  <Td align="right">
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
            {products.length === 0 ? (
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
                  <Button variant="secondary" size="sm" onClick={reset}>
                    Șterge filtrele
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : null}
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
          onClose={() => setCreating(false)}
        />
      ) : null}

      {editing ? (
        <ProductForm
          product={editing}
          categories={categories}
          units={units}
          suppliers={suppliers}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}
