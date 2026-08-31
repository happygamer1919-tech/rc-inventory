"use client";

// Panoul lateral al produsului. Marcajul este cel din faza 1; loturile si
// miscarile vin acum din baza si se incarca la deschidere.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Chip, Table, Td, Th } from "@/components/ui/primitives";
import { RecordLink } from "@/components/ui/RecordLink";
import { formatDate, formatMoney, formatNumber, formatQty } from "@/lib/data/format";
import { unitLabel } from "@/lib/data/units";
import type { CatalogProduct } from "@/lib/data/products";
import { loadProductDetail, type ProductDetail } from "@/lib/data/product-detail";
import { setProductActive } from "@/lib/data/product-actions";

export function ProductPanel({
  product,
  canWrite,
  onClose,
  onEdit,
}: {
  product: CatalogProduct;
  canWrite: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = React.useState<ProductDetail | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    loadProductDetail(product.id).then((d) => {
      if (!cancelled) setDetail(d);
    });
    return () => {
      cancelled = true;
    };
  }, [product.id]);

  // Inchidere cu Escape, ca panoul sa nu fie o capcana la tastatura.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const low = product.stock <= product.threshold;
  const batches = detail?.batches ?? [];
  const movements = detail?.movements ?? [];

  async function toggleActive() {
    setBusy(true);
    setError(null);
    const result = await setProductActive(product.id, !product.active);
    if (!result.ok) {
      setError(result.message);
      setBusy(false);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      {/* text-rc-black este obligatoriu: body are culoarea alba, deci orice text
          fara clasa de culoare ar iesi alb pe alb in interiorul panoului. */}
      <aside
        className="relative w-[620px] h-full bg-rc-white text-rc-black overflow-y-auto shadow-2xl"
        data-testid="product-panel"
      >
        <div className="sticky top-0 bg-rc-white text-rc-black border-b border-rc-line px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="rc-num text-[12px] font-semibold text-rc-muted">{product.sku}</p>
            <h2
              className="text-[17px] font-bold text-rc-black leading-snug mt-0.5"
              data-testid="panel-name"
            >
              {product.name}
            </h2>
            <p className="text-[12.5px] text-rc-muted mt-1">
              {product.category} ·{" "}
              {/* P3-10: produsul catre furnizorul lui, si de acolo catre toate
                  produsele aceluiasi furnizor. Sunt aceeasi legatura: nu exista
                  o fisa de furnizor, iar "produsele acestui furnizor" ESTE ce
                  vrea sa vada cine apasa pe un nume de furnizor. */}
              <RecordLink
                href={product.supplierId ? `/inventar?furnizor=${product.supplierId}` : null}
                fallback={product.supplierName ?? "Fără furnizor"}
                testId="product-supplier-link"
              >
                {product.supplierName}
              </RecordLink>
              {!product.active ? " · inactiv" : ""}
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

        {canWrite ? (
          <div className="px-6 pt-4 flex items-center gap-2">
            <Button size="sm" onClick={onEdit} data-testid="panel-edit">
              Modifică
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={toggleActive}
              disabled={busy}
              data-testid="panel-toggle-active"
            >
              {product.active ? "Dezactivează" : "Reactivează"}
            </Button>
          </div>
        ) : null}

        {error ? (
          <p
            role="alert"
            data-testid="panel-error"
            className="mx-6 mt-3 rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
          >
            {error}
          </p>
        ) : null}

        <div className="px-6 py-5 grid grid-cols-3 gap-3">
          {[
            { l: "Stoc curent", v: formatQty(product.stock, product.unit), tone: low },
            {
              l: "Prag recomandă",
              v: `${formatNumber(product.threshold)} ${unitLabel(product.unit)}`,
              tone: false,
            },
            { l: "Valoare stoc", v: formatMoney(product.stock * product.unitValueMdl), tone: false },
          ].map((s) => (
            <div key={s.l} className="rounded-[10px] border border-rc-line bg-rc-paper px-3.5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-rc-muted">
                {s.l}
              </p>
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
                {batches.map((b) => (
                  <tr key={b.id}>
                    <Td>
                      <span className="rc-num text-[12.5px] font-semibold">
                        {b.id.slice(0, 8)}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-[12.5px] text-rc-muted">{b.orderReference ?? "-"}</span>
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
                ))}
              </tbody>
            </Table>
            {batches.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12.5px] text-rc-muted">
                {detail === null
                  ? "Se încarcă..."
                  : "Niciun lot încă. Se creează la prima recepție a acestui produs."}
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
                      <span className="block text-[11.5px] text-rc-muted-2 mt-0.5">
                        {m.reference}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {movements.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12.5px] text-rc-muted">
                {detail === null
                  ? "Se încarcă..."
                  : "Nicio mișcare înregistrată pentru acest produs."}
              </p>
            ) : null}
          </div>
        </section>
      </aside>
    </div>
  );
}
