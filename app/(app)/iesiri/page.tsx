// P2-05 Iesiri materiale, pe date reale.

import { listActiveProducts } from "@/lib/data/products";
import { listSelectableProjects } from "@/lib/data/projects";
import { listClientsAndProjects } from "@/lib/data/outbound";
import { hasPhase3Schema } from "@/lib/data/schema-capability";
import { OutboundScreen } from "@/components/outbound/OutboundScreen";

export const dynamic = "force-dynamic";

export default async function OutboundPage() {
  // P3-04: destinatia nu mai este text liber. Lista vine din public.projects,
  // filtrata la proiectele deschise, si clientul se citeste de pe proiect.
  //
  // CAT TIMP MIGRATIILE FAZEI 3 NU SUNT APLICATE, tabela aceea nu exista si nu
  // ar fi nimic de ales, deci ecranul revine la destinatia in text liber. Fara
  // aceasta ramificatie, depozitul nu poate elibera material pana la aplicare.
  const phase3 = await hasPhase3Schema();
  const [products, projects, names] = await Promise.all([
    listActiveProducts(),
    phase3 ? listSelectableProjects() : Promise.resolve([]),
    phase3
      ? Promise.resolve({ clients: [] as string[], projects: [] as string[] })
      : listClientsAndProjects(),
  ]);

  return (
    <OutboundScreen
      products={products}
      projects={projects}
      phase3={phase3}
      clientNames={names.clients}
      projectNames={names.projects}
    />
  );
}
