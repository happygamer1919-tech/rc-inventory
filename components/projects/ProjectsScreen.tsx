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

// P3-64. PE TELEFON (sub 768px) FIECARE RAND DEVINE UN CARD, iar peste 768px
// nimic nu se schimba: fiecare clasa de mai jos poarta max-md. ACELASI DOM, nu o a
// doua lista ascunsa, fiindca spec-urile numara project-row si o copie ar dubla
// fiecare numar pe desktop. Eticheta fiecarui camp este textul din antetul
// coloanei, pus pe celula in data-label si desenat din CSS, deci textul celulei
// ramane exact cel de azi. Textele starilor goale nu se ating.
//
// P3-100, constatarea F14. ECRANUL ACESTA ISI SCRIA PROPRIILE COPII ale celor sase
// nume si doua dintre ele apucasera sa se departeze de fisierul comun, EXACT cele
// doua pe care raportul criticului le-a numit pe lista Clienti: marginea cardului
// era px-5 pb-5 in loc de p-4, iar legatura din rand era flex in loc de inline-flex.
// Amandoua sunt rezolvate catre fisierul comun, deci pe telefon un card de proiect
// are de acum 16px de jur imprejur in loc de 20px pe laturi si nimic sus, iar
// numele proiectului este o casuta in linie, nu un bloc. Peste 768px nimic nu se
// misca: toate clasele poarta max-md.
import {
  PHONE_CELL,
  PHONE_CONTROL,
  PHONE_LINK,
  PHONE_ROW,
  PHONE_TABLE,
  PHONE_WIDE,
} from "@/components/ui/phone";

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
            <Button
              onClick={() => setCreating(true)}
              data-testid="project-new"
              className="max-md:min-h-11"
            >
              Proiect nou
            </Button>
          ) : null
        }
      />

      <Card className={PHONE_TABLE}>
        <CardHeader
          title="Listă"
          hint={total === 1 ? "1 proiect" : `${total} proiecte`}
        />

        {/* P3-52. Grila explicita, ca pe Inventar: Input si Select poarta w-full,
            deci intr-un rand flex-wrap fiecare cerea tot randul. Coloana auto de
            la final tine Șterge filtrele, ca selecturile sa nu treaca dedesubt
            cand butonul apare. */}
        <div
          className="p-5 grid grid-cols-[1.6fr_1fr_1.2fr_auto] items-center gap-3 max-md:grid-cols-1"
          data-testid="projects-filters"
        >
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Caută după denumire sau adresă"
            data-testid="projects-search"
            className={PHONE_CONTROL}
          />

          <Select
            value={statusValue}
            onChange={(e) => push({ stare: e.target.value, pagina: "1" })}
            data-testid="projects-status"
            className={PHONE_CONTROL}
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
            className={PHONE_CONTROL}
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
              className="max-md:min-h-11"
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
                  className={`hover:bg-rc-paper ${PHONE_ROW}`}
                >
                  <Td data-label="Denumire" className={PHONE_WIDE}>
                    <Link
                      href={`/proiecte/${p.id}`}
                      className={`font-semibold text-rc-black hover:underline ${PHONE_LINK}`}
                      data-testid="project-link"
                    >
                      {p.name}
                    </Link>
                  </Td>
                  <Td data-label="Client" className={PHONE_WIDE}>
                    <Link
                      href={`/clienti/${p.clientId}`}
                      className={`text-rc-black hover:underline ${PHONE_LINK}`}
                    >
                      {p.clientName}
                    </Link>
                  </Td>
                  <Td data-label="Stare" className={PHONE_CELL}>
                    <Chip tone={PROJECT_STATUS_TONE[p.status]}>
                      {PROJECT_STATUS_LABEL[p.status]}
                    </Chip>
                  </Td>
                  <Td data-label="Termen estimat" className={PHONE_CELL}>
                    {p.plannedEndDate ? formatDate(p.plannedEndDate) : "-"}
                  </Td>
                  <Td align="right" data-label="Buget" className={PHONE_CELL}>
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
            className="px-5 py-4 flex items-center justify-between border-t border-rc-line max-md:flex-wrap max-md:gap-3"
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
                className="max-md:min-h-11"
              >
                Înapoi
              </Button>
              <Button
                variant="secondary"
                disabled={page >= pageCount}
                onClick={() => push({ pagina: String(page + 1) })}
                data-testid="projects-next"
                className="max-md:min-h-11"
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
