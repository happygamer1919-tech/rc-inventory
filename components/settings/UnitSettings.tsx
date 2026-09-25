// Unitatile de masura. Doar vizualizare, si asta este o decizie, nu o lipsa.
//
// Setul este fixat de enumul unit_code din migratia 0001. O unitate noua
// inseamna o migratie numerotata, nu un rand introdus dintr-un ecran, pentru ca
// fiecare cantitate stocata este interpretata prin unitatea produsului ei.
// Ecranul spune asta pe fata, ca nimeni sa nu caute butonul care lipseste.

import { PHONE_CELL, PHONE_ROW, PHONE_TABLE, PHONE_WIDE } from "@/components/ui/phone";
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
  // P3-102, constatarea F23 a lui Ivan. Adaugata de migratiile 0061 si 0062.
  //
  // TIPUL A CERUT SI ACEST RAND, exact ca la t si l mai sus, si din acelasi motiv:
  // UNIT_MEANING este Record<UnitCode, string>, deci extinderea enumului a facut
  // fisierul sa nu compileze pana cand cineva a spus la ce se foloseste unitatea
  // noua. Nu este un deranj, este proprietatea pe care o promite comentariul de
  // deasupra fisierului.
  //
  // CANTITATEA ESTE NUMARUL DE SETURI, nu numarul de bucati dinauntru. Un card
  // care ar vrea altceva ar fi un card despre conversii, si acela ar trebui sa
  // spuna ce se intampla cu tot ce este deja salvat.
  set: "Set, pentru articole livrate ambalat ca un tot, de exemplu o cutie de șuruburi vândută la set",
};

// P3-67. PE TELEFON (sub 768px) fiecare unitate devine un card, iar peste 768px
// nimic nu se schimba: fiecare clasa de mai jos poarta max-md. ACELASI DOM, ca in
// P3-64. Eticheta fiecarei celule este textul antetului coloanei ei, pus in
// data-label si desenat din CSS.
//
// P3-100. Cele patru nume erau scrise aici, cuvant cu cuvant identice cu cele din
// components/ui/phone.ts, deci copia a fost stearsa si se importa. Nimic nu se
// schimba pe ecran.

export function UnitSettings({ rows }: { rows: Array<{ unit: UnitCode; count: number }> }) {
  return (
    <Card className={PHONE_TABLE}>
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
            <tr key={r.unit} data-testid="unit-row" data-unit={r.unit} className={PHONE_ROW}>
              <Td data-label="Unitate" className={PHONE_CELL}>
                <span className="text-[13.5px] font-semibold text-rc-black">
                  {unitLabel(r.unit)}
                </span>
              </Td>
              <Td data-label="Se folosește pentru" className={PHONE_WIDE}>
                <span className="text-[12.5px] text-rc-muted">{UNIT_MEANING[r.unit]}</span>
              </Td>
              <Td align="right" data-label="Produse" className={PHONE_CELL}>
                <span className="rc-num text-[13px] text-rc-muted">{r.count}</span>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
