// Tipurile listei de proiecte, fara nimic de server. Cardul P3-07.

import type { ProjectStatus } from "./projects-types";

/** Un rand din lista. CINCI CAMPURI PENTRU CINCI COLOANE: Denumire, Client,
 *  Stare, Termen estimat, Buget. Adresa si notele sunt detaliu, nu lista, si
 *  tipul acesta este regula scrisa in TypeScript. Adresa apare totusi aici
 *  pentru ca este CAUTABILA, nu pentru ca se afiseaza. */
export type ProjectRow = {
  id: string;
  name: string;
  address: string | null;
  status: ProjectStatus;
  plannedEndDate: string | null;
  budgetMdl: number | null;
  clientId: string;
  clientName: string;
};

export type ProjectDetail = ProjectRow & {
  startDate: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
};

export type StatusEvent = {
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  createdAt: string;
};

/** CELE PATRU STARI VII, care sunt implicitul listei.
 *
 *  P3-07: o lista care se deschide aratand fiecare santier inchis de acum doi
 *  ani este exact defectul pe care doctrina de densitate exista sa il opreasca.
 *  "toate" arata toate sase si spune ca o face. */
export const LIVE_STATUSES: ProjectStatus[] = ["lead", "offer", "contract", "active"];

export const ALL_STATUSES: ProjectStatus[] = [
  "lead",
  "offer",
  "contract",
  "active",
  "suspended",
  "closed",
];

/** Culorile starilor, FIXATE AICI ca vederea de conducta din valul 3 sa nu
 *  inventeze o a doua schema. Numele de tonuri sunt cele din Chip. */
export const PROJECT_STATUS_TONE: Record<ProjectStatus, "neutral" | "ok" | "warn"> = {
  lead: "neutral",
  offer: "neutral",
  contract: "ok",
  active: "ok",
  suspended: "warn",
  closed: "neutral",
};

export type ProjectListQuery = {
  q: string;
  statuses: ProjectStatus[];
  /** true cand utilizatorul a cerut explicit toate cele sase stari. */
  allStatuses: boolean;
  clientId: string;
  page: number;
};

export const PROJECTS_PAGE_SIZE = 25;
