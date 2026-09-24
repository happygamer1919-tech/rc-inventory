// P2-06 Tablou de bord, pe date reale.
//
// Ecranul pe care il vede clientul primul, deci cele cinci blocuri trebuie sa
// fie citibile dintr-o privire. Toate cifrele sunt calculate din baza de date la
// fiecare cerere, dintr-un singur set de interogari, ca doua blocuri de pe
// acelasi ecran sa nu poata spune numere diferite despre acelasi lucru.
//
// Nimic nu este scris de mana. Faza 1 a livrat o data numarul de produse ca
// literalul 26, corect in acea clipa si gresit pentru totdeauna dupa aceea.

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
import {
  PHONE_CELL,
  PHONE_LINK,
  PHONE_ROW,
  PHONE_TABLE,
  PHONE_WIDE,
  PHONE_WRAP,
} from "@/components/ui/phone";
import { StatCard } from "@/components/ui/StatCard";
import { loadDashboard } from "@/lib/data/dashboard";
import {
  DISPLAY_CURRENCY,
  formatDate,
  formatMoney,
  formatNumber,
  formatQty,
  plural,
} from "@/lib/data/format";
import { unitLabel } from "@/lib/data/units";

export const dynamic = "force-dynamic";

// P3-67. PE TELEFON (sub 768px) BLOCURILE STAU UNUL SUB ALTUL si fiecare rand de
// tabel devine un card, iar peste 768px nimic nu se schimba: fiecare clasa de mai
// jos poarta max-md. ACELASI DOM, nu o a doua copie ascunsa, ca in P3-64. Eticheta
// fiecarei celule este textul antetului coloanei ei, pus pe celula in data-label si
// desenat din CSS, deci textul celulei ramane cel de azi.
//
// P3-100. Cele sase nume erau scrise aici, cuvant cu cuvant identice cu cele din
// components/ui/phone.ts, deci copiile au fost sterse si se importa. PHONE_WRAP,
// pe care fisierul comun nu il avea, s-a mutat acolo cu valoarea de aici,
// neschimbata, fiindca si components/orders/OrdersScreen.tsx scria numele acesta.
// Nimic nu se schimba pe ecran.

export default async function Dashboard() {
  const d = await loadDashboard();

  const inboundLines = d.pendingInbound.reduce((s, o) => s + o.lines.length, 0);
  const outboundLines = d.pendingOutbound.reduce((s, o) => s + o.lines.length, 0);
  const empty = d.productCount === 0 && d.inbound.length === 0 && d.outbound.length === 0;

  return (
    <>
      <PageHeader
        title="Tablou de bord"
        lead={`Situația depozitului central la zi. Valorile sunt exprimate în ${DISPLAY_CURRENCY}.`}
      />

      {empty ? (
        <Card className="mb-4">
          <div className="px-7 py-8 text-center" data-testid="dashboard-empty">
            <p className="text-[15px] font-semibold text-rc-black">Sistemul este gol</p>
            <p className="text-[13px] text-rc-muted mt-2 max-w-[60ch] mx-auto">
              Nu există încă niciun produs, nicio comandă și nicio ieșire. Începe prin a adăuga
              produse în Inventar, apoi introdu prima comandă de intrare. Cifrele de mai jos se vor
              completa singure.
            </p>
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-4 gap-4 max-md:grid-cols-1" data-testid="dashboard-stats">
        <StatCard
          label="Valoare totală stoc"
          value={formatNumber(d.stockValue)}
          suffix={DISPLAY_CURRENCY}
          sub={`${plural(d.productCount, "produs", "produse")} în catalog`}
          icon="boxes"
        />
        <StatCard
          label="Produse sub prag"
          value={String(d.lowStock.length)}
          sub={
            d.outOfStock.length > 0
              ? `${d.outOfStock.length} dintre ele epuizate complet`
              : "Niciun produs epuizat"
          }
          icon="bell"
          tone="alert"
        />
        <StatCard
          label="Intrări în așteptare"
          value={String(d.pendingInbound.length)}
          sub={`${inboundLines} poziții de recepționat`}
          icon="upload"
        />
        <StatCard
          label="Ieșiri de expediat"
          value={String(d.pendingOutbound.length)}
          sub={`${outboundLines} poziții pregătite`}
          icon="truck"
        />
      </div>

      <div className="grid grid-cols-[1.35fr_1fr] gap-4 mt-4 max-md:grid-cols-1">
        <Card>
          <CardHeader
            title="Activitate recentă"
            hint="Recepții și expedieri, cele mai noi primele"
            right={
              <Link
                href="/comenzi"
                className={`text-[12.5px] font-semibold text-rc-orange-deep hover:underline ${PHONE_LINK}`}
              >
                Vezi comenzile
              </Link>
            }
          />
          <ul data-testid="dashboard-activity">
            {d.activity.map((a, i) => (
              <li
                key={a.id}
                className={[
                  "flex items-start gap-3 px-5 py-3",
                  i < d.activity.length - 1 ? "border-b border-rc-line" : "",
                ].join(" ")}
              >
                <span
                  className={[
                    "mt-0.5 shrink-0 w-[7px] h-[7px] rounded-full",
                    a.kind === "intrare" ? "bg-rc-ok" : "bg-rc-orange",
                  ].join(" ")}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-[13.5px] font-semibold text-rc-black truncate max-md:overflow-visible ${PHONE_WRAP}`}
                  >
                    {a.title}
                  </p>
                  <p className="text-[12.5px] text-rc-muted mt-0.5">{a.detail}</p>
                </div>
                <div className="text-right shrink-0 max-md:max-w-[45%] max-md:[overflow-wrap:anywhere]">
                  <p className="text-[12px] text-rc-muted rc-num">{formatDate(a.at)}</p>
                  <p className="text-[11.5px] text-rc-muted-2 mt-0.5">{a.reference}</p>
                </div>
              </li>
            ))}
          </ul>
          {d.activity.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-rc-muted">
              Nicio mișcare încă. Prima recepție sau prima ieșire apare aici.
            </p>
          ) : null}
        </Card>

        <Card className={PHONE_TABLE}>
          <CardHeader
            title="Produse sub prag"
            hint="Stoc curent sub sau egal cu pragul de recomandă"
            right={
              <Link
                href="/memento"
                className={`text-[12.5px] font-semibold text-rc-orange-deep hover:underline ${PHONE_LINK}`}
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
            <tbody data-testid="dashboard-low-stock">
              {d.lowStock.map((p) => (
                <tr key={p.id} className={`hover:bg-rc-paper ${PHONE_ROW}`}>
                  <Td data-label="Produs" className={PHONE_WIDE}>
                    <Link
                      href="/inventar"
                      className="block group max-md:flex max-md:min-h-11 max-md:flex-col max-md:justify-center"
                    >
                      <span className="block text-[13px] font-medium text-rc-black leading-snug group-hover:text-rc-orange-deep">
                        {p.name}
                      </span>
                      <span className="block text-[11.5px] text-rc-muted-2 mt-0.5">{p.sku}</span>
                    </Link>
                  </Td>
                  <Td align="right" data-label="Stoc" className={PHONE_CELL}>
                    {p.stock === 0 ? (
                      <Chip tone="danger">Epuizat</Chip>
                    ) : (
                      <span className="rc-num text-[13px] font-semibold text-rc-warn">
                        {formatQty(p.stock, p.unit)}
                      </span>
                    )}
                  </Td>
                  <Td align="right" data-label="Prag" className={PHONE_CELL}>
                    <span className="rc-num text-[13px] text-rc-muted">
                      {formatNumber(p.threshold)} {unitLabel(p.unit)}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {d.lowStock.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-rc-muted">
              {d.productCount === 0
                ? "Catalogul este gol."
                : "Niciun produs sub pragul de recomandă."}
            </p>
          ) : null}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4 max-md:grid-cols-1">
        <Card className={PHONE_TABLE}>
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
            <tbody data-testid="dashboard-pending-inbound">
              {d.pendingInbound.map((o) => (
                <tr key={o.id} className={`hover:bg-rc-paper ${PHONE_ROW}`}>
                  <Td data-label="Comandă" className={PHONE_WIDE}>
                    <span
                      className={`text-[13px] font-semibold text-rc-black whitespace-nowrap ${PHONE_WRAP}`}
                    >
                      {o.reference}
                    </span>
                  </Td>
                  <Td data-label="Furnizor" className={PHONE_WIDE}>
                    <span className="text-[13px] text-rc-muted">{o.supplierName ?? "-"}</span>
                  </Td>
                  <Td align="right" data-label="Estimat" className={PHONE_CELL}>
                    <span className="rc-num text-[13px] text-rc-muted whitespace-nowrap">
                      {formatDate(o.expectedAt)}
                    </span>
                  </Td>
                  <Td align="right" data-label="Valoare" className={PHONE_CELL}>
                    <span className="rc-num text-[13px] font-semibold whitespace-nowrap">
                      {formatMoney(o.totalMdl)}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {d.pendingInbound.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-rc-muted">
              Nicio comandă în așteptare.
            </p>
          ) : null}
        </Card>

        <Card className={PHONE_TABLE}>
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
            <tbody data-testid="dashboard-pending-outbound">
              {d.pendingOutbound.map((o) => (
                <tr key={o.id} className={`hover:bg-rc-paper ${PHONE_ROW}`}>
                  <Td data-label="Bon" className={PHONE_WIDE}>
                    <span
                      className={`text-[13px] font-semibold text-rc-black whitespace-nowrap ${PHONE_WRAP}`}
                    >
                      {o.reference}
                    </span>
                  </Td>
                  <Td data-label="Proiect" className={PHONE_WIDE}>
                    <span className="text-[13px] text-rc-black">{o.projectName}</span>
                  </Td>
                  <Td data-label="Client" className={PHONE_CELL}>
                    <span className="text-[12.5px] text-rc-muted">{o.clientName}</span>
                  </Td>
                  <Td align="right" data-label="Poziții" className={PHONE_CELL}>
                    <span className="rc-num text-[13px] text-rc-muted">{o.lines.length}</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {d.pendingOutbound.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-rc-muted">
              Niciun bon de expediat.
            </p>
          ) : null}
        </Card>
      </div>
    </>
  );
}
