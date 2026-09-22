// P3-91 Azi: leadurile si clientii de sunat azi sau intarziati, goal G46.

import { getSessionUser } from "@/lib/supabase/server";
import { hasPhase3Schema } from "@/lib/data/schema-capability";
import { SchemaPending } from "@/components/ui/SchemaPending";
import { listClientOwnerChoices } from "@/lib/data/clients";
import { getAziList } from "@/lib/data/azi";
import { AziScreen } from "@/components/clients/AziScreen";

export const dynamic = "force-dynamic";

export default async function AziPage({
  searchParams,
}: {
  searchParams: Promise<{ responsabil?: string }>;
}) {
  // Migratiile fazei 3 sunt scrise si NEAPLICATE pana la cardul P3-27. Fara
  // aceasta poarta, ecranul cere tabele care nu exista si raspunde 500.
  if (!(await hasPhase3Schema())) {
    return <SchemaPending title="Azi" lead="Leadurile și clienții de sunat azi." />;
  }

  const [user, list, owners, params] = await Promise.all([
    getSessionUser(),
    getAziList(),
    listClientOwnerChoices(),
    searchParams,
  ]);

  // FILTRUL RESPONSABIL STA IN ADRESA, ca orice filtru de lista. Un id care nu este
  // in lista de responsabili nu filtreaza nimic: o legatura veche arata tot, nu gol.
  const ownerId = owners.some((o) => o.id === params.responsabil) ? params.responsabil! : "";
  const rows = ownerId === "" ? list.rows : list.rows.filter((r) => r.ownerId === ownerId);

  return (
    <AziScreen
      rows={rows}
      owners={owners}
      ownerId={ownerId}
      // Numai administratorul scrie note (client_notes_insert din 0059), deci numai
      // el vede Am sunat: un buton pe care baza il refuza este defectul (P3-06).
      canWrite={user?.role === "owner"}
      nextActionAvailable={list.nextActionAvailable}
    />
  );
}
