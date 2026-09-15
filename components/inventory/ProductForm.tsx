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
import {
  confirmProductImage,
  createProduct,
  prepareProductImageUpload,
  updateProduct,
} from "@/lib/data/product-actions";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { DOCS_BUCKET } from "@/lib/data/inbound-types";
import {
  PRODUCT_IMAGE_ACCEPT,
  PRODUCT_IMAGE_EXTENSIONS_LABEL,
} from "@/lib/data/product-image-types";
import {
  SHEET_CATEGORY,
  SHEET_SUPPLIER,
  sheetProductName,
  thicknessOptionLabel,
  type SheetOption,
} from "@/lib/data/sheet-options-types";
import { Combobox } from "@/components/ui/Combobox";
import type { ComboOption } from "@/components/ui/Combobox";
import type { SupplierOption } from "@/lib/data/suppliers-types";

export function ProductForm({
  product,
  categories,
  units,
  suppliers,
  focusField,
  imagesActive = false,
  sheetOptions = [],
  onClose,
}: {
  product?: CatalogProduct;
  categories: Category[];
  units: UnitCode[];
  suppliers: SupplierOption[];
  /** P3-42: campul pus in focus la deschidere, cand formularul vine dintr-o
   *  legatura catre un camp anume. Nu schimba nimic din ce se salveaza. */
  focusField?: "threshold";
  /** P3-56: false cat timp migratia 0045 nu este aplicata; atunci campul de imagine lipseste. */
  imagesActive?: boolean;
  /** P3-57: combinatiile de tabla Dasterum. Goala cat timp migratia 0046 nu este
   *  aplicata, si atunci alegerea de model lipseste. Folosita numai la adaugare. */
  sheetOptions?: SheetOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const editing = product !== undefined;
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (focusField !== "threshold") return;
    const input = formRef.current?.querySelector<HTMLInputElement>('input[name="threshold"]');
    input?.focus();
    input?.select();
  }, [focusField]);

  const [sku, setSku] = React.useState(product?.sku ?? "");
  const [name, setName] = React.useState(product?.name ?? "");
  const [categoryId, setCategoryId] = React.useState(
    product?.categoryId ?? categories[0]?.id ?? "",
  );
  const [unit, setUnit] = React.useState<string>(product?.unit ?? units[0] ?? "pcs");
  const [threshold, setThreshold] = React.useState(String(product?.threshold ?? 0));
  const [unitValue, setUnitValue] = React.useState(String(product?.unitValueMdl ?? 0));
  // P3-05: furnizorul este o inregistrare, nu text liber.
  //
  // VALOAREA ESTE FIE UN ID DE FURNIZOR, FIE UN NUME NOU, si serverul decide
  // care. Comboboxul creatable intoarce textul tastat cand nu se alege nimic
  // din lista, deci un id inseamna "acesta", iar orice altceva inseamna "creeaza
  // sau gaseste furnizorul cu numele acesta". Nu este ambiguu: un uuid nu este
  // un nume de furnizor pe care l-ar scrie cineva.
  //
  // La editare se porneste de la ID cand produsul are unul, si de la numele
  // vechi cat timp nu are, ca un produs nereconciliat inca sa nu piarda ce scrie
  // pe el la prima salvare.
  const [supplier, setSupplier] = React.useState(
    product?.supplierId ?? product?.supplierName ?? "",
  );

  // EXT-10: ambalajul furnizorului. Gol inseamna "factureaza in unitatea de
  // stoc", care este cazul obisnuit, deci campurile pornesc goale si nu cu zero.
  const [packageUnit, setPackageUnit] = React.useState(product?.packageUnit ?? "");
  const [packageFactor, setPackageFactor] = React.useState(
    product?.packageFactor === null || product?.packageFactor === undefined
      ? ""
      : String(product.packageFactor),
  );

  // P3-57. MODEL, SERIE SI GROSIME, NUMAI LA ADAUGARE. Fiecare combinatie este un
  // produs al ei, cu SKU-ul, pretul si stocul lui, deci alegerea nu se schimba pe un
  // produs existent. Listele se deriva din combinatiile primite: seria numai dintre
  // cele ale modelului, grosimea numai dintre cele ale seriei, deci o combinatie care
  // nu este in lista nu poate fi aleasa. Alegerea grosimii completeaza denumirea,
  // unitatea, categoria si furnizorul; toate raman modificabile.
  const sheetActive = !editing && sheetOptions.length > 0;
  const [sheetModel, setSheetModel] = React.useState("");
  const [sheetSeries, setSheetSeries] = React.useState("");
  const [sheetKey, setSheetKey] = React.useState("");
  const sheetModels = React.useMemo(
    () => distinct(sheetOptions.map((o) => o.model)),
    [sheetOptions],
  );
  const sheetSeriesList = React.useMemo(
    () => distinct(sheetOptions.filter((o) => o.model === sheetModel).map((o) => o.series)),
    [sheetOptions, sheetModel],
  );
  const sheetThicknesses = React.useMemo(
    () => sheetOptions.filter((o) => o.model === sheetModel && o.series === sheetSeries),
    [sheetOptions, sheetModel, sheetSeries],
  );
  const sheetPicked = sheetThicknesses.find((o) => sheetOptionKey(o) === sheetKey) ?? null;

  const supplierOptions: ComboOption[] = suppliers.map((s) => ({
    value: s.id,
    label: s.name,
  }));

  const [error, setError] = React.useState<string | null>(null);
  const [errorField, setErrorField] = React.useState<string | undefined>(undefined);
  const [pending, setPending] = React.useState(false);

  // P3-56. IMAGINEA PRODUSULUI. Fisierul nu trece prin server action: dupa salvare
  // merge din browser direct in bucket, iar serverul verifica ce a ajuns. De ce, pe
  // larg, in lib/data/product-actions.ts.
  const imageInputId = React.useId();
  const imageRef = React.useRef<HTMLInputElement>(null);
  const [imageName, setImageName] = React.useState<string | null>(null);
  // Produsul creat de o apasare anterioara, a carui imagine nu a trecut. Apasarea
  // urmatoare il modifica pe acela in loc sa creeze un duplicat.
  const [savedId, setSavedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const noCategories = categories.length === 0;

  function clearSheetError() {
    if (errorField === "sheet") {
      setError(null);
      setErrorField(undefined);
    }
  }

  /** P3-57: grosimea aleasa completeaza campurile; operatorul le poate schimba dupa. */
  function pickSheetThickness(key: string) {
    setSheetKey(key);
    clearSheetError();
    const option = sheetThicknesses.find((o) => sheetOptionKey(o) === key);
    if (!option) return;
    setName(sheetProductName(option));
    if (units.includes(option.unit)) setUnit(option.unit);
    const category = categories.find((c) => c.name === SHEET_CATEGORY);
    if (category) setCategoryId(category.id);
    // Furnizorul existent dupa id; altfel numele, pe care serverul il gaseste sau il creeaza.
    const known = suppliers.find(
      (s) => s.name.trim().toLowerCase() === SHEET_SUPPLIER.toLowerCase(),
    );
    setSupplier(known ? known.id : SHEET_SUPPLIER);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setErrorField(undefined);
    setPending(true);

    const file = imagesActive ? (imageRef.current?.files?.[0] ?? null) : null;
    const input = {
      sku,
      name,
      categoryId,
      unit,
      threshold,
      unitValueMdl: unitValue,
      supplier,
      packageUnit,
      packageFactor,
      // P3-56: numai numele si marimea. Serverul refuza tipul si marimea INAINTE de
      // orice scriere, deci o imagine gresita nu salveaza nici produsul.
      image: file ? { fileName: file.name, sizeBytes: file.size } : null,
      // P3-57: combinatia aleasa, numai la adaugare. Serverul o cauta in lista si
      // refuza un model fara serie sau fara grosime.
      sheet:
        sheetActive && sheetModel
          ? {
              model: sheetModel,
              series: sheetSeries,
              thicknessMm: sheetPicked?.thicknessMm ?? "",
              finish: sheetPicked?.finish ?? "",
            }
          : null,
    };
    const targetId = product?.id ?? savedId;
    const result = targetId ? await updateProduct(targetId, input) : await createProduct(input);

    if (!result.ok) {
      setError(result.message);
      setErrorField(result.field);
      setPending(false);
      return;
    }

    if (file) {
      if (!editing) setSavedId(result.id);
      const attached = await attachImage(result.id, file);
      if (!attached.ok) {
        setError(`Produsul a fost salvat, dar imaginea nu a fost încărcată. ${attached.message}`);
        setErrorField("image");
        setPending(false);
        router.refresh();
        return;
      }
    }
    router.refresh();
    onClose();
  }

  /** P3-56: pregatire pe server, incarcare directa in bucket, confirmare pe server. */
  async function attachImage(
    productId: string,
    file: File,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      const prepared = await prepareProductImageUpload(productId, {
        fileName: file.name,
        sizeBytes: file.size,
      });
      if (!prepared.ok) return prepared;

      const { path, token, contentType } = prepared.value;
      const { error: uploadError } = await createBrowserClient()
        .storage.from(DOCS_BUCKET)
        .uploadToSignedUrl(path, token, file, { contentType });
      if (uploadError) {
        return {
          ok: false,
          message: `Depozitul a refuzat imaginea. Se acceptă doar ${PRODUCT_IMAGE_EXTENSIONS_LABEL}, de cel mult 10 MB.`,
        };
      }

      return await confirmProductImage(productId, path);
    } catch {
      return {
        ok: false,
        message: "Încărcarea imaginii a eșuat. Verifică legătura la internet și încearcă din nou.",
      };
    }
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

        <form ref={formRef} onSubmit={onSubmit} noValidate className="px-6 py-5">
          {noCategories ? (
            <p className="mb-4 rounded-[10px] border border-rc-warn bg-rc-warn-soft px-3.5 py-2.5 text-[12.5px] text-rc-black">
              Nu există nicio categorie. Adaugă una în Setări înainte de a crea un produs.
            </p>
          ) : null}

          {/* P3-57. TABLA SI TIGLA METALICA DASTERUM. Optional: un produs obisnuit
              lasa Fără model si se completeaza de mana, ca pana acum. */}
          {sheetActive ? (
            <div className="mb-4 border-b border-rc-line" data-testid="field-sheet">
              <p className="text-[12.5px] font-semibold text-rc-black">
                Tablă și țiglă metalică Dasterum
              </p>
              <p className="text-[12px] text-rc-muted mt-0.5 mb-3">
                Opțional. Alege modelul, seria și grosimea: denumirea, unitatea, categoria și
                furnizorul se completează singure, iar denumirea se poate modifica.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Model">
                  <Select
                    value={sheetModel}
                    onChange={(e) => {
                      setSheetModel(e.target.value);
                      setSheetSeries("");
                      setSheetKey("");
                      clearSheetError();
                    }}
                    className={fieldClass("sheet")}
                    data-testid="field-sheet-model"
                  >
                    <option value="">Fără model</option>
                    {sheetModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Serie">
                  <Select
                    value={sheetSeries}
                    onChange={(e) => {
                      setSheetSeries(e.target.value);
                      setSheetKey("");
                      clearSheetError();
                    }}
                    disabled={!sheetModel}
                    className={fieldClass("sheet")}
                    data-testid="field-sheet-series"
                  >
                    <option value="">Alege seria</option>
                    {sheetSeriesList.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Grosime">
                <Select
                  value={sheetKey}
                  onChange={(e) => pickSheetThickness(e.target.value)}
                  disabled={!sheetSeries}
                  className={fieldClass("sheet")}
                  data-testid="field-sheet-thickness"
                >
                  <option value="">Alege grosimea</option>
                  {sheetThicknesses.map((o) => (
                    <option key={sheetOptionKey(o)} value={sheetOptionKey(o)}>
                      {thicknessOptionLabel(o)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
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
                name="threshold"
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
            {/* creatable: lista furnizorilor NU este inchisa. Un furnizor nou
                se scrie aici si se creeaza la salvare, ca introducerea unui
                produs sa nu devina o sarcina pe doua ecrane. */}
            <div data-testid="field-supplier">
              <Combobox
                options={supplierOptions}
                value={supplier}
                onChange={setSupplier}
                creatable
                placeholder="Caută sau scrie un furnizor nou"
                emptyLabel="Niciun furnizor"
              />
            </div>
          </Field>

          {/* EXT-10. AMBALAJUL FURNIZORULUI, care nu este o unitate de masura.
              Furnizorul factureaza pe palet, cutie sau set; Mihai numara saci si
              bucati. Se scrie ce factureaza el si cate unitati de stoc incap
              intr-unul, iar sistemul converteste in loc sa ghiceasca. */}
          <div className="mt-1 mb-1 border-t border-rc-line pt-4">
            <p className="text-[12.5px] font-semibold text-rc-black">Ambalajul furnizorului</p>
            <p className="text-[12px] text-rc-muted mt-0.5 mb-3">
              Doar dacă furnizorul facturează altfel decât unitatea de stoc. Lasă gol
              dacă facturează la fel.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ambalaj (opțional)">
                <Input
                  value={packageUnit}
                  onChange={(e) => setPackageUnit(e.target.value)}
                  placeholder="palet"
                  className={fieldClass("packageUnit")}
                  data-testid="field-package-unit"
                />
              </Field>
              <Field label="Unități de stoc într-un ambalaj">
                <Input
                  value={packageFactor}
                  onChange={(e) => setPackageFactor(e.target.value)}
                  inputMode="decimal"
                  placeholder="48"
                  className={fieldClass("packageFactor")}
                  data-testid="field-package-factor"
                />
              </Field>
            </div>
          </div>

          {/* P3-56. IMAGINE PRODUS, la adaugare si la modificare. Campul nativ scrie
              "Choose File" in engleza, deci este ascuns vizual si il inlocuieste o
              eticheta romaneasca, ca in fila Documente. */}
          {imagesActive ? (
            <div className="mt-1 mb-1 border-t border-rc-line pt-4" data-testid="field-image">
              <span className="block text-[12.5px] font-semibold text-rc-black mb-1.5">
                Imagine produs
              </span>
              <div className="flex items-center gap-3 min-h-[38px]">
                <input
                  ref={imageRef}
                  id={imageInputId}
                  type="file"
                  accept={PRODUCT_IMAGE_ACCEPT}
                  disabled={pending}
                  className="sr-only"
                  onChange={(e) => {
                    setImageName(e.target.files?.[0]?.name ?? null);
                    if (errorField === "image") {
                      setError(null);
                      setErrorField(undefined);
                    }
                  }}
                  data-testid="field-image-input"
                />
                <label
                  htmlFor={imageInputId}
                  className={[
                    "inline-flex cursor-pointer items-center rounded-[10px] border bg-rc-white px-3 py-2 text-[13px] font-semibold text-rc-black hover:bg-rc-paper",
                    errorField === "image" ? "border-rc-danger" : "border-rc-line-strong",
                  ].join(" ")}
                  data-testid="field-image-choose"
                >
                  Alege imaginea
                </label>
                <span
                  className="max-w-[260px] truncate text-[13px] text-rc-muted"
                  data-testid="field-image-chosen"
                >
                  {imageName ?? "Nicio imagine aleasă"}
                </span>
              </div>
              <p className="text-[12px] text-rc-muted mt-1.5">
                Se acceptă {PRODUCT_IMAGE_EXTENSIONS_LABEL}, de cel mult 10 MB.
                {editing ? " O imagine nouă o înlocuiește pe cea existentă." : ""}
              </p>
            </div>
          ) : null}

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

/** P3-57: valorile unice, in ordinea in care apar in lista. */
function distinct(values: string[]): string[] {
  return [...new Set(values)];
}

/** P3-57: grosimea si finisajul, cheia unei combinatii in cadrul seriei alese. */
function sheetOptionKey(option: Pick<SheetOption, "thicknessMm" | "finish">): string {
  return `${option.thicknessMm}|${option.finish}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-4">
      <span className="block text-[12.5px] font-semibold text-rc-black mb-1.5">{label}</span>
      {children}
    </label>
  );
}
