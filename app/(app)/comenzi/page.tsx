// P2-05 Comenzi. Ambele sensuri citesc din baza de date.
// P3-10 adauga filtrul de destinatie, venit din URL.
// P3-142 aduce iesirile pe pagini (?pagina=2), cu filtrele puse in cererea de citire.

import { listInboundOrders } from "@/lib/data/inbound";
import { listOutboundIssuesPage, outboundModeVisible } from "@/lib/data/outbound";
import { parsePage } from "@/lib/data/list-paging";
import { isOutboundMode } from "@/lib/data/outbound-mode";
import { getClient } from "@/lib/data/clients";
import { getProject } from "@/lib/data/projects-list";
import { looksLikeUuid } from "@/lib/data/suppliers-types";
import { OrdersScreen } from "@/components/orders/OrdersScreen";

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ proiect?: string; client?: string; tip?: string; pagina?: string }>;
}) {
  const { proiect, client, tip, pagina } = await searchParams;

  // ETICHETA FILTRULUI VINE DE PE INREGISTRARE, nu din URL. Un ecran care ar
  // scrie in antet ce i s-a dat in bara de adrese ar afisa orice, inclusiv un id
  // care nu exista. Se afla INAINTE de citirea listei, fiindca filtrul se pune in
  // cererea ei.
  //
  // P3-260. UN FILTRU CERUT, DAR FARA INREGISTRARE (id sters, scris gresit sau care nu este uuid),
  // NU SE TRANSFORMA IN "FARA FILTRU": lista ar arata toate iesirile ca si cum ar fi raspunsul.
  // Ramane `missingFilter`, lista iese goala fara citire, iar ecranul spune ce lipseste.
  let filter: { kind: "proiect" | "client"; id: string; label: string } | null = null;
  let missingFilter: "proiect" | "client" | null = null;
  if (proiect) {
    const p = looksLikeUuid(proiect) ? await getProject(proiect) : null;
    if (p) filter = { kind: "proiect", id: p.id, label: p.name };
    else missingFilter = "proiect";
  } else if (client) {
    const c = looksLikeUuid(client) ? await getClient(client) : null;
    if (c) filter = { kind: "client", id: c.id, label: c.name };
    else missingFilter = "client";
  }

  // P3-142. IESIRILE VIN PE PAGINI, cu filtrele (destinatie, fel de eliberare) puse in cerere
  // si pagina din adresa. Intrarile raman neimpartite: lista lor nu are filtre si este scurta
  // (comenzile catre furnizori). Tabloul de bord si necesarul citesc in continuare toate
  // iesirile, prin listOutboundIssues: au nevoie de totaluri pe toate.
  //
  // P3-120, DECIZIA B. Al doilea fel de iesire exista in schema? Cat timp
  // raspunsul este nu, ecranul este cel de dinainte de acest card: nicio
  // eticheta de mod, niciun filtru de mod, nicio data de ridicare. Intrebarea este despre
  // BAZA si nu despre o iesire anume, deci vine ca un singur raspuns pentru tot
  // ecranul si nu ca un camp pe fiecare rand.
  const mode = isOutboundMode(tip) ? tip : undefined;
  const [inbound, outbound, modeVisible] = await Promise.all([
    listInboundOrders(),
    missingFilter
      ? Promise.resolve({ issues: [], total: 0, awaiting: 0, page: 1 })
      : listOutboundIssuesPage(
          {
            projectId: filter?.kind === "proiect" ? filter.id : undefined,
            clientId: filter?.kind === "client" ? filter.id : undefined,
            mode,
          },
          parsePage(pagina),
        ),
    outboundModeVisible(),
  ]);

  return (
    <OrdersScreen
      inbound={inbound}
      outbound={outbound.issues}
      outboundTotal={outbound.total}
      outboundAwaiting={outbound.awaiting}
      page={outbound.page}
      modeFilter={modeVisible && mode ? mode : "toate"}
      filter={filter}
      missingFilter={missingFilter}
      modeVisible={modeVisible}
    />
  );
}
