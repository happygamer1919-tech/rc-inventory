"use client";

// RC-09 Memento stoc.
//
// Doua jumatati pe un singur ecran: pragurile per produs, editabile, si lista
// alertelor deja declansate.
//
// Comutatoarele de e-mail si SMS sunt doar interfata. In faza 1 nu exista
// furnizor de trimitere si nu exista credentiale, iar etichetele trebuie sa
// spuna asta pe fata. Un comutator care sugereaza ca pleaca ceva ar fi o
// minciuna spusa clientului in timpul demonstratiei.

import * as React from "react";
import {
  Card,
  CardHeader,
  Chip,
  Input,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import {
  FIRED_ALERTS,
  formatDate,
  formatNumber,
  normalizeText,
  unitLabel,
} from "@/lib/mock";
import { useStore } from "@/lib/store";

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={[
        "relative w-[38px] h-[22px] rounded-full transition-colors shrink-0",
        on ? "bg-rc-orange" : "bg-rc-line-strong",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all",
          on ? "left-[19px]" : "left-[3px]",
        ].join(" ")}
      />
    </button>
  );
}

export default function RemindersPage() {
  const store = useStore();
  const [q, setQ] = React.useState("");
  const [onlyLow, setOnlyLow] = React.useState(false);
  const [email, setEmail] = React.useState(true);
  const [sms, setSms] = React.useState(false);

  const rows = React.useMemo(() => {
    const needle = normalizeText(q.trim());
    return store.products.filter((p) => {
      if (needle && !normalizeText(p.name).includes(needle) && !normalizeText(p.sku).includes(needle))
        return false;
      if (onlyLow && p.stock > p.threshold) return false;
      return true;
    });
  }, [store.products, q, onlyLow]);

  const alerts = [...FIRED_ALERTS].sort((a, b) => b.firedAt.localeCompare(a.firedAt));
  const lowCount = store.products.filter((p) => p.stock <= p.threshold).length;

  return (
    <>
      <PageHeader
        title="Memento stoc"
        lead="Pragul de recomandă pentru fiecare produs și alertele care s-au declanșat deja."
      />

      <Card className="mb-4">
        <CardHeader
          title="Canale de notificare"
          hint="Doar interfață în această fază"
          right={<Chip tone="neutral">Inactive</Chip>}
        />
        <div className="px-5 py-4 flex items-center gap-8">
          <div className="flex items-center gap-3">
            <Toggle on={email} onChange={setEmail} label="Notificări e-mail" />
            <div>
              <p className="text-[13px] font-semibold text-rc-black">E-mail</p>
              <p className="text-[11.5px] text-rc-muted">Comutator salvat doar pe ecran</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Toggle on={sms} onChange={setSms} label="Notificări SMS" />
            <div>
              <p className="text-[13px] font-semibold text-rc-black">SMS</p>
              <p className="text-[11.5px] text-rc-muted">Comutator salvat doar pe ecran</p>
            </div>
          </div>
          <p className="text-[12px] text-rc-muted max-w-[46ch] leading-relaxed ml-auto">
            Nu se trimite nimic. Faza 1 nu are furnizor de e-mail sau SMS și nu are credențiale.
            Comutatoarele arată forma funcției, nu o pun în lucru.
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-[1.25fr_1fr] gap-4 items-start">
        <Card>
          <CardHeader
            title="Praguri de recomandă"
            hint="Editează pragul direct în tabel. Stocul sub sau egal cu pragul declanșează alerta."
            right={
              <button
                type="button"
                onClick={() => setOnlyLow((v) => !v)}
                className={[
                  "text-[12px] font-semibold px-2.5 py-1.5 rounded-[8px] border transition-colors",
                  onlyLow
                    ? "bg-rc-orange-soft border-rc-orange/30 text-rc-orange-deep"
                    : "bg-white border-rc-line-strong text-rc-muted hover:bg-rc-paper",
                ].join(" ")}
              >
                Doar sub prag ({lowCount})
              </button>
            }
          />
          <div className="px-5 pt-4">
            <Input
              placeholder="Caută produsul"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="pt-3">
            <Table>
              <thead>
                <tr>
                  <Th>Produs</Th>
                  <Th align="right">Stoc curent</Th>
                  <Th align="right">Prag</Th>
                  <Th align="center">Stare</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const low = p.stock <= p.threshold;
                  return (
                    <tr key={p.id} className={low ? "bg-rc-warn-soft/40" : ""}>
                      <Td>
                        <span className="text-[13px] font-medium text-rc-black leading-snug">
                          {p.name}
                        </span>
                        <span className="block rc-num text-[11.5px] text-rc-muted-2 mt-0.5">
                          {p.sku}
                        </span>
                      </Td>
                      <Td align="right">
                        <span
                          className={[
                            "rc-num text-[13px] font-semibold whitespace-nowrap",
                            p.stock === 0 ? "text-rc-danger" : low ? "text-rc-warn" : "text-rc-black",
                          ].join(" ")}
                        >
                          {formatNumber(p.stock)} {unitLabel(p.unit)}
                        </span>
                      </Td>
                      <Td align="right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            className="w-[92px] text-right rc-num py-1.5"
                            value={String(p.threshold)}
                            onChange={(e) =>
                              store.setThreshold(p.id, Math.max(0, Number(e.target.value) || 0))
                            }
                          />
                          <span className="text-[12px] text-rc-muted w-[30px] text-left">
                            {unitLabel(p.unit)}
                          </span>
                        </div>
                      </Td>
                      <Td align="center">
                        {p.stock === 0 ? (
                          <Chip tone="danger">Epuizat</Chip>
                        ) : low ? (
                          <Chip tone="warn">Sub prag</Chip>
                        ) : (
                          <Chip tone="ok">În regulă</Chip>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            {rows.length === 0 ? (
              <p className="px-6 py-10 text-center text-[13px] text-rc-muted">
                Niciun produs nu se potrivește căutării.
              </p>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Alerte declanșate"
            hint="Ce a coborât sub prag și când"
            right={<span className="text-[12px] text-rc-muted">{alerts.length} în total</span>}
          />
          <ul>
            {alerts.map((a, i) => {
              const p = store.products.find((x) => x.id === a.productId);
              return (
                <li
                  key={a.id}
                  className={[
                    "px-5 py-3.5",
                    i < alerts.length - 1 ? "border-b border-rc-line" : "",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-rc-black leading-snug">
                        {p?.name ?? a.productId}
                      </p>
                      <p className="rc-num text-[11.5px] text-rc-muted-2 mt-0.5">{p?.sku}</p>
                    </div>
                    {a.stockAtFire === 0 ? (
                      <Chip tone="danger">Epuizat</Chip>
                    ) : (
                      <Chip tone="warn">Sub prag</Chip>
                    )}
                  </div>
                  <p className="text-[12px] text-rc-muted mt-1.5">
                    A coborât la{" "}
                    <span className="rc-num font-semibold text-rc-black">
                      {formatNumber(a.stockAtFire)} {p ? unitLabel(p.unit) : ""}
                    </span>{" "}
                    față de pragul de{" "}
                    <span className="rc-num">
                      {formatNumber(a.thresholdAtFire)} {p ? unitLabel(p.unit) : ""}
                    </span>
                  </p>
                  <p className="rc-num text-[11.5px] text-rc-muted-2 mt-1">
                    {formatDate(a.firedAt)} · {a.firedAt.slice(11)}
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
