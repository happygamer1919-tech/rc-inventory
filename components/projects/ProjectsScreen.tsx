"use client";

// Proiecte, ecranul de lista. Cardul P3-07.
//
// CINCI COLOANE: Denumire, Client, Stare, Termen estimat, Buget. Adresa si
// notele sunt detaliu. Adresa este cautabila fara sa fie afisata, ceea ce nu
// este o inconsecventa: cautarea gaseste dupa ce isi aminteste operatorul, iar
// lista arata cel mai mic set care lasa un om sa aleaga un rand.
//
// IMPLICITUL ESTE PATRU STARI DIN SASE. O lista care se deschide aratand
// fiecare santier inchis de acum doi ani este exact defectul pe care doctrina de
// densitate exista sa il opreasca. "Toate" arata tot si spune ca o face.

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
import { formatDate, formatMoney } from "@/lib/data/format";
import { PROJECT_STATUS_LABEL } from "@/lib/data/projects-types";
import {
  ALL_STATUSES,
  PROJECT_STATUS_TONE,
  type ProjectListQuery,
  type ProjectRow,
} from "@/lib/data/projects-list-types";
import { ProjectForm } from "./ProjectForm";

export function ProjectsScreen({
  rows,
  total,
  page,
  pageCount,
  query,
  clients,
  canWrite,
}: {
  rows: ProjectRow[];
  total: number;
  page: number;
  pageCount: number;
  query: ProjectListQuery;
  clients: { id: string; name: string }[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [q, setQ] = React.useState(query.q);
  const [creating, setCreating] = React.useState(false);

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

  // Valoarea controlului de stare: o stare unica atunci cand s-a ales una,
  // "toate" cand s-au cerut toate sase, si sirul gol pentru implicitul de patru.
  const statusValue = query.allStatuses
    ? "toate"
    : query.statuses.length === 1
      ? query.statuses[0]!
      : "";

  const filtered = query.q !== "" || statusValue !== "" || query.clientId !== "";

  return (
    <>
      <PageHeader
        title="Proiecte"
        lead="Șantierele, cu stadiul lor și cu clientul căruia îi aparțin."
        actions={
          canWrite ? (
            <Button onClick={() => setCreating(true)} data-testid="project-new">
              Proiect nou
            </Button>
          ) : null
        }
      />

      <Card>
        <CardHeader
          title="Listă"
          hint={total === 1 ? "1 proiect" : `${total} proiecte`}
        />

        <div className="p-5 flex flex-wrap items-center gap-3" data-testid="projects-filters">
          <div className="min-w-[260px] flex-1">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Caută după denumire sau adresă"
              data-testid="projects-search"
            />
          </div>

          <Select
            value={statusValue}
            onChange={(e) => push({ stare: e.target.value, pagina: "1" })}
            data-testid="projects-status"
          >
            <option value="">În desfășurare</option>
            {/* Optiunile citesc cele sase valori ale enumului IN ORDINEA
                DECLARARII, care este ordinea conductei. P3-03 spune ca ordinea
                de declarare ESTE conducta si ca vederea din valul 3 o citeste in
                loc sa tina o a doua lista; acelasi lucru se aplica aici. */}
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABEL[s]}
              </option>
            ))}
            <option value="toate">Toate stările</option>
          </Select>

          <Select
            value={query.clientId}
            onChange={(e) => push({ client: e.target.value, pagina: "1" })}
            data-testid="projects-client"
          >
            <option value="">Toți clienții</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>

          {filtered ? (
            <Button
              variant="secondary"
              onClick={() => router.push(pathname)}
              data-testid="projects-clear"
            >
              Șterge filtrele
            </Button>
          ) : null}
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title={filtered ? "Niciun proiect pentru filtrele alese" : "Niciun proiect încă"}
            hint={
              filtered
                ? "Schimbă filtrele sau alege Toate stările."
                : "Primul proiect se adaugă din butonul de sus."
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Denumire</Th>
                <Th>Client</Th>
                <Th>Stare</Th>
                <Th>Termen estimat</Th>
                <Th align="right">Buget</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.id}
                  data-testid="project-row"
                  data-name={p.name}
                  data-status={p.status}
                  className="hover:bg-rc-paper"
                >
                  <Td>
                    <Link
                      href={`/proiecte/${p.id}`}
                      className="font-semibold text-rc-black hover:underline"
                      data-testid="project-link"
                    >
                      {p.name}
                    </Link>
                  </Td>
                  <Td>
                    <Link
                      href={`/clienti/${p.clientId}`}
                      className="text-rc-black hover:underline"
                    >
                      {p.clientName}
                    </Link>
                  </Td>
                  <Td>
                    <Chip tone={PROJECT_STATUS_TONE[p.status]}>
                      {PROJECT_STATUS_LABEL[p.status]}
                    </Chip>
                  </Td>
                  <Td>{p.plannedEndDate ? formatDate(p.plannedEndDate) : "-"}</Td>
                  <Td align="right">
                    {/* NULL SI ZERO SUNT DOUA FAPTE DIFERITE. Un buget lipsa nu
                        este un buget de zero lei, si ecranul spune care. */}
                    {p.budgetMdl === null ? (
                      <span className="text-rc-muted">Fără buget</span>
                    ) : (
                      formatMoney(p.budgetMdl)
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        {pageCount > 1 ? (
          <div
            className="px-5 py-4 flex items-center justify-between border-t border-rc-line"
            data-testid="projects-pagination"
          >
            <span className="text-[12.5px] text-rc-muted">
              Pagina {page} din {pageCount}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => push({ pagina: String(page - 1) })}
                data-testid="projects-prev"
              >
                Înapoi
              </Button>
              <Button
                variant="secondary"
                disabled={page >= pageCount}
                onClick={() => push({ pagina: String(page + 1) })}
                data-testid="projects-next"
              >
                Înainte
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      {creating ? (
        <ProjectForm
          clients={clients}
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false);
            router.push(`/proiecte/${id}`);
          }}
        />
      ) : null}
    </>
  );
}
