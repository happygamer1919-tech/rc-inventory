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
import { CLIENT_TYPE_LABEL, type ClientListQuery, type ClientRow } from "@/lib/data/clients-types";
import { ClientForm } from "./ClientForm";

export function ClientsScreen({
  rows,
  total,
  page,
  pageCount,
  query,
  canWrite,
}: {
  rows: ClientRow[];
  total: number;
  page: number;
  pageCount: number;
  query: ClientListQuery;
  canWrite: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [q, setQ] = React.useState(query.q);
  const [creating, setCreating] = React.useState(false);

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
    query.q !== "" || query.type !== "" || query.status !== "active";

  return (
    <>
      <PageHeader
        title="Clienți"
        lead="Beneficiarii, cu datele lor de contact și proiectele lor."
        actions={
          canWrite ? (
            <Button onClick={() => setCreating(true)} data-testid="client-new">
              Client nou
            </Button>
          ) : null
        }
      />

      <Card>
        <CardHeader
          title="Listă"
          hint={
            total === 1 ? "1 client" : `${total} clienți`
          }
        />

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
            title={filtered ? "Niciun client pentru filtrele alese" : "Niciun client încă"}
            hint={
              filtered
                ? "Schimbă căutarea sau șterge filtrele."
                : "Primul client se adaugă din butonul de sus."
            }
          />
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
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false);
            router.push(`/clienti/${id}`);
          }}
        />
      ) : null}
    </>
  );
}
