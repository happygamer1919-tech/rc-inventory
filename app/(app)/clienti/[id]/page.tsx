// P3-06 Clienti, ruta de detaliu. P3-08 ii adauga cele cinci file.

import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getClient } from "@/lib/data/clients";
import {
  getClientMaterials,
  listClientContacts,
  listClientProjects,
} from "@/lib/data/client-detail";
import { ClientDetailScreen } from "@/components/clients/ClientDetailScreen";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await getClient(id);

  // Un id care nu exista este 404, nu un ecran gol. Se citeste INTAI clientul si
  // abia apoi filele: patru interogari pentru un id inexistent ar fi patru
  // interogari degeaba.
  if (!client) notFound();

  const [user, contacts, projects, materials] = await Promise.all([
    getSessionUser(),
    listClientContacts(id),
    listClientProjects(id),
    getClientMaterials(id),
  ]);

  return (
    <ClientDetailScreen
      client={client}
      contacts={contacts}
      projects={projects}
      materials={materials}
      canWrite={user?.role === "owner"}
    />
  );
}
