"use client";

// Azi, cardul P3-91, goal G46. Ecranul de la care porneste ziua: fiecare lead si
// client de sunat azi, intarziatii primii, in rosu.
//
// FIECARE RAND: numele (spre fisa), telefonul ca legatura tel: (pe telefon suna
// dintr-o atingere), urmatorul pas in cuvinte, ziua, si Am sunat.
//
// AM SUNAT DESCHIDE FORMULARUL DE NOTA IN RANDUL DE SUB EL, nu intr-o fereastra: omul
// vede in continuare pe cine a sunat cat scrie, iar pe telefon randul este deja un
// card, deci formularul ramane in acelasi card. Este ACELASI formular ca pe fila
// Note (ClientNoteForm), pornit cu "Am sunat" si cu pasul urmator sters la salvare.
// Ziua notei este momentul salvarii, scris de baza.
//
// FILTRUL RESPONSABIL STA IN ADRESA (`responsabil`), ca filtrele listei de clienti.

import Link from "next/link";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardHeader,
  Chip,
  EmptyState,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import {
  PHONE_ACTIONS_CELL,
  PHONE_CELL,
  PHONE_LINK,
  PHONE_ROW,
  PHONE_TABLE,
  PHONE_TAP,
  PHONE_WIDE,
} from "@/components/ui/phone";
import type { AziRow, ClientOwnerChoice } from "@/lib/data/clients-types";
import { formatDate, plural } from "@/lib/data/format";
import { ClientNoteForm } from "./ClientNoteForm";

/** Textul cu care porneste nota, cuvintele proprietarului pentru buton. */
const CALLED = "Am sunat";

export function AziScreen({
  rows,
  owners,
  ownerId,
  canWrite,
  nextActionAvailable,
}: {
  rows: AziRow[];
  owners: ClientOwnerChoice[];
  /** Responsabilul ales, "" pentru toti. */
  ownerId: string;
  canWrite: boolean;
  nextActionAvailable: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState<string | null>(null);

  const overdue = rows.filter((r) => r.overdue).length;
  const columns = canWrite ? 5 : 4;

  return (
    <>
      <PageHeader
        title="Azi"
        lead="Leadurile și clienții de sunat azi, cei întârziați primii, în roșu."
      />

      <Card className={PHONE_TABLE}>
        <CardHeader
          title="De sunat"
          hint={
            rows.length === 0
              ? undefined
              : [
                  // "de sunat" este o expresie verbala, nu un substantiv numarat:
                  // `plural` nu se aplica, si de aceea randul acesta ramane cum a
                  // fost. Constatarea F12 il lasa anume in afara tabelului ei.
                  `${rows.length} de sunat`,
                  overdue === 0 ? null : plural(overdue, "întârziat", "întârziați"),
                ]
                  .filter(Boolean)
                  .join(", ")
          }
        />

        {owners.length > 1 ? (
          <div className="p-5 grid grid-cols-[minmax(0,280px)] max-md:grid-cols-1" data-testid="azi-filters">
            <Select
              value={ownerId}
              onChange={(e) =>
                router.push(e.target.value ? `/azi?responsabil=${e.target.value}` : "/azi")
              }
              aria-label="Responsabil"
              data-testid="azi-owner"
              className={PHONE_TAP}
            >
              <option value="">Toți responsabilii</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.fullName}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        {rows.length === 0 ? (
          <EmptyState title="Nimic de făcut azi." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Denumire</Th>
                <Th>Telefon</Th>
                <Th>Următorul pas</Th>
                <Th>Data</Th>
                {canWrite ? <Th aria-label="Acțiuni" /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <React.Fragment key={r.id}>
                  <tr
                    data-testid="azi-row"
                    data-id={r.id}
                    data-name={r.name}
                    data-overdue={r.overdue ? "true" : "false"}
                    className={`hover:bg-rc-paper ${PHONE_ROW}`}
                  >
                    <Td data-label="Denumire" className={PHONE_WIDE}>
                      <Link
                        href={`/clienti/${r.id}`}
                        className={`font-semibold hover:underline ${r.overdue ? "text-rc-danger" : "text-rc-black"} ${PHONE_LINK}`}
                        data-testid="azi-name"
                      >
                        {r.name}
                      </Link>
                    </Td>
                    <Td data-label="Telefon" className={PHONE_CELL}>
                      {r.phone ? (
                        <a
                          href={`tel:${r.phone.replace(/\s+/g, "")}`}
                          className={`text-rc-black underline decoration-rc-line-strong underline-offset-2 hover:decoration-rc-orange ${PHONE_LINK}`}
                          data-testid="azi-call"
                        >
                          {r.phone}
                        </a>
                      ) : (
                        "-"
                      )}
                    </Td>
                    {/* P3-98, constatarea B1. CAND NIMENI NU A SCRIS UN PAS,
                        coloana arata liniuta, ca si cealalta ramura de langa ea.
                        Scria "De reluat", care nu este o propozitie scrisa de
                        cineva, ci ETICHETA ETAPEI (CLIENT_STAGE_LABEL.follow_up),
                        aratata oricum in rest pe acelasi rand: operatorul nu mai
                        putea deosebi un lead cu pas scris de unul fara.
                        `dueFrom` ramane neschimbat si tot ce aduce randul pe
                        lista ramane neschimbat: se schimba numai textul. */}
                    <Td data-label="Următorul pas" className={PHONE_WIDE}>
                      <span
                        className="block max-w-[320px] truncate max-md:max-w-none max-md:overflow-visible max-md:whitespace-normal"
                        title={r.nextAction ?? undefined}
                        data-testid="azi-next-action"
                      >
                        {r.nextAction ?? "-"}
                      </span>
                    </Td>
                    <Td data-label="Data" className={PHONE_CELL}>
                      <span className="inline-flex items-center gap-2 max-md:flex-wrap">
                        <span
                          className={r.overdue ? "text-rc-danger font-semibold" : undefined}
                          data-testid="azi-date"
                        >
                          {formatDate(r.dueDate)}
                        </span>
                        {/* Intarziat inseamna inainte de azi in Chisinau. Azi este de
                            facut, nu intarziat. Acelasi cip ca pe Leaduri. */}
                        {r.overdue ? (
                          <Chip tone="danger">
                            <span data-testid="azi-overdue">Întârziat</span>
                          </Chip>
                        ) : null}
                      </span>
                    </Td>
                    {canWrite ? (
                      <Td align="right" className={PHONE_ACTIONS_CELL}>
                        <Button
                          size="sm"
                          variant={open === r.id ? "secondary" : "primary"}
                          onClick={() => setOpen(open === r.id ? null : r.id)}
                          aria-expanded={open === r.id}
                          data-testid="azi-called"
                          className="max-md:w-full"
                        >
                          {CALLED}
                        </Button>
                      </Td>
                    ) : null}
                  </tr>
                  {canWrite && open === r.id ? (
                    <tr data-testid="azi-note" data-id={r.id} className={PHONE_ROW}>
                      <td colSpan={columns} className={`border-b border-rc-line bg-rc-paper ${PHONE_ACTIONS_CELL}`}>
                        <ClientNoteForm
                          key={r.id}
                          clientId={r.id}
                          nextActionAvailable={nextActionAvailable}
                          followUpBox={r.stage === "follow_up"}
                          initialBody={CALLED}
                          clearNextAction
                          onCancel={() => setOpen(null)}
                          onSaved={() => {
                            setOpen(null);
                            router.refresh();
                          }}
                          className="px-5 py-4 space-y-3 max-md:p-0"
                        />
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
