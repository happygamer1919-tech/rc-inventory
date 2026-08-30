// P3-06 Clienti, ruta de detaliu.

import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getClient } from "@/lib/data/clients";
import { ClientDetailScreen } from "@/components/clients/ClientDetailScreen";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, client] = await Promise.all([getSessionUser(), getClient(id)]);

  // Un id care nu exista este 404, nu un ecran gol. Ruta se poate ajunge dintr-o
  // legatura veche catre un client care intre timp a fost redenumit sau nu a
  // existat niciodata.
  if (!client) notFound();

  return <ClientDetailScreen client={client} canWrite={user?.role === "owner"} />;
}
