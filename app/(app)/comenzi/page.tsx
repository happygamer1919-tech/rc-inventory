// P2-05 Comenzi. Ambele sensuri citesc din baza de date.
// P3-10 adauga filtrul de destinatie, venit din URL.

import { listInboundOrders } from "@/lib/data/inbound";
import { listOutboundIssues } from "@/lib/data/outbound";
import { getClient } from "@/lib/data/clients";
import { getProject } from "@/lib/data/projects-list";
import { OrdersScreen } from "@/components/orders/OrdersScreen";

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ proiect?: string; client?: string }>;
}) {
  const { proiect, client } = await searchParams;
  const [inbound, outbound] = await Promise.all([listInboundOrders(), listOutboundIssues()]);

  // ETICHETA FILTRULUI VINE DE PE INREGISTRARE, nu din URL. Un ecran care ar
  // scrie in antet ce i s-a dat in bara de adrese ar afisa orice, inclusiv un id
  // care nu exista.
  let filter: { kind: "proiect" | "client"; id: string; label: string } | null = null;
  if (proiect) {
    const p = await getProject(proiect);
    if (p) filter = { kind: "proiect", id: p.id, label: p.name };
  } else if (client) {
    const c = await getClient(client);
    if (c) filter = { kind: "client", id: c.id, label: c.name };
  }

  return <OrdersScreen inbound={inbound} outbound={outbound} filter={filter} />;
}
