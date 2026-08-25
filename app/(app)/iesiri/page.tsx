// P2-05 Iesiri materiale, pe date reale.

import { listActiveProducts } from "@/lib/data/products";
import { listClientsAndProjects } from "@/lib/data/outbound";
import { OutboundScreen } from "@/components/outbound/OutboundScreen";

export const dynamic = "force-dynamic";

export default async function OutboundPage() {
  const [products, { clients, projects }] = await Promise.all([
    listActiveProducts(),
    listClientsAndProjects(),
  ]);

  return <OutboundScreen products={products} clients={clients} projects={projects} />;
}
