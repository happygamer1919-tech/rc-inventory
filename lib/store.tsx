"use client";

// Starea de sesiune a preview-ului.
//
// Datele din RC-02 sunt o fotografie asezata: stocul de acolo reflecta deja
// receptiile si expedierile deja intamplate. Ce face operatorul in timpul
// demonstratiei se aplica peste, ca diferenta, si traieste doar in memorie.
// La reincarcarea paginii totul revine la fotografia initiala, ceea ce este
// deliberat: faza 1 nu are baza de date si nu pastreaza nimic.
//
// Toate ecranele care arata comenzi, stocuri sau praguri citesc de aici, ca sa
// nu spuna doua povesti diferite despre aceleasi date.

import * as React from "react";
import {
  BATCHES,
  INBOUND_ORDERS,
  MOVEMENTS,
  OUTBOUND_ISSUES,
  PRODUCTS,
  supplierName,
} from "@/lib/mock";
import type {
  Batch,
  InboundOrder,
  Movement,
  OutboundIssue,
  Product,
} from "@/lib/mock";

type State = {
  inbound: InboundOrder[];
  outbound: OutboundIssue[];
  batches: Batch[];
  movements: Movement[];
  /** Praguri modificate de operator, peste cele din catalog. */
  thresholds: Record<string, number>;
  /** Diferente de stoc produse de actiunile din sesiune. */
  stockDelta: Record<string, number>;
};

type Store = State & {
  products: Product[];
  addInbound: (order: InboundOrder) => void;
  receiveInbound: (id: string) => void;
  addOutbound: (issue: OutboundIssue) => void;
  shipOutbound: (id: string) => void;
  setThreshold: (productId: string, value: number) => void;
  /** Numarul urmator liber pentru o referinta noua. */
  nextInboundReference: () => string;
  nextOutboundReference: () => string;
};

const Ctx = React.createContext<Store | null>(null);

function stamp(): string {
  // Marcaj de timp lizibil pentru istoricul de stari. Ora locala a operatorului.
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function today(): string {
  return stamp().slice(0, 10);
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<State>(() => ({
    inbound: INBOUND_ORDERS,
    outbound: OUTBOUND_ISSUES,
    batches: BATCHES,
    movements: MOVEMENTS,
    thresholds: {},
    stockDelta: {},
  }));

  const addInbound = React.useCallback((order: InboundOrder) => {
    setState((s) => ({ ...s, inbound: [order, ...s.inbound] }));
  }, []);

  /** Receptia este ce creeaza loturile. Legatura aceasta trebuie sa fie vizibila
   *  in interfata, chiar daca datele sunt demonstrative. */
  const receiveInbound = React.useCallback((id: string) => {
    setState((s) => {
      const order = s.inbound.find((o) => o.id === id);
      if (!order || order.status === "Recepționată") return s;

      const at = today();
      const newBatches: Batch[] = order.lines.map((l, i) => ({
        id: `lot-${order.id}-${i + 1}`,
        productId: l.productId,
        inboundOrderId: order.id,
        quantity: l.quantity,
        arrivedAt: at,
      }));
      const newMovements: Movement[] = order.lines.map((l, i) => ({
        id: `mv-${order.id}-${i + 1}`,
        productId: l.productId,
        direction: "in",
        quantity: l.quantity,
        at,
        reference: order.reference,
        context: `Recepție de la ${supplierName(order.supplierId)}`,
      }));
      const delta = { ...s.stockDelta };
      for (const l of order.lines) delta[l.productId] = (delta[l.productId] ?? 0) + l.quantity;

      return {
        ...s,
        inbound: s.inbound.map((o) =>
          o.id === id
            ? {
                ...o,
                status: "Recepționată",
                arrivedAt: at,
                history: [
                  ...o.history,
                  {
                    at: stamp(),
                    status: "Recepționată",
                    note: `Marfă recepționată. ${newBatches.length} ${newBatches.length === 1 ? "lot creat" : "loturi create"} automat.`,
                    by: "Operator",
                  },
                ],
              }
            : o,
        ),
        batches: [...newBatches, ...s.batches],
        movements: [...newMovements, ...s.movements],
        stockDelta: delta,
      };
    });
  }, []);

  const addOutbound = React.useCallback((issue: OutboundIssue) => {
    setState((s) => ({ ...s, outbound: [issue, ...s.outbound] }));
  }, []);

  const shipOutbound = React.useCallback((id: string) => {
    setState((s) => {
      const issue = s.outbound.find((o) => o.id === id);
      if (!issue || issue.status === "Expediată") return s;

      const at = today();
      const newMovements: Movement[] = issue.lines.map((l, i) => ({
        id: `mv-${issue.id}-${i + 1}`,
        productId: l.productId,
        direction: "out",
        quantity: l.quantity,
        at,
        reference: issue.reference,
        context: issue.projectName,
      }));
      const delta = { ...s.stockDelta };
      for (const l of issue.lines) delta[l.productId] = (delta[l.productId] ?? 0) - l.quantity;

      return {
        ...s,
        outbound: s.outbound.map((o) =>
          o.id === id
            ? {
                ...o,
                status: "Expediată",
                shippedAt: at,
                history: [
                  ...o.history,
                  { at: stamp(), status: "Expediată", note: "Marfă încărcată și plecată către șantier.", by: "Operator" },
                ],
              }
            : o,
        ),
        movements: [...newMovements, ...s.movements],
        stockDelta: delta,
      };
    });
  }, []);

  const setThreshold = React.useCallback((productId: string, value: number) => {
    setState((s) => ({ ...s, thresholds: { ...s.thresholds, [productId]: value } }));
  }, []);

  /** Catalogul cu diferentele de sesiune si pragurile modificate aplicate. */
  const products = React.useMemo(
    () =>
      PRODUCTS.map((p) => ({
        ...p,
        stock: Math.max(0, p.stock + (state.stockDelta[p.id] ?? 0)),
        threshold: state.thresholds[p.id] ?? p.threshold,
      })),
    [state.stockDelta, state.thresholds],
  );

  const nextInboundReference = React.useCallback(() => {
    const nums = state.inbound
      .map((o) => Number(o.reference.split("-").pop()))
      .filter((n) => Number.isFinite(n));
    return `CMD-2026-${String(Math.max(0, ...nums) + 1).padStart(4, "0")}`;
  }, [state.inbound]);

  const nextOutboundReference = React.useCallback(() => {
    const nums = state.outbound
      .map((o) => Number(o.reference.split("-").pop()))
      .filter((n) => Number.isFinite(n));
    return `IES-2026-${String(Math.max(0, ...nums) + 1).padStart(4, "0")}`;
  }, [state.outbound]);

  const value: Store = {
    ...state,
    products,
    addInbound,
    receiveInbound,
    addOutbound,
    shipOutbound,
    setThreshold,
    nextInboundReference,
    nextOutboundReference,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useStore trebuie folosit în interiorul StoreProvider");
  return v;
}

/* ------------------------------------------------- selectori peste starea vie -- */

export function useDerived() {
  const s = useStore();
  return React.useMemo(() => {
    const low = s.products.filter((p) => p.stock <= p.threshold);
    return {
      stockValue: s.products.reduce((sum, p) => sum + p.stock * p.unitValueMdl, 0),
      lowStock: low,
      outOfStock: s.products.filter((p) => p.stock === 0),
      pendingInbound: s.inbound.filter((o) => o.status === "În așteptare"),
      arrivedInbound: s.inbound.filter((o) => o.status === "Recepționată"),
      pendingOutbound: s.outbound.filter((o) => o.status === "În așteptare expediere"),
      shippedOutbound: s.outbound.filter((o) => o.status === "Expediată"),
    };
  }, [s.products, s.inbound, s.outbound]);
}
