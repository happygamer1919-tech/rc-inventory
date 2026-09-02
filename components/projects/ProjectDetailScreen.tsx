"use client";

// Fisa unui proiect, cardul P3-07.
//
// STAREA SE SCHIMBA DE AICI, DINTR-UN SINGUR CONTROL, si fiecare schimbare
// scrie un rand in public.status_history prin set_project_status din migratia
// 0021. Nu exista alta cale din interfata catre projects.status: formularul de
// modificare nu are camp de stare tocmai ca sa nu existe a doua cale, si a doua
// cale este cea care uita sa scrie istoricul.
//
// ISTORICUL SE VEDE AICI, SCURT. P3-08 ii da o fila proprie. Pana atunci fisa
// arata ultimele cateva miscari, pentru ca un card care schimba starea si nu
// arata ca s-a schimbat cere unui om sa aiba incredere.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, CardHeader, Chip, PageHeader, Select } from "@/components/ui/primitives";
import { formatDate, formatMoney } from "@/lib/data/format";
import { PROJECT_STATUS_LABEL, type ProjectStatus } from "@/lib/data/projects-types";
import {
  ALL_STATUSES,
  PROJECT_STATUS_TONE,
  type ProjectDetail,
  type StatusEvent,
} from "@/lib/data/projects-list-types";
import { setProjectStatus } from "@/lib/data/project-actions";
import { ProjectForm } from "./ProjectForm";
import { ProjectTabs } from "./ProjectTabs";
import { ProjectBudgetPanel } from "./ProjectBudgetPanel";
import { projectBudgetSummary } from "@/lib/reporting/project-budget";
import type { ProjectMaterials } from "@/lib/data/projects-list";
import type { ProjectMaterialCost } from "@/lib/reporting/material-cost";
import type { CatalogProduct } from "@/lib/data/products";
import type { Deviz, DevizSummary } from "@/lib/data/deviz";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-2.5 border-b border-rc-line last:border-0">
      <span className="w-[160px] shrink-0 text-[12.5px] font-semibold text-rc-muted">
        {label}
      </span>
      <span className="text-[13.5px] text-rc-black">{value}</span>
    </div>
  );
}

export function ProjectDetailScreen({
  project,
  history,
  materials,
  cost,
  deviz,
  products,
  clients,
  canWrite,
}: {
  project: ProjectDetail;
  history: StatusEvent[];
  materials: ProjectMaterials;
  cost: ProjectMaterialCost;
  deviz: { list: DevizSummary[]; open: Deviz | null };
  products: CatalogProduct[];
  clients: { id: string; name: string }[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onStatusChange(next: string) {
    // NICIUN GHID DE EGALITATE AICI, SI ASTA ESTE DELIBERAT. Comparatia cu
    // project.status ar citi o proprietate care poate fi INVECHITA: intre
    // trimitere si router.refresh() componentul inca poarta starea veche, iar o
    // a doua alegere facuta in fereastra aceea ar fi ignorata in tacere. Functia
    // set_project_status din 0021 decide singura: pentru aceeasi stare nu scrie
    // nimic si intoarce changed=false. Regula sta intr-un singur loc.
    setPending(true);
    setError(null);
    const result = await setProjectStatus(project.id, next, "");
    if (!result.ok) setError(result.message);
    setPending(false);
    router.refresh();
  }

  return (
    <>
      <PageHeader
        title={project.name}
        lead={
          project.active
            ? `Șantier al clientului ${project.clientName}.`
            : `Șantier al clientului ${project.clientName}. Proiectul este dezactivat.`
        }
        actions={
          <div className="flex items-center gap-2">
            <Link href="/proiecte">
              <Button variant="secondary" data-testid="project-back">
                Înapoi la listă
              </Button>
            </Link>
            {canWrite ? (
              <Button onClick={() => setEditing(true)} data-testid="project-edit">
                Modifică
              </Button>
            ) : null}
          </div>
        }
      />

      {/* ISTORICUL S-A MUTAT PE FILA Istoric, adusa de P3-09. Rezumatul de aici
          a fost un substitut cat timp fila nu exista, si a-l lasa ar insemna doua
          locuri care randeaza aceleasi randuri cu acelasi data-testid: o afirmatie
          de test le-ar numara pe amandoua. */}
      <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
        <Card>
          <CardHeader title="Date proiect" />
          <div className="px-5 py-3" data-testid="project-detail">
            <Row
              label="Client"
              value={
                <Link href={`/clienti/${project.clientId}`} className="hover:underline">
                  {project.clientName}
                </Link>
              }
            />
            <Row label="Adresă" value={project.address?.trim() || "-"} />
            <Row label="Data început" value={project.startDate ? formatDate(project.startDate) : "-"} />
            <Row
              label="Termen estimat"
              value={project.plannedEndDate ? formatDate(project.plannedEndDate) : "-"}
            />
            <Row
              label="Buget"
              value={
                project.budgetMdl === null ? (
                  <span className="text-rc-muted">Fără buget</span>
                ) : (
                  formatMoney(project.budgetMdl)
                )
              }
            />
            <Row label="Note" value={project.notes?.trim() || "-"} />
            <Row label="Adăugat" value={formatDate(project.createdAt)} />
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Stare" hint="Fiecare schimbare rămâne în istoric" />
            <div className="p-5 space-y-3" data-testid="project-status-panel">
              {/* Starea curenta are propriul testid. Panoul contine si selectul,
                  iar selectul contine TOATE cele sase etichete ca optiuni, deci
                  o afirmatie pe panou ar trece pentru orice stare. */}
              <div className="flex items-center gap-2" data-testid="project-status-chip">
                <Chip tone={PROJECT_STATUS_TONE[project.status]}>
                  {PROJECT_STATUS_LABEL[project.status]}
                </Chip>
              </div>

              {canWrite ? (
                <Select
                  value={project.status}
                  disabled={pending}
                  onChange={(e) => onStatusChange(e.target.value)}
                  data-testid="project-status-select"
                >
                  {/* TOATE CELE SASE, IN ORDINEA DECLARARII. Conducta NU este o
                      masina de stari: munca reala merge si inapoi, si un contract
                      care se opreste in suspendat trebuie sa poata fi mutat. */}
                  {ALL_STATUSES.map((s: ProjectStatus) => (
                    <option key={s} value={s}>
                      {PROJECT_STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
              ) : null}

              {error ? (
                <p
                  role="alert"
                  data-testid="status-error"
                  className="rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
                >
                  {error}
                </p>
              ) : null}
            </div>
          </Card>

        </div>
      </div>

      {/* P3-12. Cele trei numere, INAINTE de file si niciunul dupa un click.
          Bugetul, totalul devizului acceptat si costul real sunt trei intrebari
          diferite, iar oricare doua spun o poveste incompleta: fara totalul
          devizului nu se poate deosebi o lucrare peste buget de una sub-cotata.

          Se calculeaza AICI, din ce pagina a citit deja, si nu printr-o a patra
          interogare: costul vine din modulul de cost si totalul devizului din
          aceeasi lista pe care o randeaza fila de deviz, deci cele doua ecrane
          nu pot fi in dezacord. */}
      <div className="mt-5">
        <ProjectBudgetPanel
          summary={projectBudgetSummary(project.budgetMdl, deviz.list, cost.totalValueMdl)}
        />
      </div>

      <div className="mt-5">
        <ProjectTabs
          projectId={project.id}
          materials={materials}
          cost={cost}
          history={history}
          deviz={deviz}
          products={products}
          canWrite={canWrite}
        />
      </div>

      {editing ? (
        <ProjectForm
          project={project}
          clients={clients}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </>
  );
}
