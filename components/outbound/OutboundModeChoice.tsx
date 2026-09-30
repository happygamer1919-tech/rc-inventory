"use client";

// P3-119 clauza 1, hotararea R-215. ALEGEREA VINE PRIMA, PE FORMULARUL DE IESIRE
// NOUA: "Tip ieșire", cu exact doua opțiuni, si "Proiect" implicit.
//
// DE CE UN COMPONENT SI NU CATEVA RANDURI IN FIECARE FORMULAR. Alegerea se vede
// deasupra amandurora, deci ar fi fost scrisa de doua ori, iar doua copii ale
// aceluiasi rand de interfata sunt doua locuri in care eticheta se poate abate.
// Cuvintele nu se scriu nici aici: ele vin din OUTBOUND_MODE_LABEL, care sta in
// lib/data/outbound-types.ts langa etichetele de status, fiindca si cardul P3-120
// are nevoie de ele pentru liste.
//
// DOUA BUTOANE DE RADIO SI NU O LISTA DERULANTA. Opțiunile sunt doua si amandoua
// se citesc dintr-o privire; o lista derulanta ar ascunde jumatate din alegere
// sub un clic. Sunt butoane de radio ADEVARATE, <input type="radio"> intr-un
// <fieldset> cu <legend>, si nu <div>-uri cu onClick: tastatura le muta cu
// sagetile fara nicio linie de cod, si un cititor de ecran anunta "1 din 2".
//
// ALEGEREA NU ESTE DEZACTIVATA CAT TIMP SE TRIMITE. Trimiterea schimba formularul
// pe confirmare, iar confirmarea nu arata alegerea deloc, deci nu exista o stare
// in care o alegere schimbata ar ajunge la o cerere deja plecata.

import * as React from "react";
import { Card, CardHeader } from "@/components/ui/primitives";
import { ALL_OUTBOUND_MODES } from "@/lib/data/outbound-mode";
import { OUTBOUND_MODE_LABEL } from "@/lib/data/outbound-types";
import type { OutboundMode } from "@/lib/data/outbound-types";
import { PHONE_TAP } from "@/components/ui/phone";

/** Ce spune fiecare opțiune sub eticheta ei, ca operatorul sa nu ghiceasca. */
const HINT: Record<OutboundMode, string> = {
  project: "Materialul pleacă spre un șantier al unui client.",
  direct_client: "Cumpărătorul ridică materialul de la depozit, fără șantier.",
};

export function OutboundModeChoice({
  value,
  onChange,
}: {
  value: OutboundMode;
  onChange: (mode: OutboundMode) => void;
}) {
  return (
    <Card>
      <CardHeader title="Tip ieșire" hint="Ce fel de eliberare este aceasta" />
      {/* fieldset FARA marginile lui implicite, ca sa arate exact ca restul
          cardurilor. Legenda este ascunsa vizual si nu cu display none: un
          cititor de ecran are nevoie de ea, iar titlul cardului o spune deja
          celui care vede. */}
      <fieldset className="p-5 m-0 border-0" data-testid="field-issue-mode">
        <legend className="sr-only">Tip ieșire</legend>
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          {/* LISTA MODURILOR VINE DIN ALL_OUTBOUND_MODES si nu este scrisa aici,
              acelasi motiv pentru care unitatile vin din ALL_UNITS: un mod adaugat
              mai tarziu apare pe ecran fara sa fie nevoie de o a doua editare. */}
          {ALL_OUTBOUND_MODES.map((mode) => {
            const chosen = value === mode;
            return (
              <label
                key={mode}
                data-testid={`issue-mode-option-${mode}`}
                className={[
                  "flex items-start gap-3 rounded-[10px] border px-4 py-3 cursor-pointer transition-colors",
                  PHONE_TAP,
                  chosen
                    ? "border-rc-orange bg-rc-orange-soft"
                    : "border-rc-line-strong bg-white hover:bg-rc-paper",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="issue-mode"
                  value={mode}
                  checked={chosen}
                  onChange={() => onChange(mode)}
                  data-testid={`issue-mode-${mode}`}
                  className="mt-0.5 h-4 w-4 accent-rc-orange"
                />
                <span className="block min-w-0">
                  <span className="block text-[13.5px] font-semibold text-rc-black">
                    {OUTBOUND_MODE_LABEL[mode]}
                  </span>
                  <span className="block text-[12px] text-rc-muted mt-0.5">{HINT[mode]}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </Card>
  );
}
