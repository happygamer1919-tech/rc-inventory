// Unitatile de masura. Doar vizualizare, si asta este o decizie, nu o lipsa.
//
// Setul este fixat de enumul unit_code din migratia 0001. O unitate noua
// inseamna o migratie numerotata, nu un rand introdus dintr-un ecran, pentru ca
// fiecare cantitate stocata este interpretata prin unitatea produsului ei.
// Ecranul spune asta pe fata, ca nimeni sa nu caute butonul care lipseste.

import { Card, CardHeader, Chip, Table, Td, Th } from "@/components/ui/primitives";
import { unitLabel, type UnitCode } from "@/lib/data/units";

const UNIT_MEANING: Record<UnitCode, string> = {
  m2: "Suprafață, pentru învelitori, plăci și placaje",
  lm: "Metru liniar, pentru profile, jgheaburi și coame",
  pcs: "Bucată, pentru accesorii numărabile",
  bag: "Sac, pentru mortare, adezivi și tencuieli",
  kg: "Kilogram, pentru materiale vrac",
  roll: "Rolă, pentru izolații livrate rulou",
  m3: "Volum, pentru izolații în vrac",
  // P3-33. Adaugate de migratia 0030.
  //
  // TIPUL A CERUT ACESTE DOUA RANDURI SI ASTA ESTE O PROPRIETATE, NU UN
  // DERANJ. UNIT_MEANING este Record<UnitCode, string>, deci extinderea
  // enumului a facut acest fisier sa nu compileze pana cand cineva a spus la
  // ce se foloseste fiecare unitate noua. Un Partial aici ar fi lasat ecranul
  // sa afiseze o unitate fara explicatie si nimic nu ar fi observat.
  t: "Tonă, pentru materiale vrac livrate la camion",
  l: "Litru, pentru vopsele, lacuri și solvenți",
};

export function UnitSettings({ rows }: { rows: Array<{ unit: UnitCode; count: number }> }) {
  return (
    <Card>
      <CardHeader
        title="Unități de măsură"
        hint="Fiecare produs are exact o unitate, fixată la crearea produsului."
        right={<Chip tone="neutral">Doar vizualizare</Chip>}
      />
      <p className="px-5 pt-4 text-[12.5px] text-rc-muted">
        Lista este fixată în structura bazei de date. O unitate nouă se adaugă printr-o
        migrație, nu din acest ecran, pentru că fiecare cantitate salvată este citită
        prin unitatea produsului ei.
      </p>
      <Table>
        <thead>
          <tr>
            <Th>Unitate</Th>
            <Th>Se folosește pentru</Th>
            <Th align="right">Produse</Th>
          </tr>
        </thead>
        <tbody data-testid="unit-rows">
          {rows.map((r) => (
            <tr key={r.unit} data-testid="unit-row" data-unit={r.unit}>
              <Td>
                <span className="text-[13.5px] font-semibold text-rc-black">
                  {unitLabel(r.unit)}
                </span>
              </Td>
              <Td>
                <span className="text-[12.5px] text-rc-muted">{UNIT_MEANING[r.unit]}</span>
              </Td>
              <Td align="right">
                <span className="rc-num text-[13px] text-rc-muted">{r.count}</span>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
