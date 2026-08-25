"use client";

// RC-06 Inventar.
//
// Ecranul in care traieste depozitul, deci trebuie sa suporte sa fie umblat, nu
// doar privit. Cele patru filtre lucreaza impreuna, iar randul deschide un
// panou lateral cu loturile si miscarile produsului. Panou, nu pagina, ca sa nu
// se piarda filtrele si pozitia in lista in timpul demonstratiei.
// Un singur depozit, deci nu exista coloana de locatie.

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
import {
  CATEGORIES,
  SUPPLIERS,
  formatDate,
  formatMoney,
  formatNumber,
  formatQty,
  normalizeText,
  supplierName,
  unitLabel,
} from "@/lib/mock";
import type { Product, StockLevel } from "@/lib/mock";
import { useStore } from "@/lib/store";

const STOCK_LEVELS: Array<{ value: StockLevel; label: string }> = [
  { value: "toate", label: "Toate nivelurile" },
  { value: "redus", label: "Stoc redus" },
  { value: "epuizat", label: "Epuizat" },
  { value: "suficient", label: "Stoc suficient" },
];

export default function InventoryPage() {
  const store = useStore();
  const [q, setQ] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [supplier, setSupplier] = React.useState("");
  const [level, setLevel] = React.useState<StockLevel>("toate");
  const [openId, setOpenId] = React.useState<string | null>(null);

  const rows = React.useMemo(() => {
    const needle = normalizeText(q.trim());
    return store.products.filter((p) => {
      if (
        needle &&
        !normalizeText(p.name).includes(needle) &&
        !normalizeText(p.sku).includes(needle)
      )
        return false;
      if (category && p.category !== category) return false;
      if (supplier && p.supplierId !== supplier) return false;
      const low = p.stock <= p.threshold;
      if (level === "redus" && !(low && p.stock > 0)) return false;
      if (level === "epuizat" && p.stock !== 0) return false;
      if (level === "suficient" && low) return false;
      return true;
    });
  }, [store.products, q, category, supplier, level]);

  const filtersActive = q !== "" || category !== "" || supplier !== "" || level !== "toate";
  const open = openId ? store.products.find((p) => p.id === openId) ?? null : null;

  function reset() {
    setQ("");
    setCategory("");
    setSupplier("");
    setLevel("toate");
  }

  return (
    <>
      <PageHeader
        title="Inventar"
        lead="Toate produsele din depozitul central. Apasă pe un rând pentru loturile și mișcările produsului."
        actions={
          filtersActive ? (
            <Button variant="secondary" onClick={reset}>
              Șterge filtrele
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-4">
        <div className="p-4 grid grid-cols-[1.6fr_1fr_1.3fr_1fr] gap-3">
          <Input
            placeholder="Caută după denumire sau cod SKU"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Toate categoriile</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
            <option value="">Toți furnizorii</option>
            {SUPPLIERS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
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
        </div>
        <div className="px-4 pb-3 -mt-1">
          <p className="text-[12.5px] text-rc-muted">
            {rows.length === store.products.length
              ? `${rows.length} produse`
              : `${rows.length} din ${store.products.length} produse`}
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
          <tbody>
            {rows.map((p) => {
              const low = p.stock <= p.threshold;
              const empty = p.stock === 0;
              return (
                <tr
                  key={p.id}
                  onClick={() => setOpenId(p.id)}
                  className={[
                    "cursor-pointer transition-colors",
                    empty
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
                  </Td>
                  <Td>
                    <span className="text-[12.5px] text-rc-muted whitespace-nowrap">{p.category}</span>
                  </Td>
                  <Td>
                    <span className="text-[12.5px] text-rc-muted">{supplierName(p.supplierId)}</span>
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
          <div className="px-6 py-14 text-center">
            <p className="text-[14px] font-semibold text-rc-black">Niciun produs nu se potrivește</p>
            <p className="text-[13px] text-rc-muted mt-1.5">
              Schimbă filtrele sau șterge-le pentru a vedea tot catalogul.
            </p>
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" size="sm" onClick={reset}>
                Șterge filtrele
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      {open ? <ProductPanel product={open} onClose={() => setOpenId(null)} /> : null}
    </>
  );
}

/* ------------------------------------------------------- panou per produs -- */

function ProductPanel({ product, onClose }: { product: Product; onClose: () => void }) {
  const store = useStore();

  const batches = store.batches
    .filter((b) => b.productId === product.id)
    .sort((a, b) => b.arrivedAt.localeCompare(a.arrivedAt));
  const movements = store.movements
    .filter((m) => m.productId === product.id)
    .sort((a, b) => b.at.localeCompare(a.at));

  // Inchidere cu Escape, ca panoul sa nu fie o capcana la tastatura.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const low = product.stock <= product.threshold;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      {/* text-rc-black este obligatoriu: body are culoarea alba, deci orice text
          fara clasa de culoare ar iesi alb pe alb in interiorul panoului. */}
      <aside className="relative w-[620px] h-full bg-rc-white text-rc-black overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-rc-white text-rc-black border-b border-rc-line px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="rc-num text-[12px] font-semibold text-rc-muted">{product.sku}</p>
            <h2 className="text-[17px] font-bold text-rc-black leading-snug mt-0.5">
              {product.name}
            </h2>
            <p className="text-[12.5px] text-rc-muted mt-1">
              {product.category} · {supplierName(product.supplierId)}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Închide"
            className="shrink-0 w-8 h-8 rounded-[9px] text-rc-muted hover:bg-rc-paper hover:text-rc-black transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 grid grid-cols-3 gap-3">
          {[
            { l: "Stoc curent", v: formatQty(product.stock, product.unit), tone: low },
            { l: "Prag recomandă", v: `${formatNumber(product.threshold)} ${unitLabel(product.unit)}`, tone: false },
            { l: "Valoare stoc", v: formatMoney(product.stock * product.unitValueMdl), tone: false },
          ].map((s) => (
            <div key={s.l} className="rounded-[10px] border border-rc-line bg-rc-paper px-3.5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-rc-muted">{s.l}</p>
              <p
                className={[
                  "rc-num text-[16px] font-bold mt-1",
                  s.tone ? "text-rc-warn" : "text-rc-black",
                ].join(" ")}
              >
                {s.v}
              </p>
            </div>
          ))}
        </div>

        <section className="px-6 pb-2">
          <h3 className="text-[13.5px] font-bold text-rc-black mb-2">
            Loturi <span className="font-normal text-rc-muted">({batches.length})</span>
          </h3>
          <p className="text-[12px] text-rc-muted mb-2.5">
            Un lot se creează la recepția unei comenzi de intrare.
          </p>
          <div className="rounded-[10px] border border-rc-line overflow-hidden">
            <Table>
              <thead>
                <tr>
                  <Th>Lot</Th>
                  <Th>Comandă</Th>
                  <Th align="right">Cantitate</Th>
                  <Th align="right">Recepționat</Th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => {
                  const order = store.inbound.find((o) => o.id === b.inboundOrderId);
                  return (
                    <tr key={b.id}>
                      <Td>
                        <span className="rc-num text-[12.5px] font-semibold">{b.id}</span>
                      </Td>
                      <Td>
                        <span className="text-[12.5px] text-rc-muted">{order?.reference ?? "-"}</span>
                      </Td>
                      <Td align="right">
                        <span className="rc-num text-[12.5px] font-semibold">
                          {formatQty(b.quantity, product.unit)}
                        </span>
                      </Td>
                      <Td align="right">
                        <span className="rc-num text-[12.5px] text-rc-muted">
                          {formatDate(b.arrivedAt)}
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            {batches.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12.5px] text-rc-muted">
                Niciun lot încă. Se creează la prima recepție a acestui produs.
              </p>
            ) : null}
          </div>
        </section>

        <section className="px-6 py-5">
          <h3 className="text-[13.5px] font-bold text-rc-black mb-2">
            Mișcări <span className="font-normal text-rc-muted">({movements.length})</span>
          </h3>
          <div className="rounded-[10px] border border-rc-line overflow-hidden">
            <Table>
              <thead>
                <tr>
                  <Th>Dată</Th>
                  <Th>Sens</Th>
                  <Th align="right">Cantitate</Th>
                  <Th>Context</Th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <Td>
                      <span className="rc-num text-[12.5px] text-rc-muted whitespace-nowrap">
                        {formatDate(m.at)}
                      </span>
                    </Td>
                    <Td>
                      {m.direction === "in" ? (
                        <Chip tone="ok">Intrare</Chip>
                      ) : (
                        <Chip tone="orange">Ieșire</Chip>
                      )}
                    </Td>
                    <Td align="right">
                      <span
                        className={[
                          "rc-num text-[12.5px] font-semibold whitespace-nowrap",
                          m.direction === "in" ? "text-rc-ok" : "text-rc-orange-deep",
                        ].join(" ")}
                      >
                        {m.direction === "in" ? "+" : "-"}
                        {formatQty(m.quantity, product.unit)}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-[12.5px] text-rc-black">{m.context}</span>
                      <span className="block text-[11.5px] text-rc-muted-2 mt-0.5">{m.reference}</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {movements.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12.5px] text-rc-muted">
                Nicio mișcare înregistrată pentru acest produs.
              </p>
            ) : null}
          </div>
        </section>
      </aside>
    </div>
  );
}
