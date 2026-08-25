"use client";

// Formularul de produs, pentru adaugare si modificare. Acelasi panou lateral ca
// detaliul, ca sa nu apara un al doilea limbaj vizual in aceeasi pagina.
//
// Erorile sunt romanesti si se aseaza pe campul vinovat. Un mesaj brut de
// Postgres pe ecran este un defect: "duplicate key value violates unique
// constraint products_sku_unique" devine "Există deja un produs cu acest cod SKU."

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Select } from "@/components/ui/primitives";
import { unitLabel, type UnitCode } from "@/lib/data/units";
import type { CatalogProduct, Category } from "@/lib/data/products";
import { createProduct, updateProduct } from "@/lib/data/product-actions";

export function ProductForm({
  product,
  categories,
  units,
  suppliers,
  onClose,
}: {
  product?: CatalogProduct;
  categories: Category[];
  units: UnitCode[];
  suppliers: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const editing = product !== undefined;

  const [sku, setSku] = React.useState(product?.sku ?? "");
  const [name, setName] = React.useState(product?.name ?? "");
  const [categoryId, setCategoryId] = React.useState(
    product?.categoryId ?? categories[0]?.id ?? "",
  );
  const [unit, setUnit] = React.useState<string>(product?.unit ?? units[0] ?? "pcs");
  const [threshold, setThreshold] = React.useState(String(product?.threshold ?? 0));
  const [unitValue, setUnitValue] = React.useState(String(product?.unitValueMdl ?? 0));
  const [supplierName, setSupplierName] = React.useState(product?.supplierName ?? "");

  const [error, setError] = React.useState<string | null>(null);
  const [errorField, setErrorField] = React.useState<string | undefined>(undefined);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const noCategories = categories.length === 0;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setErrorField(undefined);
    setPending(true);

    const input = {
      sku,
      name,
      categoryId,
      unit,
      threshold,
      unitValueMdl: unitValue,
      supplierName,
    };
    const result = editing ? await updateProduct(product.id, input) : await createProduct(input);

    if (!result.ok) {
      setError(result.message);
      setErrorField(result.field);
      setPending(false);
      return;
    }
    router.refresh();
    onClose();
  }

  const fieldClass = (field: string) =>
    errorField === field ? "border-rc-danger" : undefined;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <aside
        className="relative w-[520px] h-full bg-rc-white text-rc-black overflow-y-auto shadow-2xl"
        data-testid="product-form"
      >
        <div className="sticky top-0 bg-rc-white text-rc-black border-b border-rc-line px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-bold text-rc-black leading-snug">
              {editing ? "Modifică produsul" : "Adaugă produs"}
            </h2>
            <p className="text-[12.5px] text-rc-muted mt-1">
              {editing
                ? "Unitatea se blochează după prima mișcare a produsului."
                : "Unitatea de măsură se fixează acum și nu se mai schimbă după prima mișcare."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className="shrink-0 w-8 h-8 rounded-[9px] text-rc-muted hover:bg-rc-paper hover:text-rc-black transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} noValidate className="px-6 py-5">
          {noCategories ? (
            <p className="mb-4 rounded-[10px] border border-rc-warn bg-rc-warn-soft px-3.5 py-2.5 text-[12.5px] text-rc-black">
              Nu există nicio categorie. Adaugă una în Setări înainte de a crea un produs.
            </p>
          ) : null}

          <Field label="Cod SKU">
            <Input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="RC-0001"
              className={fieldClass("sku")}
              data-testid="field-sku"
            />
          </Field>

          <Field label="Denumire">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Țiglă metalică"
              className={fieldClass("name")}
              data-testid="field-name"
            />
          </Field>

          <Field label="Categorie">
            <Select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={fieldClass("categoryId")}
              data-testid="field-category"
            >
              <option value="">Alege categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Unitate de măsură">
            <Select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className={fieldClass("unit")}
              data-testid="field-unit"
            >
              {units.map((u) => (
                <option key={u} value={u}>
                  {unitLabel(u)}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Prag recomandă">
              <Input
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                inputMode="decimal"
                className={fieldClass("threshold")}
                data-testid="field-threshold"
              />
            </Field>
            <Field label="Valoare unitară (MDL)">
              <Input
                value={unitValue}
                onChange={(e) => setUnitValue(e.target.value)}
                inputMode="decimal"
                className={fieldClass("unitValueMdl")}
                data-testid="field-unit-value"
              />
            </Field>
          </div>

          <Field label="Furnizor (opțional)">
            <Input
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              list="rc-suppliers"
              placeholder="Numele furnizorului"
              data-testid="field-supplier"
            />
            <datalist id="rc-suppliers">
              {suppliers.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>

          {error ? (
            <p
              role="alert"
              data-testid="form-error"
              className="mt-4 rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex items-center gap-2">
            <Button type="submit" disabled={pending} data-testid="form-submit">
              {pending ? "Se salvează..." : editing ? "Salvează modificările" : "Adaugă produsul"}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Renunță
            </Button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-4">
      <span className="block text-[12.5px] font-semibold text-rc-black mb-1.5">{label}</span>
      {children}
    </label>
  );
}
