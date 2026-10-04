// P2-05 Iesiri materiale, pe date reale.

import { getSessionUser } from "@/lib/supabase/server";
import { listActiveProducts } from "@/lib/data/products";
import { listSelectableProjects } from "@/lib/data/projects";
import { listClientOptions } from "@/lib/data/projects-list";
import { OutboundScreen } from "@/components/outbound/OutboundScreen";

export const dynamic = "force-dynamic";

export default async function OutboundPage() {
  // P3-04: destinatia nu mai este text liber. Lista vine din public.projects,
  // filtrata la proiectele deschise, si clientul se citeste de pe proiect.
  //
  // P3-04b: THE PROJECT PICKER IS THE ONLY PATH. The free-text fallback existed
  // solely for a database without the wave 1 migrations, and it read columns 0026
  // drops. The migrations are applied, so the branch is unreachable and the
  // function behind it is gone.
  //
  // P3-119: SI CLIENTII, pentru al doilea mod. Aceeasi listClientOptions pe care o
  // citesc si filtrul si selectorul de client de pe celelalte ecrane: clientii
  // activi, o singura definitie a intrebarii "care clienti se pot alege".
  const [products, projects, clients, user] = await Promise.all([
    listActiveProducts(),
    listSelectableProjects(),
    listClientOptions(),
    getSessionUser(),
  ]);

  return (
    <OutboundScreen
      products={products}
      projects={projects}
      clients={clients}
      // P3-147: clientul de la tejghea il creeaza administratorul SAU managerul de
      // cont (hotararea q143, 2026-10-04), prin createWalkInClient si politica
      // clients_insert din migratia 0069. Regula P3-06 ramane: ecranul nu ofera un
      // buton pe care baza il va refuza. Ecranul Clienți ramane al administratorului.
      canCreateClient={user?.role === "owner" || user?.role === "account_manager"}
    />
  );
}
