// O factura, ruta de detaliu. Cardul P3-110, goal G65 partea 3.
//
// POARTA DE SCHEMA ESTE PRIMUL LUCRU, ca pe /facturare si pe /setari: getInvoice
// intoarce "pending" cand migratia 0063 nu este aplicata, si atunci se deseneaza linia
// romaneasca in loc sa cada cu 500. Aceea este INC-05.
//
// "missing" ESTE 404 SI NU UN ECRAN GOL. Un id care nu exista, un uuid stricat in bara
// de adrese si un cont fara profil activ ajung toate trei aici, si raspunsul corect
// pentru toate trei este ca nu exista nimic de aratat.
//
// RUTA STATICA /facturare/nou CASTIGA IN FATA ACESTUI SEGMENT DINAMIC, care este regula
// de potrivire a Next.js, deci "nou" nu va fi niciodata citit ca un id de factura.
//
// ZIUA DE AZI SE CITESTE AICI, o singura data pe cerere, si pleaca in jos: ziua
// serverului si ziua browserului nu au voie sa fie doua zile diferite in aceeasi
// randare, care este exact ce scrie si ruta listei.

import { notFound } from "next/navigation";
import { SchemaPending } from "@/components/ui/SchemaPending";
import { FacturaScreen } from "@/components/facturare/FacturaScreen";
import { getInvoice } from "@/lib/data/facturare-detail";
import { nextInvoiceNumberText } from "@/lib/data/facturare-create";
import { chisinauToday } from "@/lib/data/format";

export const dynamic = "force-dynamic";

const LEAD = "O factură, cu părțile, pozițiile și istoricul ei.";

export default async function FacturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const read = await getInvoice(id);

  if (read.state === "pending") return <SchemaPending title="Factură" lead={LEAD} />;
  if (read.state === "missing") notFound();

  // NUMARUL URMATOR SE CERE NUMAI CAND CONTEAZA: confirmarea de la Emite exista doar
  // pentru o ciorna. Pe o factura emisa, platita sau anulata ar fi doua citiri in plus
  // pentru o propozitie care nu se deseneaza.
  const nextNumberText =
    read.invoice.status === "draft" ? await nextInvoiceNumberText() : "";

  return (
    <FacturaScreen
      invoice={read.invoice}
      nextNumberText={nextNumberText}
      today={chisinauToday()}
    />
  );
}
