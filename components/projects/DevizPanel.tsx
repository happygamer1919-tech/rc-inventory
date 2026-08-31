"use client";

// Fila Deviz de pe fisa proiectului, cardul P3-13b.
//
// TREI PRETURI SI NU SUNT ACELASI NUMAR: Pret ofertat este
// deviz_lines.unit_price_mdl, inghetat la momentul ofertarii; Pret curent este
// valoarea de azi din catalog; Diferenta este calculata intre ele. TOTALUL
// FOLOSESTE PRETUL OFERTAT. Un instantaneu fata de care nu se vede deriva este
// doar un numar invechit, si asta este intrebarea la care fila raspunde.
//
// O CIORNA SE EDITEAZA SI NIMIC ALTCEVA. Butoanele dispar pe orice alta stare,
// dar asta este o curtoazie: refuzul real vine din declansatoarele migratiei
// 0025, iar linia de acceptanta il verifica acolo.
//
// VERSIUNEA DESCHISA TRAIESTE IN ADRESA, cu acelasi tipar ca fila insasi: doua
// ecrane care fac acelasi lucru cu URL-ul nu au voie sa foloseasca doua chei.

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  Card,
  CardHeader,
  Chip,
  EmptyState,
  Field,
  Input,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import { Combobox, type ComboOption } from "@/components/ui/Combobox";
import { DISPLAY_CURRENCY, formatDate, formatMoney, formatNumber } from "@/lib/data/format";
import { unitLabel } from "@/lib/data/units";
import {
  DEVIZ_STATUS_LABEL,
  isEditable,
  isPastValidity,
  type DevizStatus,
} from "@/lib/data/deviz-types";
import type { Deviz, DevizSummary } from "@/lib/data/deviz";
import {
  addDevizLine,
  createDeviz,
  removeDevizLine,
  repriceDevizLine,
  setDevizStatus,
  updateDevizLineQuantity,
} from "@/lib/data/deviz-actions";
import type { CatalogProduct } from "@/lib/data/products";

const STATUS_TONE: Record<DevizStatus, "neutral" | "info" | "ok" | "danger" | "warn"> = {
  draft: "neutral",
  sent: "info",
  accepted: "ok",
  rejected: "danger",
  expired: "warn",
};

/** Starile catre care o versiune poate fi mutata de pe cea curenta.
 *
 *  Ciorna se emite. Un deviz emis se accepta, se respinge sau se marcheaza
 *  expirat. Un deviz inchis nu se mai misca: se creeaza o versiune noua. */
const NEXT_STATUSES: Record<DevizStatus, DevizStatus[]> = {
  draft: ["sent"],
  sent: ["accepted", "rejected", "expired"],
  accepted: [],
  rejected: [],
  expired: [],
};

export function DevizPanel({
  projectId,
  list,
  open,
  products,
  canWrite,
}: {
  projectId: string;
  list: DevizSummary[];
  open: Deviz | null;
  products: CatalogProduct[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [productId, setProductId] = React.useState("");
  const [quantity, setQuantity] = React.useState("");

  const productOptions: ComboOption[] = React.useMemo(
    () =>
      products.map((p) => ({
        value: p.id,
        label: p.name,
        hint: `${p.sku} - ${formatMoney(p.unitValueMdl)} / ${unitLabel(p.unit)}`,
      })),
    [products],
  );

  function openVersion(devizId: string) {
    const next = new URLSearchParams(params.toString());
    next.set("fila", "deviz");
    next.set("deviz", devizId);
    router.push(`${pathname}?${next.toString()}`);
  }

  /** Fiecare actiune trece pe aici, ca refuzul sa ajunga pe ecran in romana in
   *  loc sa dispara intr-o consola. */
  async function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      if (!result.ok) {
        setMessage(result.message ?? "Operațiunea a eșuat.");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  const editable = open ? isEditable(open.status) : false;
  const pastValidity = open ? isPastValidity(open) : false;

  return (
    <div className="space-y-4" data-testid="deviz-panel">
      <Card>
        <CardHeader
          title="Devize"
          hint="Fiecare estimare este o versiune. Cea mai nouă este prima."
          right={
            canWrite ? (
              <Button
                size="sm"
                variant="secondary"
                type="button"
                disabled={busy}
                data-testid="deviz-new"
                onClick={async () => {
                  const ok = await run(() =>
                    createDeviz({
                      projectId,
                      name: "",
                      marginPercent: open ? String(open.marginPercent) : "0",
                      validUntil: "",
                      notes: "",
                      // PRELUAREA COPIAZA PRETURILE INGHETATE, nu recitește
                      // catalogul: o renegociere pornește de la ce s-a ofertat.
                      copyFromDevizId: open ? open.id : "",
                    }),
                  );
                  if (ok) setMessage(null);
                }}
              >
                + Deviz nou
              </Button>
            ) : null
          }
        />

        {list.length === 0 ? (
          <EmptyState
            title="Niciun deviz"
            hint="Prima estimare pe acest șantier apare aici după ce este creată."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Versiune</Th>
                <Th>Stare</Th>
                <Th>Valabil până la</Th>
                <Th align="right">Linii</Th>
                <Th align="right">Total ({DISPLAY_CURRENCY})</Th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, 25).map((d) => (
                <tr
                  key={d.id}
                  data-testid="deviz-row"
                  data-deviz-id={d.id}
                  data-version={d.version}
                  data-open={open?.id === d.id ? "true" : "false"}
                  className={open?.id === d.id ? "bg-rc-orange-soft cursor-pointer" : "cursor-pointer"}
                  onClick={() => openVersion(d.id)}
                >
                  <Td>
                    <span className="font-semibold text-rc-black">
                      Versiunea {d.version}
                    </span>
                    {d.name ? <span className="text-rc-muted"> - {d.name}</span> : null}
                  </Td>
                  <Td>
                    <Chip tone={STATUS_TONE[d.status]}>{DEVIZ_STATUS_LABEL[d.status]}</Chip>
                  </Td>
                  <Td>{d.validUntil ? formatDate(d.validUntil) : "-"}</Td>
                  <Td align="right">{d.lineCount}</Td>
                  <Td align="right" data-testid="deviz-row-total" data-value-mdl={d.totalMdl}>
                    {formatMoney(d.totalMdl)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {open ? (
        <Card>
          <CardHeader
            title={`Linii deviz - versiunea ${open.version}`}
            hint="Prețul ofertat este înghețat la momentul ofertării. Prețul curent este cel de azi din catalog."
            right={
              canWrite && NEXT_STATUSES[open.status].length > 0 ? (
                <div className="flex gap-2">
                  {NEXT_STATUSES[open.status].map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant="secondary"
                      type="button"
                      disabled={busy}
                      data-testid={`deviz-status-${s}`}
                      onClick={() => run(() => setDevizStatus(open.id, projectId, s))}
                    >
                      {DEVIZ_STATUS_LABEL[s]}
                    </Button>
                  ))}
                </div>
              ) : null
            }
          />

          {pastValidity ? (
            <div
              className="mx-5 mt-4 rounded-md border border-rc-warn bg-rc-warn-soft px-4 py-3 text-[12.5px] text-rc-black"
              data-testid="deviz-expired-warning"
            >
              Valabilitatea acestui deviz a trecut la {formatDate(open.validUntil)}. Confirmă
              prețurile înainte să îl trimiți mai departe.
            </div>
          ) : null}

          {message ? (
            <div
              className="mx-5 mt-4 rounded-md border border-rc-danger px-4 py-3 text-[12.5px] text-rc-danger"
              data-testid="deviz-message"
            >
              {message}
            </div>
          ) : null}

          {open.lines.length === 0 ? (
            <EmptyState
              title="Nicio linie"
              hint="Adaugă produse din catalog ca să construiești estimarea."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th className="w-[30%]">Produs</Th>
                  <Th align="right">Cantitate</Th>
                  <Th>Unitate</Th>
                  <Th align="right">Preț ofertat</Th>
                  <Th align="right">Preț curent</Th>
                  <Th align="right">Diferență</Th>
                  <Th align="right">Total linie</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {open.lines.map((l) => (
                  <tr key={l.id} data-testid="deviz-line" data-sku={l.sku}>
                    <Td>
                      <span className="font-semibold text-rc-black">{l.productName}</span>
                      <span className="block text-[11.5px] text-rc-muted-2">{l.sku}</span>
                    </Td>
                    <Td align="right">
                      {editable && canWrite ? (
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          className="text-right rc-num w-24"
                          defaultValue={String(l.quantity)}
                          data-testid={`deviz-line-quantity-${l.sku}`}
                          disabled={busy}
                          onBlur={(e) => {
                            const next = e.currentTarget.value;
                            if (Number(next) === l.quantity) return;
                            run(() => updateDevizLineQuantity(l.id, projectId, next));
                          }}
                        />
                      ) : (
                        <span data-testid={`deviz-line-quantity-${l.sku}`}>
                          {formatNumber(l.quantity)}
                        </span>
                      )}
                    </Td>
                    {/* UNITATEA VINE DE PE PRODUS SI NU SE TASTEAZA. Migratia
                        0025 nu are coloana de unitate pe linie, exact ca sa nu
                        existe unde. */}
                    <Td data-testid={`deviz-line-unit-${l.sku}`}>{unitLabel(l.unit)}</Td>
                    <Td
                      align="right"
                      data-testid={`deviz-line-quoted-${l.sku}`}
                      data-value-mdl={l.quotedUnitPriceMdl}
                    >
                      {formatMoney(l.quotedUnitPriceMdl)}
                    </Td>
                    <Td
                      align="right"
                      data-testid={`deviz-line-current-${l.sku}`}
                      data-value-mdl={l.currentUnitPriceMdl}
                    >
                      {formatMoney(l.currentUnitPriceMdl)}
                    </Td>
                    <Td
                      align="right"
                      data-testid={`deviz-line-difference-${l.sku}`}
                      data-value-mdl={l.unitDifferenceMdl}
                    >
                      <span
                        className={
                          l.unitDifferenceMdl > 0
                            ? "text-rc-danger font-semibold"
                            : l.unitDifferenceMdl < 0
                              ? "text-rc-ok font-semibold"
                              : "text-rc-muted"
                        }
                      >
                        {l.unitDifferenceMdl > 0 ? "+" : ""}
                        {formatMoney(l.unitDifferenceMdl)}
                      </span>
                    </Td>
                    <Td
                      align="right"
                      data-testid={`deviz-line-total-${l.sku}`}
                      data-value-mdl={l.lineTotalMdl}
                    >
                      {formatMoney(l.lineTotalMdl)}
                    </Td>
                    <Td align="right">
                      {editable && canWrite ? (
                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            disabled={busy}
                            data-testid={`deviz-line-reprice-${l.sku}`}
                            className="text-[12px] text-rc-orange-deep hover:underline"
                            onClick={() => run(() => repriceDevizLine(l.id, projectId))}
                          >
                            Reevaluează
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            data-testid={`deviz-line-remove-${l.sku}`}
                            className="text-[12px] text-rc-danger hover:underline"
                            onClick={() => run(() => removeDevizLine(l.id, projectId))}
                          >
                            Șterge
                          </button>
                        </div>
                      ) : null}
                    </Td>
                  </tr>
                ))}

                <tr data-testid="deviz-subtotal" className="font-semibold">
                  <Td>Subtotal</Td>
                  <Td /><Td /><Td /><Td /><Td />
                  <Td align="right" data-value-mdl={open.subtotalMdl}>
                    {formatMoney(open.subtotalMdl)}
                  </Td>
                  <Td />
                </tr>
                <tr data-testid="deviz-adaos">
                  <Td>Adaos {formatNumber(open.marginPercent)}%</Td>
                  <Td /><Td /><Td /><Td /><Td />
                  <Td align="right" data-value-mdl={open.adaosMdl}>
                    {formatMoney(open.adaosMdl)}
                  </Td>
                  <Td />
                </tr>
                <tr data-testid="deviz-total" className="font-semibold">
                  <Td>Total</Td>
                  <Td /><Td /><Td /><Td /><Td />
                  <Td align="right" data-value-mdl={open.totalMdl}>
                    {formatMoney(open.totalMdl)}
                  </Td>
                  <Td />
                </tr>
              </tbody>
            </Table>
          )}

          {editable && canWrite ? (
            <div className="px-5 py-4 border-t border-rc-line" data-testid="deviz-add-line">
              <div className="grid grid-cols-[1fr_140px_auto] gap-3 items-end">
                <Field label="Produs">
                  <div data-testid="deviz-add-product">
                    <Combobox
                      options={productOptions}
                      value={productId}
                      onChange={setProductId}
                      placeholder="Caută produsul din catalog"
                      emptyLabel="Niciun produs"
                    />
                  </div>
                </Field>
                <Field label="Cantitate">
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    className="text-right rc-num"
                    value={quantity}
                    data-testid="deviz-add-quantity"
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </Field>
                <Button
                  type="button"
                  disabled={busy}
                  data-testid="deviz-add-submit"
                  onClick={async () => {
                    const ok = await run(() =>
                      addDevizLine({ devizId: open.id, projectId, productId, quantity }),
                    );
                    if (ok) {
                      setProductId("");
                      setQuantity("");
                    }
                  }}
                >
                  Adaugă linia
                </Button>
              </div>
              {/* PRETUL NU ESTE UN CAMP AICI, si asta este cardul. Se citeste
                  din catalog in momentul salvarii si se scrie pe linie. */}
              <p className="mt-2 text-[11.5px] text-rc-muted-2">
                Prețul se preia din catalog în momentul adăugării și rămâne înghețat pe linie.
              </p>
            </div>
          ) : (
            <div
              className="px-5 py-4 border-t border-rc-line text-[12.5px] text-rc-muted"
              data-testid="deviz-locked"
            >
              {open.status === "draft"
                ? "Doar administratorul poate modifica devizele."
                : `Devizul este ${DEVIZ_STATUS_LABEL[open.status]} și nu mai poate fi modificat. Creează o versiune nouă.`}
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
