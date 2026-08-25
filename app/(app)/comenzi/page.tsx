// P2-05 Comenzi. Ambele sensuri citesc acum din baza de date.

import { listInboundOrders } from "@/lib/data/inbound";
import { listOutboundIssues } from "@/lib/data/outbound";
import { OrdersScreen } from "@/components/orders/OrdersScreen";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const [inbound, outbound] = await Promise.all([listInboundOrders(), listOutboundIssues()]);
  return <OrdersScreen inbound={inbound} outbound={outbound} />;
}
