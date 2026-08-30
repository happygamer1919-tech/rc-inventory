// P2-05 Iesiri materiale, pe date reale.

import { listActiveProducts } from "@/lib/data/products";
import { listSelectableProjects } from "@/lib/data/projects";
import { OutboundScreen } from "@/components/outbound/OutboundScreen";

export const dynamic = "force-dynamic";

export default async function OutboundPage() {
  // P3-04: destinatia nu mai este text liber. Lista vine din public.projects,
  // filtrata la proiectele deschise, si clientul se citeste de pe proiect.
  const [products, projects] = await Promise.all([
    listActiveProducts(),
    listSelectableProjects(),
  ]);

  return <OutboundScreen products={products} projects={projects} />;
}
