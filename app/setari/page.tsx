"use client";

// RC-10 Setari.
//
// Doar substitut. Clientul trebuie sa vada ca sistemul stie ce sunt categoriile
// si unitatile de masura si ca ar putea sa i le dea in administrare, fara ca
// faza 1 sa pretinda ca implementeaza editarea. Nimic de aici nu se salveaza si
// ecranul spune asta.

import {
  Card,
  CardHeader,
  Chip,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import { ALL_UNITS, CATEGORIES, unitLabel } from "@/lib/mock";
import { useStore } from "@/lib/store";

const UNIT_MEANING: Record<string, string> = {
  m2: "Suprafață, pentru învelitori, plăci și placaje",
  lm: "Metru liniar, pentru profile, jgheaburi și coame",
  buc: "Bucată, pentru accesorii numărabile",
  sac: "Sac, pentru mortare, adezivi și tencuieli",
  kg: "Kilogram, pentru materiale vrac",
  rola: "Rolă, pentru izolații livrate rulou",
  m3: "Volum, pentru izolații în vrac",
};

export default function SettingsPage() {
  const store = useStore();

  const perCategory = CATEGORIES.map((c) => ({
    name: c,
    count: store.products.filter((p) => p.category === c).length,
  }));
  const perUnit = ALL_UNITS.map((u) => ({
    unit: u,
    count: store.products.filter((p) => p.unit === u).length,
  }));

  return (
    <>
      <PageHeader
        title="Setări"
        lead="Ce știe sistemul despre categorii și unități de măsură. În faza 1 lista este doar vizibilă, nu se editează."
        actions={<Chip tone="neutral">Doar vizualizare</Chip>}
      />

      <div className="grid grid-cols-2 gap-4 items-start">
        <Card>
          <CardHeader
            title="Categorii de produse"
            hint="Grupează catalogul și alimentează filtrul din Inventar"
            right={<span className="text-[12px] text-rc-muted">{CATEGORIES.length}</span>}
          />
          <Table>
            <thead>
              <tr>
                <Th>Categorie</Th>
                <Th align="right">Produse</Th>
              </tr>
            </thead>
            <tbody>
              {perCategory.map((c) => (
                <tr key={c.name}>
                  <Td>
                    <span className="text-[13px] font-medium text-rc-black">{c.name}</span>
                  </Td>
                  <Td align="right">
                    <span className="rc-num text-[13px] text-rc-muted">{c.count}</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader
            title="Unități de măsură"
            hint="Fiecare produs are exact una, fixată la nivel de produs"
            right={<span className="text-[12px] text-rc-muted">{ALL_UNITS.length}</span>}
          />
          <Table>
            <thead>
              <tr>
                <Th>Unitate</Th>
                <Th>Folosită pentru</Th>
                <Th align="right">Produse</Th>
              </tr>
            </thead>
            <tbody>
              {perUnit.map((u) => (
                <tr key={u.unit}>
                  <Td>
                    <span className="inline-flex items-center px-2 py-1 rounded-[7px] bg-rc-paper border border-rc-line text-[12.5px] font-semibold text-rc-black">
                      {unitLabel(u.unit)}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-[12.5px] text-rc-muted">{UNIT_MEANING[u.unit]}</span>
                  </Td>
                  <Td align="right">
                    <span className="rc-num text-[13px] text-rc-muted">{u.count}</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Configurația acestei faze" hint="Ce este fixat și ce urmează" />
        <div className="px-5 py-4 grid grid-cols-3 gap-5">
          {[
            {
              t: "Un singur depozit",
              d: "Tot stocul este în Depozitul central. Nu există coloană de locație nicăieri în aplicație.",
            },
            {
              t: "Un singur utilizator",
              d: "Fără autentificare și fără roluri. Toate acțiunile sunt înregistrate pe Operator.",
            },
            {
              t: "Monede",
              d: "Comenzile sunt în EUR sau RON, iar valoarea în MDL este stocată ca număr. Nu există sursă de curs valutar.",
            },
          ].map((x) => (
            <div key={x.t}>
              <p className="text-[13px] font-semibold text-rc-black">{x.t}</p>
              <p className="text-[12.5px] text-rc-muted mt-1 leading-relaxed">{x.d}</p>
            </div>
          ))}
        </div>
        <div className="px-5 py-3.5 bg-rc-paper border-t border-rc-line">
          <p className="text-[12px] text-rc-muted leading-relaxed">
            Programat pentru faza 2: administrarea categoriilor și a unităților, recepții și
            expedieri parțiale, mai multe depozite, utilizatori cu roluri, trimiterea reală a
            alertelor și păstrarea datelor între sesiuni.
          </p>
        </div>
      </Card>
    </>
  );
}
