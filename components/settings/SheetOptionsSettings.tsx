"use client";

// P3-68. Administrarea listei de tabla si tigla metalica: adaugare, pret, retragere.
//
// NU EXISTA STERGERE, si nu din lipsa de timp. Un produs care poarta o combinatie o
// refera printr-o cheie straina, iar istoricul lui trebuie sa ramana de citit. O
// combinatie pe care Rapid Construct nu o mai vinde se RETRAGE: nu se mai ofera la un
// produs nou, iar butonul Reactivează o aduce inapoi.
//
// PRETUL ESTE AL LINIEI, nu al randului. Doua profile pot imparti o linie de pret
// (PK/PS-20 si VP-20), iar randul spune asta langa pret, ca o modificare sa nu
// surprinda pe nimeni.

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardHeader,
  Chip,
  EmptyState,
  Field,
  Input,
  Select,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import {
  createSheetOption,
  setSheetOptionRetired,
  setSheetPrice,
  type SheetActionResult,
} from "@/lib/data/sheet-options-actions";
import {
  thicknessLabel,
  type SheetOptionAdminRow,
  type SheetOptionInput,
} from "@/lib/data/sheet-options-types";
import { unitLabel, type UnitCode } from "@/lib/data/units";
import { plural } from "@/lib/data/format";

const EMPTY_INPUT: SheetOptionInput = {
  model: "",
  series: "",
  thicknessMm: "",
  finish: "",
  unit: "m2",
  priceGroup: "",
  priceLei: "",
};

function rowKey(row: Pick<SheetOptionAdminRow, "model" | "series" | "thicknessMm" | "finish">): string {
  return `${row.model}|${row.series}|${row.thicknessMm}|${row.finish}`;
}

/** "144" devine "144 lei", "233.5" devine "233,5 lei". */
function priceText(priceLei: string): string {
  return `${priceLei.replace(".", ",")} lei`;
}

export function SheetOptionsSettings({
  active,
  writable,
  rows,
  units,
}: {
  active: boolean;
  writable: boolean;
  rows: SheetOptionAdminRow[];
  units: UnitCode[];
}) {
  const router = useRouter();
  const [input, setInput] = React.useState<SheetOptionInput>(EMPTY_INPUT);
  const [addError, setAddError] = React.useState<string | null>(null);
  const [addDone, setAddDone] = React.useState<string | null>(null);
  const [rowError, setRowError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [modelFilter, setModelFilter] = React.useState("");
  const [editingKey, setEditingKey] = React.useState<string | null>(null);
  const [editingPrice, setEditingPrice] = React.useState("");

  const models = React.useMemo(() => [...new Set(rows.map((r) => r.model))], [rows]);
  const shown = modelFilter ? rows.filter((r) => r.model === modelFilter) : rows;
  const retiredCount = rows.filter((r) => r.retired).length;

  if (!active) {
    return (
      <Card className="mb-5">
        <EmptyState
          title="Lista de modele nu este încă activă."
          hint="Apare aici imediat ce baza de date este actualizată."
        />
      </Card>
    );
  }

  function field<K extends keyof SheetOptionInput>(key: K, value: SheetOptionInput[K]) {
    setInput((current) => ({ ...current, [key]: value }));
    setAddDone(null);
  }

  async function onAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAddError(null);
    setAddDone(null);
    setPending(true);
    const result = await createSheetOption(input);
    setPending(false);
    if (!result.ok) {
      setAddError(result.message);
      router.refresh();
      return;
    }
    setAddDone(`Combinația ${input.model.trim()} ${input.series.trim()} a fost adăugată.`);
    setModelFilter(models.includes(input.model.trim()) ? input.model.trim() : "");
    setInput((current) => ({ ...EMPTY_INPUT, unit: current.unit }));
    router.refresh();
  }

  async function runRowAction(action: () => Promise<SheetActionResult>) {
    setRowError(null);
    setPending(true);
    const result = await action();
    setPending(false);
    if (!result.ok) {
      setRowError(result.message);
      return false;
    }
    router.refresh();
    return true;
  }

  async function onSavePrice(row: SheetOptionAdminRow) {
    const saved = await runRowAction(() =>
      setSheetPrice(
        {
          priceGroup: row.priceGroup,
          series: row.series,
          thicknessMm: row.thicknessMm,
          finish: row.finish,
        },
        editingPrice,
      ),
    );
    if (saved) setEditingKey(null);
  }

  return (
    <>
      {writable ? (
        <Card className="mb-5">
          <CardHeader
            title="Combinație nouă"
            hint="Se adaugă la capătul listei și se oferă imediat pe formularul de produs."
          />
          <form onSubmit={onAdd} className="px-5 py-4" data-testid="sheet-add-form">
            <div className="grid grid-cols-4 gap-3 max-md:grid-cols-1">
              <Field label="Model" required>
                <Input
                  value={input.model}
                  onChange={(e) => field("model", e.target.value)}
                  placeholder="C-10"
                  data-testid="sheet-add-model"
                />
              </Field>
              <Field label="Serie" required>
                <Input
                  value={input.series}
                  onChange={(e) => field("series", e.target.value)}
                  placeholder="Standart Zn"
                  data-testid="sheet-add-series"
                />
              </Field>
              <Field label="Grosime (mm)" required>
                <Input
                  value={input.thicknessMm}
                  onChange={(e) => field("thicknessMm", e.target.value)}
                  placeholder="0,45"
                  inputMode="decimal"
                  data-testid="sheet-add-thickness"
                />
              </Field>
              <Field label="Finisaj" hint="Gol când lista nu numește unul.">
                <Input
                  value={input.finish}
                  onChange={(e) => field("finish", e.target.value)}
                  placeholder="Cr matt"
                  data-testid="sheet-add-finish"
                />
              </Field>
              <Field label="Unitate" required>
                <Select
                  value={input.unit}
                  onChange={(e) => field("unit", e.target.value)}
                  data-testid="sheet-add-unit"
                >
                  {units.map((u) => (
                    <option key={u} value={u}>
                      {unitLabel(u)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Grup de preț"
                hint="Gol înseamnă același text ca modelul. Profilele cu același grup împart prețul."
              >
                <Input
                  value={input.priceGroup}
                  onChange={(e) => field("priceGroup", e.target.value)}
                  placeholder={input.model.trim() || "PK/PS-20, VP-20"}
                  data-testid="sheet-add-price-group"
                />
              </Field>
              <Field label="Preț (lei)" hint="Opțional. Un preț deja existent pe linie se schimbă din tabel.">
                <Input
                  value={input.priceLei}
                  onChange={(e) => field("priceLei", e.target.value)}
                  placeholder="144"
                  inputMode="decimal"
                  data-testid="sheet-add-price"
                />
              </Field>
              <div className="flex items-end">
                <Button type="submit" disabled={pending} data-testid="sheet-add-submit">
                  {pending ? "Se adaugă..." : "Adaugă combinația"}
                </Button>
              </div>
            </div>
          </form>
          {addError ? (
            <p
              role="alert"
              data-testid="sheet-add-error"
              className="mx-5 mb-4 rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
            >
              {addError}
            </p>
          ) : null}
          {addDone ? (
            <p
              role="status"
              data-testid="sheet-add-done"
              className="mx-5 mb-4 rounded-[10px] border border-rc-ok/25 bg-rc-ok-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
            >
              {addDone}
            </p>
          ) : null}
        </Card>
      ) : (
        <p
          role="status"
          data-testid="sheet-admin-readonly"
          className="mb-5 rounded-[10px] border border-rc-warn/25 bg-rc-warn-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
        >
          Modificarea listei nu este încă activă. Lista se poate citi; adăugarea, prețurile și retragerea
          apar imediat ce baza de date este actualizată.
        </p>
      )}

      <Card className="mb-5">
        <CardHeader
          title="Combinații"
          hint="Grupate după model și serie, în ordinea listei."
          right={
            <div className="flex items-center gap-3">
              <span className="text-[12.5px] text-rc-muted" data-testid="sheet-option-count">
                {plural(rows.length, "combinație", "combinații")}
                {retiredCount > 0 ? `, ${plural(retiredCount, "retrasă", "retrase")}` : ""}
              </span>
              <Select
                value={modelFilter}
                onChange={(e) => setModelFilter(e.target.value)}
                className="w-48"
                aria-label="Model"
                data-testid="sheet-model-filter"
              >
                <option value="">Toate modelele</option>
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
          }
        />

        {rowError ? (
          <p
            role="alert"
            data-testid="sheet-admin-error"
            className="mx-5 mt-4 rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
          >
            {rowError}
          </p>
        ) : null}

        <Table>
          <thead>
            <tr>
              <Th>Serie</Th>
              <Th>Grosime</Th>
              <Th>Finisaj</Th>
              <Th>Unitate</Th>
              <Th align="right">Preț</Th>
              <Th>Stare</Th>
              {writable ? <Th align="right">Acțiuni</Th> : null}
            </tr>
          </thead>
          <tbody data-testid="sheet-option-rows">
            {shown.map((row, index) => {
              const previous = shown[index - 1];
              const newModel = !previous || previous.model !== row.model;
              const newSeries = newModel || previous.series !== row.series;
              const key = rowKey(row);
              const editing = editingKey === key;
              return (
                <React.Fragment key={key}>
                  {newModel ? (
                    <tr data-testid="sheet-model-group" data-model={row.model}>
                      <Td
                        colSpan={writable ? 7 : 6}
                        className="bg-rc-paper text-[13.5px] font-semibold text-rc-black"
                      >
                        {row.model}
                      </Td>
                    </tr>
                  ) : null}
                  <tr
                    data-testid="sheet-option-row"
                    data-model={row.model}
                    data-series={row.series}
                    data-thickness={row.thicknessMm}
                    data-finish={row.finish}
                    data-retired={row.retired ? "true" : "false"}
                    className={row.retired ? "text-rc-muted" : undefined}
                  >
                    <Td>{newSeries ? <span className="font-medium">{row.series}</span> : null}</Td>
                    <Td>
                      <span className="rc-num">{thicknessLabel(row.thicknessMm)}</span>
                    </Td>
                    <Td>{row.finish || <span className="text-rc-muted-2">fără</span>}</Td>
                    <Td>{unitLabel(row.unit)}</Td>
                    <Td align="right">
                      {editing ? (
                        <Input
                          value={editingPrice}
                          onChange={(e) => setEditingPrice(e.target.value)}
                          inputMode="decimal"
                          className="w-28 text-right"
                          aria-label="Preț (lei)"
                          data-testid="sheet-option-price-input"
                          autoFocus
                        />
                      ) : (
                        <span className="rc-num" data-testid="sheet-option-price">
                          {row.priceLei !== null ? priceText(row.priceLei) : "fără preț"}
                        </span>
                      )}
                      {row.priceLineShares > 1 ? (
                        <span className="block text-[11.5px] text-rc-muted" data-testid="sheet-option-price-shared">
                          același preț pentru {row.priceLineShares} combinații ({row.priceGroup})
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      {row.retired ? <Chip tone="neutral">Retrasă</Chip> : <Chip tone="ok">Oferită</Chip>}
                    </Td>
                    {writable ? (
                      <Td align="right">
                        {editing ? (
                          <span className="inline-flex gap-1.5">
                            <Button
                              size="sm"
                              onClick={() => onSavePrice(row)}
                              disabled={pending}
                              data-testid="sheet-option-price-save"
                            >
                              Salvează
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingKey(null)}>
                              Renunță
                            </Button>
                          </span>
                        ) : (
                          <span className="inline-flex gap-1.5">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setRowError(null);
                                setEditingKey(key);
                                setEditingPrice(row.priceLei?.replace(".", ",") ?? "");
                              }}
                              disabled={pending}
                              data-testid="sheet-option-price-edit"
                            >
                              Modifică prețul
                            </Button>
                            {row.retired ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => runRowAction(() => setSheetOptionRetired(row, false))}
                                disabled={pending}
                                data-testid="sheet-option-reactivate"
                              >
                                Reactivează
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => runRowAction(() => setSheetOptionRetired(row, true))}
                                disabled={pending}
                                data-testid="sheet-option-retire"
                              >
                                Retrage
                              </Button>
                            )}
                          </span>
                        )}
                      </Td>
                    ) : null}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </Table>

        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-rc-muted" data-testid="sheet-option-empty">
            Nicio combinație încă. Adaugă prima combinație din formularul de mai sus.
          </p>
        ) : null}
      </Card>
    </>
  );
}
