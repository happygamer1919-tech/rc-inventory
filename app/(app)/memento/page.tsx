// P2-06 Memento, pe date reale.
//
// Doua jumatati, ca in faza 1: pragurile per produs cu stocul curent alaturi, si
// lista alertelor declansate.
//
// CE FACE ACEST CARD SI CE NU. P2-06 scoate stratul demonstrativ din tot
// depozitul de cod, deci ecranul citeste acum praguri si stocuri reale. TRIMITEREA
// mesajelor si armarea alertelor apartin cardului P2-10, care detine regula "un
// email pe produs pe traversare". Pana atunci lista alertelor este goala si
// ecranul spune de ce, in loc sa arate alerte demonstrative care nu au fost
// niciodata trimise.

import { Card, CardHeader, Chip, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { loadThresholds } from "@/lib/data/dashboard";
import { formatNumber, formatQty } from "@/lib/data/format";
import { unitLabel } from "@/lib/data/units";

export const dynamic = "force-dynamic";

export default async function RemindersPage() {
  const products = await loadThresholds();
  const low = products.filter((p) => p.stock <= p.threshold);

  return (
    <>
      <PageHeader
        title="Memento stoc"
        lead="Pragul de recomandă al fiecărui produs și stocul curent alături. Alertele se trimit din P2-10."
        actions={<Chip tone="warn">{low.length} sub prag</Chip>}
      />

      <Card className="mb-5">
        <CardHeader
          title="Praguri per produs"
          hint="Pragul se editează în fișa produsului, din Inventar"
          right={
            <span className="text-[12.5px] text-rc-muted" data-testid="threshold-count">
              {products.length} produse
            </span>
          }
        />
        <Table>
          <thead>
            <tr>
              <Th>Produs</Th>
              <Th>Categorie</Th>
              <Th align="right">Stoc curent</Th>
              <Th align="right">Prag</Th>
              <Th align="right">Stare</Th>
            </tr>
          </thead>
          <tbody data-testid="threshold-rows">
            {products.map((p) => {
              const under = p.stock <= p.threshold;
              return (
                <tr key={p.id} data-testid="threshold-row" data-sku={p.sku}>
                  <Td>
                    <span className="text-[13.5px] font-medium text-rc-black">{p.name}</span>
                    <span className="block rc-num text-[11.5px] text-rc-muted-2 mt-0.5">
                      {p.sku}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-[12.5px] text-rc-muted">{p.category}</span>
                  </Td>
                  <Td align="right">
                    <span
                      className={[
                        "rc-num text-[13px] font-semibold whitespace-nowrap",
                        under ? "text-rc-warn" : "text-rc-black",
                      ].join(" ")}
                    >
                      {formatQty(p.stock, p.unit)}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="rc-num text-[13px] text-rc-muted whitespace-nowrap">
                      {formatNumber(p.threshold)} {unitLabel(p.unit)}
                    </span>
                  </Td>
                  <Td align="right">
                    {p.stock === 0 ? (
                      <Chip tone="danger">Epuizat</Chip>
                    ) : under ? (
                      <Chip tone="warn">Sub prag</Chip>
                    ) : (
                      <Chip tone="ok">Suficient</Chip>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        {products.length === 0 ? (
          <p
            className="px-5 py-12 text-center text-[13px] text-rc-muted"
            data-testid="threshold-empty"
          >
            Catalogul este gol. Adaugă produse în Inventar ca să existe praguri de urmărit.
          </p>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="Alerte declanșate"
          hint="Emailurile trimise când un produs a coborât sub prag"
          right={<Chip tone="neutral">Se activează la P2-10</Chip>}
        />
        <p
          className="px-5 py-10 text-center text-[13px] text-rc-muted"
          data-testid="alerts-empty"
        >
          Nicio alertă trimisă. Trimiterea prin email se construiește la cardul P2-10; până atunci
          ecranul arată pragurile, nu pretinde că a trimis ceva.
        </p>
      </Card>
    </>
  );
}
