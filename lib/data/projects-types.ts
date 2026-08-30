// Tipurile proiectelor, fara nimic de server.
//
// Acelasi motiv ca la outbound-types si inbound-types: un component de client
// care ia de aici o valoare nu trebuie sa traga in bundle un modul marcat
// "server-only".

/** Cele sase stari din migratia 0016, in ordinea conductei. */
export type ProjectStatus = "lead" | "offer" | "contract" | "active" | "suspended" | "closed";

/** Etichetele romanesti. Valorile stocate raman tokenuri englezesti (P2-01). */
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  lead: "Prospect",
  offer: "Ofertă",
  contract: "Contract",
  active: "În lucru",
  suspended: "Suspendat",
  closed: "Închis",
};

/** Un proiect asa cum il vede un selector: cu clientul lui, pentru grupare. */
export type SelectableProject = {
  id: string;
  name: string;
  status: ProjectStatus;
  clientId: string;
  clientName: string;
};
