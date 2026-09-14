"use client";

// Clienti, ecranul de lista. Cardul P3-06.
//
// CINCI COLOANE SI NICI UNA IN PLUS: Denumire, Tip, Telefon, Proiecte active,
// Stare. Adresa, emailul, IDNO-ul si notele sunt detaliu, nu lista. Doctrina de
// densitate spune exact asta si nu se negociaza per ecran: o lista arata cel mai
// mic set de coloane care lasa un om sa aleaga un rand.
//
// FIECARE FILTRU ESTE IN URL, deci o lista filtrata se poate trimite cuiva ca
// legatura si butonul de inapoi o reface intocmai. Un filtru care traieste numai
// in starea componentului este un ecran pe care nu il poti arata nimanui.
//
// FILTRAREA SE FACE PE SERVER, prin public.search_clients din migratia 0020.
// Componentul acesta nu filtreaza nimic in memorie: primeste pagina care i se
// cuvine si o deseneaza.
//
// P3-45. LEADURI ESTE O VEDERE A ACESTUI ECRAN, NU UN ECRAN NOU. `vedere=leaduri`
// arata fiecare client care nu este la etapa Client, `vedere=clienti` doar pe cei
// de la etapa Client, iar /clienti fara parametru arata in continuare fiecare rand,
// exact ca inainte. Vederea si etapa stau in URL, langa filtrele de pana acum, si
// NU in `stare`, care inseamna activ sau inactiv.
//
// In vederea Leaduri coloanele sunt Denumire, Interes, Etapă, Data de reluare,
// Telefon si Stare: tipul si proiectele active nu ajuta pe nimeni sa aleaga pe cine
// suna azi. Numerele pe etapa sunt un rand de cifre in cipuri, nu un al doilea tabel.
//
// P3-48. INTERES ESTE O COLOANA NUMAI A VEDERII LEADURI, imediat dupa Denumire:
// spune ce vrea omul, adica de ce il suni. Vederea Clienți si lista fara vedere isi
// pastreaza coloanele. Un text lung se taie pe un rand, cu textul intreg in title.

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  Card,
  CardHeader,
  Chip,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import {
  CLIENT_TYPE_LABEL,
  LEADURI_STAGES,
  type ClientListQuery,
  type ClientOwnerChoice,
  type ClientRow,
  type ClientStageCounts,
} from "@/lib/data/clients-types";
import { formatDate } from "@/lib/data/format";
import { ClientForm } from "./ClientForm";
import { LeaduriForm } from "./LeaduriForm";
import { StageMark } from "./StageMark";

export function ClientsScreen({
  rows,
  total,
  page,
  pageCount,
  query,
  canWrite,
  stageAvailable,
  leaduri,
}: {
  rows: ClientRow[];
  total: number;
  page: number;
  pageCount: number;
  query: ClientListQuery;
  canWrite: boolean;
  /** P3-43. Daca formularul de client nou poate oferi etapa. */
  stageAvailable: boolean;
  /** P3-45. Null cat timp migratia 0040 nu exista pe baza: atunci ecranul nu
   *  ofera vederile, cipurile si formularul de lead, exact ca inainte de card. */
  leaduri: { counts: ClientStageCounts; owners: ClientOwnerChoice[] } | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [q, setQ] = React.useState(query.q);
  const [creating, setCreating] = React.useState(false);
  const [creatingLead, setCreatingLead] = React.useState(false);

  // Casuta de cautare se scrie local si se trimite in URL cu intarziere. Fara
  // debounce, fiecare tasta ar fi o navigare si o interogare.
  React.useEffect(() => {
    if (q === query.q) return;
    const t = setTimeout(() => push({ q, pagina: "1" }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function push(patch: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`${pathname}?${next.toString()}`);
  }

  const filtered =
    query.q !== "" || query.type !== "" || query.status !== "active" || query.stage !== "";

  const inLeaduri = leaduri !== null && query.view === "leaduri";
  const leaduriTotal = leaduri
    ? LEADURI_STAGES.reduce((sum, s) => sum + leaduri.counts[s], 0)
    : 0;

  return (
    <>
      <PageHeader
        title={inLeaduri ? "Leaduri" : "Clienți"}
        lead="Beneficiarii, cu datele lor de contact și proiectele lor."
        actions={
          canWrite ? (
            <>
              {leaduri ? (
                <Button
                  variant="secondary"
                  onClick={() => setCreatingLead(true)}
                  data-testid="leaduri-new"
                >
                  Lead nou
                </Button>
              ) : null}
              <Button onClick={() => setCreating(true)} data-testid="client-new">
                Client nou
              </Button>
            </>
          ) : null
        }
      />

      <Card>
        <CardHeader
          title="Listă"
          hint={
            inLeaduri
              ? total === 1
                ? "1 lead"
                : `${total} leaduri`
              : total === 1
                ? "1 client"
                : `${total} clienți`
          }
        />

        {leaduri ? (
          <div className="px-5 pt-5 flex flex-wrap items-center gap-2" data-testid="clients-views">
            <ViewButton
              active={query.view === ""}
              onClick={() => push({ vedere: "", etapa: "", pagina: "1" })}
              testId="view-toti"
            >
              Toți
            </ViewButton>
            <ViewButton
              active={query.view === "leaduri"}
              onClick={() => push({ vedere: "leaduri", etapa: "", pagina: "1" })}
              testId="view-leaduri"
            >
              Leaduri
              <span className="tabular-nums text-rc-muted" data-testid="view-count">
                {leaduriTotal}
              </span>
            </ViewButton>
            <ViewButton
              active={query.view === "clienti"}
              onClick={() => push({ vedere: "clienti", etapa: "", pagina: "1" })}
              testId="view-clienti"
            >
              Clienți
              <span
                className="tabular-nums text-rc-muted"
                data-testid="stage-count"
                data-stage="client"
              >
                {leaduri.counts.client}
              </span>
            </ViewButton>
          </div>
        ) : null}

        {inLeaduri && leaduri ? (
          // PATRU CIPURI, IN ORDINEA ETAPELOR, fiecare cu culoarea langa eticheta si
          // cu numarul ei. Un cip apasat din nou scoate filtrul.
          <div className="px-5 pt-3 flex flex-wrap items-center gap-2" data-testid="stage-chips">
            <ViewButton
              active={query.stage === ""}
              onClick={() => push({ etapa: "", pagina: "1" })}
              testId="stage-chip-all"
            >
              Toate etapele
            </ViewButton>
            {LEADURI_STAGES.map((s) => (
              <button
                key={s}
                type="button"
                data-testid="stage-chip"
                data-stage={s}
                aria-pressed={query.stage === s}
                onClick={() =>
                  push({ vedere: "leaduri", etapa: query.stage === s ? "" : s, pagina: "1" })
                }
                className={chipClass(query.stage === s)}
              >
                <StageMark
                  stage={s}
                  testId="stage-chip-mark"
                  colourTestId="stage-chip-colour"
                  labelTestId="stage-chip-label"
                  labelClassName="text-[12.5px] font-semibold"
                />
                <span className="tabular-nums text-rc-muted" data-testid="stage-count" data-stage={s}>
                  {leaduri.counts[s]}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="p-5 flex flex-wrap items-center gap-3" data-testid="clients-filters">
          <div className="min-w-[280px] flex-1">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Caută după denumire, IDNO, telefon sau email"
              data-testid="clients-search"
            />
          </div>

          <Select
            value={query.type}
            onChange={(e) => push({ tip: e.target.value, pagina: "1" })}
            data-testid="clients-type"
          >
            <option value="">Toate tipurile</option>
            <option value="company">{CLIENT_TYPE_LABEL.company}</option>
            <option value="individual">{CLIENT_TYPE_LABEL.individual}</option>
          </Select>

          <Select
            value={query.status}
            onChange={(e) => push({ stare: e.target.value, pagina: "1" })}
            data-testid="clients-status"
          >
            <option value="active">Activi</option>
            <option value="inactive">Inactivi</option>
            <option value="toate">Toate</option>
          </Select>

          {filtered ? (
            <Button
              variant="secondary"
              onClick={() => router.push(pathname)}
              data-testid="clients-clear"
            >
              Șterge filtrele
            </Button>
          ) : null}
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title={
              inLeaduri
                ? filtered
                  ? "Niciun lead pentru filtrele alese"
                  : "Niciun lead încă"
                : filtered
                  ? "Niciun client pentru filtrele alese"
                  : "Niciun client încă"
            }
            hint={
              filtered
                ? "Schimbă căutarea sau șterge filtrele."
                : inLeaduri
                  ? "Primul lead se adaugă din butonul de sus."
                  : "Primul client se adaugă din butonul de sus."
            }
          />
        ) : inLeaduri ? (
          <Table>
            <thead>
              <tr>
                <Th>Denumire</Th>
                <Th>Interes</Th>
                <Th>Etapă</Th>
                <Th>Data de reluare</Th>
                <Th>Telefon</Th>
                <Th>Stare</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  data-testid="client-row"
                  data-id={c.id}
                  data-name={c.name}
                  className="hover:bg-rc-paper"
                >
                  <Td>
                    <Link
                      href={`/clienti/${c.id}`}
                      className="font-semibold text-rc-black hover:underline"
                      data-testid="client-link"
                    >
                      {c.name}
                    </Link>
                  </Td>
                  <Td>
                    <span
                      className="block max-w-[260px] truncate"
                      title={c.interest?.trim() || undefined}
                      data-testid="row-interest"
                    >
                      {c.interest?.trim() || "-"}
                    </span>
                  </Td>
                  <Td>
                    {c.stage ? (
                      <StageMark
                        stage={c.stage}
                        testId="row-stage"
                        colourTestId="row-stage-colour"
                        labelTestId="row-stage-label"
                      />
                    ) : (
                      "-"
                    )}
                  </Td>
                  <Td>
                    <span className="inline-flex items-center gap-2">
                      {formatDate(c.followUpDate)}
                      {/* Intarziat inseamna inainte de azi in Chisinau, calculat in
                          baza. Azi este datorat, nu intarziat. */}
                      {c.overdue ? (
                        <Chip tone="danger">
                          <span data-testid="row-overdue">Întârziat</span>
                        </Chip>
                      ) : null}
                    </span>
                  </Td>
                  <Td>{c.phone ?? "-"}</Td>
                  <Td>
                    <Chip tone={c.active ? "ok" : "neutral"}>
                      {c.active ? "Activ" : "Inactiv"}
                    </Chip>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Denumire</Th>
                <Th>Tip</Th>
                <Th>Telefon</Th>
                <Th align="right">Proiecte active</Th>
                <Th>Stare</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  data-testid="client-row"
                  data-id={c.id}
                  data-name={c.name}
                  className="hover:bg-rc-paper"
                >
                  <Td>
                    <Link
                      href={`/clienti/${c.id}`}
                      className="font-semibold text-rc-black hover:underline"
                      data-testid="client-link"
                    >
                      {c.name}
                    </Link>
                  </Td>
                  <Td>{CLIENT_TYPE_LABEL[c.type]}</Td>
                  <Td>{c.phone ?? "-"}</Td>
                  <Td align="right">{c.activeProjects}</Td>
                  <Td>
                    <Chip tone={c.active ? "ok" : "neutral"}>
                      {c.active ? "Activ" : "Inactiv"}
                    </Chip>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        {pageCount > 1 ? (
          <div
            className="px-5 py-4 flex items-center justify-between border-t border-rc-line"
            data-testid="clients-pagination"
          >
            <span className="text-[12.5px] text-rc-muted">
              Pagina {page} din {pageCount}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => push({ pagina: String(page - 1) })}
                data-testid="clients-prev"
              >
                Înapoi
              </Button>
              <Button
                variant="secondary"
                disabled={page >= pageCount}
                onClick={() => push({ pagina: String(page + 1) })}
                data-testid="clients-next"
              >
                Înainte
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      {creating ? (
        <ClientForm
          stageAvailable={stageAvailable}
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false);
            router.push(`/clienti/${id}`);
          }}
        />
      ) : null}

      {creatingLead && leaduri ? (
        <LeaduriForm
          owners={leaduri.owners}
          onClose={() => setCreatingLead(false)}
          onSaved={(id) => {
            setCreatingLead(false);
            router.push(`/clienti/${id}`);
          }}
        />
      ) : null}
    </>
  );
}

function chipClass(active: boolean): string {
  return [
    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold leading-none whitespace-nowrap transition-colors",
    active
      ? "bg-rc-white text-rc-black border-rc-orange"
      : "bg-rc-paper text-rc-muted border-rc-line-strong hover:text-rc-black",
  ].join(" ");
}

function ViewButton({
  active,
  onClick,
  testId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      data-testid={testId}
      className={chipClass(active)}
    >
      {children}
    </button>
  );
}
