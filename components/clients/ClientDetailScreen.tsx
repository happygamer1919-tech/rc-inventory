"use client";

// Detaliul unui client, cardul P3-06.
//
// ESTE O RUTA SI NU UN PANOU, si P3-06 spune de ce: cardul urmator ii adauga
// cinci file, iar un panou lateral nu tine cinci file la o latime citibila pe un
// ecran de birou. Ecranele de comenzi si de inventar isi pastreaza panourile;
// aceasta nu este o schimbare la ele.
//
// FILELE NU SUNT AICI. P3-08 le aduce, complete, cu stari goale pentru cele
// nezidite inca. Cardul acesta livreaza fisa clientului si atat, pentru ca un
// card care ar livra si filele ar fi doua carduri intr-un singur pull request.

import * as React from "react";
import Link from "next/link";
import { Button, Card, CardHeader, Chip, PageHeader } from "@/components/ui/primitives";
import {
  CLIENT_SOURCE_LABEL,
  CLIENT_TYPE_LABEL,
  type ClientDetail,
  type ClientOwnerChoice,
} from "@/lib/data/clients-types";
import { formatDate } from "@/lib/data/format";
import { ClientForm } from "./ClientForm";
import { ClientTabs } from "./ClientTabs";
import { StageMark } from "./StageMark";
import { PHONE_ROW_LABEL, PHONE_ROW_PAIR, PHONE_ROW_VALUE } from "@/components/ui/phone";
import type { ClientContact, ClientMaterials, ClientProject } from "@/lib/data/client-detail";
import type { DocumentsView } from "@/lib/data/documents-types";

function Row({
  label,
  value,
  testId,
}: {
  label: string;
  value: string | null;
  testId?: string;
}) {
  return (
    <div
      className={`flex gap-4 py-2.5 border-b border-rc-line last:border-0 ${PHONE_ROW_PAIR}`}
      data-testid={testId}
    >
      <span className={`w-[160px] shrink-0 text-[12.5px] font-semibold text-rc-muted ${PHONE_ROW_LABEL}`}>
        {label}
      </span>
      {/* O valoare lipsa este o liniuta, nu un sir gol: un rand fara nimic in
          dreapta arata ca un defect de randare. */}
      <span className={`text-[13.5px] text-rc-black ${PHONE_ROW_VALUE}`}>{value?.trim() || "-"}</span>
    </div>
  );
}

export function ClientDetailScreen({
  client,
  contacts,
  projects,
  materials,
  documents,
  canWrite,
  owners,
}: {
  client: ClientDetail;
  contacts: ClientContact[];
  projects: ClientProject[];
  materials: ClientMaterials;
  /** P3-15. null cand migratia 0044 nu este inca aplicata. */
  documents: DocumentsView | null;
  canWrite: boolean;
  /** P3-48. Responsabilii pentru Modifică. Lipsa inseamna fara Sursă, Interes si
   *  Responsabil in formular. */
  owners?: ClientOwnerChoice[];
}) {
  const [editing, setEditing] = React.useState(false);

  // P3-48. RESPONSABILUL ESTE UN NUME, niciodata id-ul. Liniuta cand nu are
  // responsabil; cand are, dar profilul lui nu se poate citi de cine se uita, se
  // spune in cuvinte, ca randul sa nu para nealocat.
  const ownerLabel =
    client.ownerId === null ? null : (client.ownerName ?? "Alt membru al echipei");

  return (
    <>
      <PageHeader
        title={client.name}
        lead={
          client.active
            ? "Fișa clientului."
            : "Fișa clientului. Clientul este dezactivat și nu apare în selectoare."
        }
        actions={
          <div className="flex items-center gap-2">
            <Link href="/clienti">
              <Button variant="secondary" data-testid="client-back">
                Înapoi la listă
              </Button>
            </Link>
            {canWrite ? (
              <Button onClick={() => setEditing(true)} data-testid="client-edit">
                Modifică
              </Button>
            ) : null}
          </div>
        }
      />

      <Card className="max-w-[760px]">
        <CardHeader
          title="Date de identificare"
          hint={client.active ? undefined : "Dezactivat"}
        />
        <div className="px-5 py-3" data-testid="client-detail">
          <Row label="Denumire" value={client.name} />
          <Row label="Tip" value={CLIENT_TYPE_LABEL[client.type]} />
          {client.stage !== null ? (
            <>
              <div className={`flex gap-4 py-2.5 border-b border-rc-line ${PHONE_ROW_PAIR}`}>
                <span className={`w-[160px] shrink-0 text-[12.5px] font-semibold text-rc-muted ${PHONE_ROW_LABEL}`}>
                  Etapă
                </span>
                <StageMark stage={client.stage} />
              </div>
              <Row
                label="Data de reluare"
                value={client.followUpDate ? formatDate(client.followUpDate) : null}
                testId="client-follow-up"
              />
            </>
          ) : null}
          {client.leaduriAvailable ? (
            <>
              <Row label="Interes" value={client.interest} testId="client-interest" />
              <Row
                label="Sursă"
                value={client.source ? CLIENT_SOURCE_LABEL[client.source] : null}
                testId="client-source"
              />
              <Row label="Responsabil" value={ownerLabel} testId="client-owner" />
            </>
          ) : null}
          <Row label="IDNO" value={client.fiscalCode} />
          <Row label="Telefon" value={client.phone} />
          <Row label="Email" value={client.email} />
          <Row label="Adresă" value={client.address} />
          <Row label="Note" value={client.notes} />
          <Row label="Adăugat" value={formatDate(client.createdAt)} />
          <div className={`flex gap-4 py-2.5 ${PHONE_ROW_PAIR}`}>
            <span className={`w-[160px] shrink-0 text-[12.5px] font-semibold text-rc-muted ${PHONE_ROW_LABEL}`}>
              Stare
            </span>
            <Chip tone={client.active ? "ok" : "neutral"}>
              {client.active ? "Activ" : "Inactiv"}
            </Chip>
          </div>
        </div>
      </Card>

      <div className="mt-5">
        <ClientTabs
          clientId={client.id}
          contacts={contacts}
          projects={projects}
          materials={materials}
          documents={documents}
          canWrite={canWrite}
        />
      </div>

      {editing ? (
        <ClientForm
          client={client}
          stageAvailable={client.stage !== null}
          owners={client.leaduriAvailable ? owners : undefined}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </>
  );
}
