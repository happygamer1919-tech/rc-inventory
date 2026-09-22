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
import { useRouter } from "next/navigation";
import { Button, Card, CardHeader, Chip, PageHeader } from "@/components/ui/primitives";
import {
  CLIENT_SOURCE_LABEL,
  CLIENT_TYPE_LABEL,
  type ClientDetail,
  type ClientOwnerChoice,
} from "@/lib/data/clients-types";
import { formatDate } from "@/lib/data/format";
import { updateClientRecord } from "@/lib/data/client-actions";
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
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [toggling, setToggling] = React.useState(false);
  const [toggleError, setToggleError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  // P3-66. REACTIVAREA ESTE UN BUTON PE FISA, nu o casuta la capatul formularului
  // Modifică, la care se ajungea numai dupa filtrul Inactivi. Scrie prin
  // updateClientRecord, cu campurile fisei neschimbate si numai `active` inversat.
  // Etapa, data, sursa, interesul si responsabilul NU se trimit, iar actiunea citeste
  // lipsa lor ca "nu atinge": butonul nu muta etapa si nu scrie istoric.
  //
  // APLICATIA NU ARE TOAST-URI. Confirmarea este un rand cu role=status sub antetul
  // cardului, unde s-a apasat, si ramane pana la urmatoarea apasare, ca sa nu dispara
  // inainte sa fie citita.
  async function toggleActive() {
    const next = !client.active;
    setToggling(true);
    setToggleError(null);
    setNotice(null);
    const result = await updateClientRecord(client.id, {
      name: client.name,
      type: client.type,
      fiscalCode: client.fiscalCode ?? "",
      address: client.address ?? "",
      phone: client.phone ?? "",
      email: client.email ?? "",
      notes: client.notes ?? "",
      active: next,
    });
    setToggling(false);
    if (!result.ok) {
      setToggleError(result.message);
      return;
    }
    setNotice(
      next
        ? "Reactivat. Apare din nou în liste și în selectoare."
        : "Dezactivat. Nu mai apare în selectoare și în lista celor activi.",
    );
    router.refresh();
  }

  // P3-48. RESPONSABILUL ESTE UN NUME, niciodata id-ul. Liniuta cand nu are
  // responsabil; cand are, dar profilul lui nu se poate citi de cine se uita, se
  // spune in cuvinte, ca randul sa nu para nealocat.
  const ownerLabel =
    client.ownerId === null ? null : (client.ownerName ?? "Alt membru al echipei");

  const nextActionDate =
    client.nextActionAt ?? (client.stage === "follow_up" ? client.followUpDate : null);

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
          right={
            canWrite ? (
              <Button
                size="sm"
                variant={client.active ? "secondary" : "primary"}
                onClick={toggleActive}
                disabled={toggling}
                data-testid="client-active-toggle"
              >
                {client.active ? "Dezactivează" : "Reactivează"}
              </Button>
            ) : null
          }
        />
        {notice ? (
          <p
            role="status"
            data-testid="client-active-notice"
            className="mx-5 mt-3 rounded-[10px] border border-rc-ok/25 bg-rc-ok-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
          >
            {notice}
          </p>
        ) : null}
        {toggleError ? (
          <p
            role="alert"
            data-testid="client-active-error"
            className="mx-5 mt-3 rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
          >
            {toggleError}
          </p>
        ) : null}
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
          {client.nextActionAvailable ? (
            // P3-89. URMATORUL PAS, SUB ETAPA. La De reluat data lui este data de
            // reluare, aceeasi casuta in formular; un lead ajuns la De reluat
            // inainte de 0058 are data numai in follow_up_date, si se arata aceea.
            <Row
              label="Următorul pas"
              value={
                [
                  nextActionDate ? formatDate(nextActionDate) : null,
                  client.nextAction?.trim() || null,
                ]
                  .filter(Boolean)
                  .join(", ") || null
              }
              testId="client-next-action"
            />
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
          nextActionAvailable={client.nextActionAvailable}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </>
  );
}
