"use client";

import Link from "next/link";
import {
  Card,
  CardHeader,
  Chip,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import { StatCard } from "@/components/ui/StatCard";
import {
  DISPLAY_CURRENCY,
  formatDate,
  formatMoney,
  formatNumber,
  formatQty,
  supplierName,
  unitLabel,
} from "@/lib/mock";
import { useDerived, useStore } from "@/lib/store";
import { buildActivity } from "@/lib/activity";

// RC-03 Tabloul de bord.
// Toate cifrele sunt calculate din datele RC-02 la randare, niciuna nu este
// scrisa fix in pagina, ca sa ramana in acord cu ce arata celelalte ecrane.
export default function Dashboard() {
  const store = useStore();
  const d = useDerived();

  const stockValue = d.stockValue;
  const low = d.lowStock;
  const inbound = d.pendingInbound;
  const outbound = d.pendingOutbound;
  const activity = buildActivity(store.inbound, store.outbound, 8);

  const outOfStockCount = d.outOfStock.length;
  const inboundLines = inbound.reduce((s, o) => s + o.lines.length, 0);
  const outboundLines = outbound.reduce((s, o) => s + o.lines.length, 0);

  return (
    <>
      <PageHeader
        title="Tablou de bord"
        lead={`Situația depozitului central la zi. Valorile sunt exprimate în ${DISPLAY_CURRENCY}.`}
      />

      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Valoare totală stoc"
          value={formatNumber(stockValue)}
          suffix={DISPLAY_CURRENCY}
          sub={`${formatNumber(store.products.length)} produse în catalog`}
          icon="boxes"
        />
        <StatCard
          label="Produse sub prag"
          value={String(low.length)}
          sub={outOfStockCount > 0 ? `${outOfStockCount} dintre ele epuizate complet` : "Niciun produs epuizat"}
          icon="bell"
          tone="alert"
        />
        <StatCard
          label="Intrări în așteptare"
          value={String(inbound.length)}
          sub={`${inboundLines} poziții de recepționat`}
          icon="upload"
        />
        <StatCard
          label="Ieșiri de expediat"
          value={String(outbound.length)}
          sub={`${outboundLines} poziții pregătite`}
          icon="truck"
        />
      </div>

      <div className="grid grid-cols-[1.35fr_1fr] gap-4 mt-4">
        <Card>
          <CardHeader
            title="Activitate recentă"
            hint="Recepții și expedieri, cele mai noi primele"
            right={
              <Link
                href="/comenzi"
                className="text-[12.5px] font-semibold text-rc-orange-deep hover:underline"
              >
                Vezi comenzile
              </Link>
            }
          />
          <ul>
            {activity.map((a, i) => (
              <li
                key={a.id}
                className={[
                  "flex items-start gap-3 px-5 py-3",
                  i < activity.length - 1 ? "border-b border-rc-line" : "",
                ].join(" ")}
              >
                <span
                  className={[
                    "mt-0.5 shrink-0 w-[7px] h-[7px] rounded-full",
                    a.kind === "intrare" ? "bg-rc-ok" : "bg-rc-orange",
                  ].join(" ")}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-rc-black truncate">{a.title}</p>
                  <p className="text-[12.5px] text-rc-muted mt-0.5">{a.detail}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[12px] text-rc-muted rc-num">{formatDate(a.at)}</p>
                  <p className="text-[11.5px] text-rc-muted-2 mt-0.5">{a.reference}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Produse sub prag"
            hint="Stoc curent sub sau egal cu pragul de recomandă"
            right={
              <Link
                href="/memento"
                className="text-[12.5px] font-semibold text-rc-orange-deep hover:underline"
              >
                Praguri
              </Link>
            }
          />
          <Table>
            <thead>
              <tr>
                <Th>Produs</Th>
                <Th align="right">Stoc</Th>
                <Th align="right">Prag</Th>
              </tr>
            </thead>
            <tbody>
              {low.map((p) => (
                <tr key={p.id} className="hover:bg-rc-paper">
                  <Td>
                    <Link href="/inventar" className="block group">
                      <span className="block text-[13px] font-medium text-rc-black leading-snug group-hover:text-rc-orange-deep">
                        {p.name}
                      </span>
                      <span className="block text-[11.5px] text-rc-muted-2 mt-0.5">{p.sku}</span>
                    </Link>
                  </Td>
                  <Td align="right">
                    {p.stock === 0 ? (
                      <Chip tone="danger">Epuizat</Chip>
                    ) : (
                      <span className="rc-num text-[13px] font-semibold text-rc-warn">
                        {formatQty(p.stock, p.unit)}
                      </span>
                    )}
                  </Td>
                  <Td align="right">
                    <span className="rc-num text-[13px] text-rc-muted">
                      {formatNumber(p.threshold)} {unitLabel(p.unit)}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4">
        <Card>
          <CardHeader title="Intrări în așteptare" hint="Comenzi transmise, nerecepționate încă" />
          <Table>
            <thead>
              <tr>
                <Th>Comandă</Th>
                <Th>Furnizor</Th>
                <Th align="right">Estimat</Th>
                <Th align="right">Valoare</Th>
              </tr>
            </thead>
            <tbody>
              {inbound.map((o) => (
                <tr key={o.id} className="hover:bg-rc-paper">
                  <Td>
                    <span className="text-[13px] font-semibold text-rc-black whitespace-nowrap">{o.reference}</span>
                  </Td>
                  <Td>
                    <span className="text-[13px] text-rc-muted">{supplierName(o.supplierId)}</span>
                  </Td>
                  <Td align="right">
                    <span className="rc-num text-[13px] text-rc-muted whitespace-nowrap">{formatDate(o.expectedAt)}</span>
                  </Td>
                  <Td align="right">
                    <span className="rc-num text-[13px] font-semibold whitespace-nowrap">{formatMoney(o.totalMdl)}</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Ieșiri de expediat" hint="Bonuri create, neexpediate încă" />
          <Table>
            <thead>
              <tr>
                <Th>Bon</Th>
                <Th>Proiect</Th>
                <Th>Client</Th>
                <Th align="right">Poziții</Th>
              </tr>
            </thead>
            <tbody>
              {outbound.map((o) => (
                <tr key={o.id} className="hover:bg-rc-paper">
                  <Td>
                    <span className="text-[13px] font-semibold text-rc-black whitespace-nowrap">{o.reference}</span>
                  </Td>
                  <Td>
                    <span className="text-[13px] text-rc-black">{o.projectName}</span>
                  </Td>
                  <Td>
                    <span className="text-[12.5px] text-rc-muted">{o.clientName}</span>
                  </Td>
                  <Td align="right">
                    <span className="rc-num text-[13px] text-rc-muted">{o.lines.length}</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
