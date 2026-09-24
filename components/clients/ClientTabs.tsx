"use client";

// Filele de pe fisa clientului. Cardul P3-08.
//
// BANDA DE FILE ESTE AUTORATA COMPLETA AICI, in ordinea din card. Documente si
// Note randau o stare goala romaneasca pana cand cardurile lor le-au umplut. A
// autora trei file atunci si a adauga doua mai tarziu ar fi insemnat ca aspectul,
// schema de URL si componentul de file se schimba de doua ori, iar a doua
// schimbare ateriza intr-un card care trebuia sa fie despre documente.
//
// ERAU CINCI FILE PANA LA CARDUL P3-99, iar a cincea era Note. P3-99 a scos-o si
// a mutat panoul "Ce s-a discutat" deasupra acestei benzi, in
// ClientDetailScreen.tsx, fiindca goal G45 ceruse casuta sus pe pagina si ea
// ajunsese sus intr-o fila care sta jos (constatarea B2). Filele ramase sunt
// patru, iar ordinea si implicitul lor nu s-au atins.
//
// FILA ACTIVA ESTE UN PARAMETRU DE URL, nu stare de component, ca o fila sa
// poata fi trimisa ca legatura si ca butonul de inapoi sa functioneze.

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  Card,
  CardHeader,
  Chip,
  EmptyState,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import { formatDate, formatMoney, formatNumber } from "@/lib/data/format";
import { unitLabel } from "@/lib/data/units";
import { PROJECT_STATUS_LABEL } from "@/lib/data/projects-types";
import { PROJECT_STATUS_TONE } from "@/lib/data/projects-list-types";
import type {
  ClientContact,
  ClientMaterials,
  ClientProject,
} from "@/lib/data/client-detail";
import { ContactForm } from "./ContactForm";
import { DocumentsPanel } from "@/components/documents/DocumentsPanel";
import type { DocumentsView } from "@/lib/data/documents-types";
import {
  PHONE_ACTIONS_CELL,
  PHONE_CELL,
  PHONE_LINK,
  PHONE_ROW,
  PHONE_TAB,
  PHONE_TABLE,
  PHONE_TABS,
  PHONE_WIDE,
} from "@/components/ui/phone";

const TABS = [
  { id: "contacte", label: "Contacte" },
  { id: "proiecte", label: "Proiecte" },
  { id: "consum", label: "Consum materiale" },
  { id: "documente", label: "Documente" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function isTab(value: string): value is TabId {
  return TABS.some((t) => t.id === value);
}

export function ClientTabs({
  clientId,
  contacts,
  projects,
  materials,
  documents,
  canWrite,
}: {
  clientId: string;
  contacts: ClientContact[];
  projects: ClientProject[];
  materials: ClientMaterials;
  documents: DocumentsView | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const raw = params.get("fila") ?? "";
  // O fila necunoscuta din URL revine la prima, nu da eroare: cineva a trimis o
  // legatura veche sau a scris in bara de adrese. De la P3-99 acelasi drum il ia
  // si `?fila=note`, adresa filei scoase, care circula in legaturi trimise: se
  // deschide Contacte, iar "Ce s-a discutat" este oricum deasupra benzii.
  const active: TabId = isTab(raw) ? raw : "contacte";

  const [editingContact, setEditingContact] = React.useState<ClientContact | null>(null);
  const [creatingContact, setCreatingContact] = React.useState(false);

  function goTo(tab: TabId) {
    const next = new URLSearchParams(params.toString());
    next.set("fila", tab);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <>
      <div className={`flex gap-1 border-b border-rc-line mb-4 ${PHONE_TABS}`} data-testid="client-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => goTo(t.id)}
            data-testid={`tab-${t.id}`}
            data-active={active === t.id ? "true" : "false"}
            className={
              active === t.id
                ? `px-4 py-2.5 text-[13.5px] font-semibold text-rc-white border-b-2 border-rc-orange -mb-px ${PHONE_TAB}`
                : `px-4 py-2.5 text-[13.5px] text-rc-muted-2 hover:text-rc-white ${PHONE_TAB}`
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div data-testid={`panel-${active}`}>
        {active === "contacte" ? (
          <Card>
            <CardHeader
              title="Contacte"
              hint="Un client poate avea mai multe persoane de contact."
              right={
                canWrite ? (
                  <Button onClick={() => setCreatingContact(true)} data-testid="contact-new">
                    Contact nou
                  </Button>
                ) : undefined
              }
            />
            {contacts.length === 0 ? (
              <EmptyState
                title="Niciun contact înregistrat"
                hint={
                  canWrite
                    ? "Adaugă șeful de șantier, contabilul sau administratorul."
                    : "Contactele se adaugă de administrator."
                }
              />
            ) : (
              <div className={PHONE_TABLE}>
              <Table>
                <thead>
                  <tr>
                    <Th>Persoană de contact</Th>
                    <Th>Rol</Th>
                    <Th>Telefon</Th>
                    <Th>Email</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c) => (
                    <tr key={c.id} data-testid="contact-row" data-name={c.name} className={PHONE_ROW}>
                      <Td data-label="Persoană de contact" className={PHONE_WIDE}>
                        <span className="font-semibold text-rc-black">{c.name}</span>
                        {c.isPrimary ? (
                          <Chip tone="orange" className="ml-2" >
                            Contact principal
                          </Chip>
                        ) : null}
                        {!c.active ? (
                          <Chip tone="neutral" className="ml-2">
                            Inactiv
                          </Chip>
                        ) : null}
                      </Td>
                      <Td data-label="Rol" className={PHONE_CELL}>{c.role ?? "-"}</Td>
                      <Td data-label="Telefon" className={PHONE_CELL}>{c.phone ?? "-"}</Td>
                      <Td data-label="Email" className={PHONE_WIDE}>{c.email ?? "-"}</Td>
                      <Td align="right" className={PHONE_ACTIONS_CELL}>
                        {canWrite ? (
                          <Button
                            variant="secondary"
                            onClick={() => setEditingContact(c)}
                            data-testid="contact-edit"
                          >
                            Modifică
                          </Button>
                        ) : null}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              </div>
            )}
          </Card>
        ) : null}

        {active === "proiecte" ? (
          <Card>
            <CardHeader title="Proiecte" hint="Șantierele acestui client" />
            {projects.length === 0 ? (
              <EmptyState
                title="Niciun proiect"
                hint="Proiectele se adaugă din secțiunea Proiecte."
                action={
                  <Link href="/proiecte">
                    <Button variant="secondary">Deschide Proiecte</Button>
                  </Link>
                }
              />
            ) : (
              <div className={PHONE_TABLE}>
              <Table>
                <thead>
                  <tr>
                    <Th>Denumire</Th>
                    <Th>Stare</Th>
                    <Th>Termen estimat</Th>
                    <Th align="right">Buget</Th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id} data-testid="client-project-row" data-name={p.name} className={PHONE_ROW}>
                      <Td data-label="Denumire" className={PHONE_WIDE}>
                        <Link
                          href={`/proiecte/${p.id}`}
                          className={`font-semibold text-rc-black hover:underline ${PHONE_LINK}`}
                          data-testid="client-project-link"
                        >
                          {p.name}
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
                      <Td align="right" data-label="Buget" className={PHONE_WIDE}>
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
              </div>
            )}
          </Card>
        ) : null}

        {active === "consum" ? (
          <Card>
            <CardHeader
              title="Consum materiale"
              hint="Cele mai folosite produse, pe toate șantierele clientului"
            />
            {materials.rows.length === 0 ? (
              <EmptyState
                title="Niciun consum înregistrat"
                hint="Materialul eliberat către șantierele acestui client apare aici."
              />
            ) : (
              <>
                <div className={PHONE_TABLE}>
                <Table>
                  <thead>
                    <tr>
                      <Th>Produs</Th>
                      <Th align="right">Cantitate</Th>
                      <Th align="right">Valoare</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {materials.rows.map((r) => (
                      <tr key={r.productId ?? r.sku} data-testid="material-row" data-sku={r.sku} className={PHONE_ROW}>
                        <Td data-label="Produs" className={PHONE_WIDE}>
                          <span className="font-semibold text-rc-black">{r.name}</span>
                          <span className="ml-2 text-[12.5px] text-rc-muted">{r.sku}</span>
                        </Td>
                        <Td align="right" data-label="Cantitate" className={PHONE_CELL}>
                          {formatNumber(r.quantity)} {r.unit ? unitLabel(r.unit) : ""}
                        </Td>
                        <Td align="right" data-label="Valoare" className={PHONE_CELL}>
                          {formatMoney(r.valueMdl)}
                        </Td>
                      </tr>
                    ))}
                    {materials.total ? (
                      <tr data-testid="material-total" className={`font-semibold ${PHONE_ROW}`}>
                        <Td className={PHONE_WIDE}>Total, toate produsele</Td>
                        <Td align="right" data-label="Cantitate" className={PHONE_CELL}>
                          {formatNumber(materials.total.quantity)}
                        </Td>
                        <Td align="right" data-label="Valoare" className={PHONE_CELL}>
                          {formatMoney(materials.total.valueMdl)}
                        </Td>
                      </tr>
                    ) : null}
                  </tbody>
                </Table>
                </div>
                <div className="px-5 py-4 border-t border-rc-line space-y-2">
                  {/* P3-10: catre lista completa FILTRATA la acest client. */}
                  <Link
                    href={`/comenzi?client=${clientId}`}
                    className={`text-[12.5px] text-rc-orange-deep hover:underline ${PHONE_LINK}`}
                    data-testid="material-full-history"
                  >
                    Vezi toate ieșirile către acest client
                  </Link>
                  {materials.unassignedIssues > 0 ? (
                    // UN TOTAL PARTIAL SPUNE CA ESTE PARTIAL. Iesirile fara
                    // proiect nu au client, deci nu pot fi atribuite nimanui, si
                    // a le lasa afara in tacere ar face totalul de crezut.
                    <p className="text-[12.5px] text-rc-warn" data-testid="material-unassigned">
                      {materials.unassignedIssues === 1
                        ? "O ieșire din sistem nu are încă un proiect, deci nu este inclusă în niciun total pe client."
                        : `${materials.unassignedIssues} ieșiri din sistem nu au încă un proiect, deci nu sunt incluse în niciun total pe client.`}
                    </p>
                  ) : null}
                </div>
              </>
            )}
          </Card>
        ) : null}

        {active === "documente" ? (
          // P3-15 a umplut fila: incarcare, lista, descarcare si stergere.
          <DocumentsPanel
            owner={{ type: "client", id: clientId }}
            documents={documents}
            canWrite={canWrite}
          />
        ) : null}
      </div>

      {creatingContact || editingContact ? (
        <ContactForm
          clientId={clientId}
          contact={editingContact ?? undefined}
          onClose={() => {
            setCreatingContact(false);
            setEditingContact(null);
          }}
        />
      ) : null}
    </>
  );
}
