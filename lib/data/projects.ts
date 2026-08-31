import "server-only";

// Citirile proiectelor. Cardul P3-04 aduce primul consumator: selectorul
// obligatoriu de proiect din formularul de iesire.
//
// Nu exista inca un ecran Proiecte. El este cardul P3-07 din valul 2, iar acest
// fisier este scris ca sa fie folosit si de acolo: o singura interogare pentru
// "proiectele din care se poate alege", nu doua care se despart in timp.

import { createClient } from "@/lib/supabase/server";
import type { SelectableProject } from "./projects-types";
import { one } from "./row";

/**
 * Proiectele din care se poate alege o destinatie, grupate dupa client.
 *
 * FILTRUL ESTE CEL DIN P3-04: proiectele inchise nu apar, pentru ca nu mai
 * pleaca material catre un santier inchis, si un proiect dezactivat nu apare
 * deloc. Restul starilor raman, inclusiv suspendat: un santier oprit primeste
 * uneori un transport, iar a-l ascunde ar impinge operatorul inapoi la text
 * liber, ceea ce este exact ce inlatura cardul.
 *
 * Ordinea este client, apoi proiect, dupa reguli romanesti de colationare, ca
 * lista sa citeasca la fel ca orice alta lista din aplicatie.
 */
export async function listSelectableProjects(): Promise<SelectableProject[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, status, active, clients ( id, name )")
    .eq("active", true)
    .neq("status", "closed");

  if (error || !data) return [];

  const rows: SelectableProject[] = [];
  for (const row of data) {
    // Supabase tipizeaza relatia ca obiect sau tablou dupa forma cheii straine,
    // asa ca amandoua formele sunt acceptate aici in loc sa fie presupusa una.
    const clientRaw = (row as { clients?: unknown }).clients;
    const client = one(clientRaw);
    const clientName = (client as { name?: string } | undefined)?.name;
    const clientId = (client as { id?: string } | undefined)?.id;
    if (!clientName || !clientId) continue;

    rows.push({
      id: row.id as string,
      name: row.name as string,
      status: row.status as SelectableProject["status"],
      clientId,
      clientName,
    });
  }

  return rows.sort(
    (a, b) =>
      a.clientName.localeCompare(b.clientName, "ro") || a.name.localeCompare(b.name, "ro"),
  );
}
