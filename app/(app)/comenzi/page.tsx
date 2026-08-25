// P2-04 Comenzi. Intrarile sunt reale; iesirile raman pe stratul demonstrativ
// pana la P2-05, iar ecranul spune asta pe fata.

import { listInboundOrders } from "@/lib/data/inbound";
import { OrdersScreen } from "@/components/orders/OrdersScreen";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const inbound = await listInboundOrders();
  return <OrdersScreen inbound={inbound} />;
}
