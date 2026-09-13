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
  CLIENT_STAGE_COLOUR,
  CLIENT_STAGE_LABEL,
  CLIENT_TYPE_LABEL,
  type ClientDetail,
  type ClientStage,
} from "@/lib/data/clients-types";
import { formatDate } from "@/lib/data/format";
import { ClientForm } from "./ClientForm";
import { ClientTabs } from "./ClientTabs";
import type { ClientContact, ClientMaterials, ClientProject } from "@/lib/data/client-detail";

/** P3-43. Eticheta etapei, cu culoarea ALATURI de ea si niciodata in locul ei:
 *  cine nu deosebeste rosul de verde citeste tot eticheta. Tokenul brut nu ajunge
 *  pe ecran; `data-colour` este un atribut, nu text. */
function StageMark({ stage }: { stage: ClientStage }) {
  const colour = CLIENT_STAGE_COLOUR[stage];
  return (
    <span className="inline-flex items-center gap-2" data-testid="client-stage">
      <span
        aria-hidden="true"
        data-testid="client-stage-colour"
        data-colour={colour.name}
        className={`inline-block w-2.5 h-2.5 rounded-full ${colour.className}`}
      />
      <span data-testid="client-stage-label" className="text-[13.5px] text-rc-black">
        {CLIENT_STAGE_LABEL[stage]}
      </span>
    </span>
  );
}

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
      className="flex gap-4 py-2.5 border-b border-rc-line last:border-0"
      data-testid={testId}
    >
      <span className="w-[160px] shrink-0 text-[12.5px] font-semibold text-rc-muted">
        {label}
      </span>
      {/* O valoare lipsa este o liniuta, nu un sir gol: un rand fara nimic in
          dreapta arata ca un defect de randare. */}
      <span className="text-[13.5px] text-rc-black">{value?.trim() || "-"}</span>
    </div>
  );
}

export function ClientDetailScreen({
  client,
  contacts,
  projects,
  materials,
  canWrite,
}: {
  client: ClientDetail;
  contacts: ClientContact[];
  projects: ClientProject[];
  materials: ClientMaterials;
  canWrite: boolean;
}) {
  const [editing, setEditing] = React.useState(false);

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
              <div className="flex gap-4 py-2.5 border-b border-rc-line">
                <span className="w-[160px] shrink-0 text-[12.5px] font-semibold text-rc-muted">
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
          <Row label="IDNO" value={client.fiscalCode} />
          <Row label="Telefon" value={client.phone} />
          <Row label="Email" value={client.email} />
          <Row label="Adresă" value={client.address} />
          <Row label="Note" value={client.notes} />
          <Row label="Adăugat" value={formatDate(client.createdAt)} />
          <div className="flex gap-4 py-2.5">
            <span className="w-[160px] shrink-0 text-[12.5px] font-semibold text-rc-muted">
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
          canWrite={canWrite}
        />
      </div>

      {editing ? (
        <ClientForm
          client={client}
          stageAvailable={client.stage !== null}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </>
  );
}
