// Memento, pe date reale.
//
// Doua jumatati, ca in faza 1: pragurile per produs cu stocul curent alaturi, si
// lista alertelor declansate.
//
// P2-06 a facut prima jumatate reala. P2-10 face a doua: alertele de mai jos
// sunt randuri din reminders care au incercat macar o data sa trimita un email,
// cu momentul, stocul si pragul din clipa aceea. Un esec de trimitere se vede
// AICI, cu motivul lui, fiindca miscarea de stoc s-a scris oricum si operatorul
// trebuie sa afle ca emailul nu a plecat.

import { Card, CardHeader, Chip, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { loadThresholds } from "@/lib/data/dashboard";
import { listFiredAlerts } from "@/lib/data/reminders";
import { formatNumber, formatQty, plural } from "@/lib/data/format";
import { unitLabel } from "@/lib/data/units";

export const dynamic = "force-dynamic";

/** Data si ora, pentru randurile de alerta. */
function formatMoment(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function RemindersPage() {
  const [products, alerts] = await Promise.all([loadThresholds(), listFiredAlerts()]);
  const low = products.filter((p) => p.stock <= p.threshold);
  const failed = alerts.filter((a) => a.sendError !== null);

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
          hint="Emailurile trimise când un produs a coborât sub prag. Unul singur pe traversare, rearmat când stocul urcă înapoi peste prag."
          right={
            failed.length > 0 ? (
              <Chip tone="danger">{plural(failed.length, "trimitere eșuată", "trimiteri eșuate")}</Chip>
            ) : (
              <Chip tone="neutral">{plural(alerts.length, "alertă", "alerte")}</Chip>
            )
          }
        />
        {alerts.length === 0 ? (
          <p
            className="px-5 py-10 text-center text-[13px] text-rc-muted"
            data-testid="alerts-empty"
          >
            Nicio alertă trimisă. Se trimite un email când o mișcare de stoc coboară un produs sub
            pragul lui.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Produs</Th>
                <Th>Trimis</Th>
                <Th align="right">Stoc la trimitere</Th>
                <Th align="right">Prag</Th>
                <Th align="right">Stare</Th>
              </tr>
            </thead>
            <tbody data-testid="alert-rows">
              {alerts.map((a) => (
                <tr key={a.id} data-testid="alert-row" data-sku={a.sku}>
                  <Td>
                    <span className="text-[13.5px] font-medium text-rc-black">{a.name}</span>
                    <span className="block rc-num text-[11.5px] text-rc-muted-2 mt-0.5">{a.sku}</span>
                  </Td>
                  <Td>
                    <span className="rc-num text-[12.5px] text-rc-muted whitespace-nowrap">
                      {formatMoment(a.firedAt)}
                    </span>
                    {a.sendError ? (
                      <span
                        className="block text-[11.5px] text-rc-danger mt-0.5"
                        data-testid="alert-error"
                      >
                        {a.sendError}
                      </span>
                    ) : null}
                  </Td>
                  <Td align="right">
                    <span className="rc-num text-[13px] font-semibold text-rc-warn whitespace-nowrap">
                      {formatQty(a.stockAtFire, a.unit)}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="rc-num text-[13px] text-rc-muted whitespace-nowrap">
                      {formatNumber(a.thresholdAtFire)} {unitLabel(a.unit)}
                    </span>
                  </Td>
                  <Td align="right">
                    {a.sendError ? (
                      <Chip tone="danger">Netrimis</Chip>
                    ) : (
                      <Chip tone="ok">Trimis</Chip>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
