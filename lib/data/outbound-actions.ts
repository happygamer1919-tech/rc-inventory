"use server";

// Scrierile iesirilor. Trec prin functiile din migratia 0004, ca verificarea de
// stoc sa se faca sub blocaj, in aceeasi tranzactie cu scrierea.

import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { checkThresholdsFor } from "@/lib/reminders/notify";
import { nextOutboundReference } from "./outbound";
import { hasPhase3Schema } from "./schema-capability";
import { unitLabel, isUnitCode } from "./units";
import type { ActionResult } from "./inbound-types";
import type { NewIssueInput } from "./outbound-types";
import { one } from "./row";

/**
 * Traduce eroarea masinala ridicata de create_outbound_issue in propozitia
 * romaneasca pe care o vede operatorul.
 *
 * Functia SQL ridica INSUFFICIENT_STOCK|<product_id>|<available>|<unit>. Textul
 * de interfata se compune aici, nu in baza de date, din acelasi motiv pentru
 * care valorile de enum sunt tokenuri englezesti: copia de interfata este
 * romaneasca si nu are ce cauta in schema.
 */
async function translateStockError(message: string): Promise<string | null> {
  const match = /INSUFFICIENT_STOCK\|([0-9a-f-]+)\|([-\d.]+)\|(\w+)/i.exec(message);
  if (!match) return null;

  const [, productId, availableRaw, unitRaw] = match;
  const available = Number(availableRaw);
  const unit = isUnitCode(unitRaw) ? unitLabel(unitRaw) : (unitRaw ?? "");

  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("name")
    .eq("id", productId!)
    .maybeSingle();

  const shown = new Intl.NumberFormat("ro-MD", { maximumFractionDigits: 2 }).format(
    Number.isFinite(available) ? available : 0,
  );
  const name = (data?.name as string | undefined) ?? "produsul ales";
  return `Stoc insuficient pentru ${name}: disponibil ${shown} ${unit}.`;
}

async function translateWriteError(
  code: string | undefined,
  message: string,
): Promise<ActionResult<never>> {
  const stock = await translateStockError(message);
  if (stock) return { ok: false, message: stock, field: "lines" };

  if (code === "23505")
    return { ok: false, message: "Există deja o ieșire cu această referință. Încearcă din nou." };
  if (code === "42501") return { ok: false, message: "Nu ai dreptul să faci această operațiune." };
  if (code === "P0001" || code === "P0002") return { ok: false, message };
  return { ok: false, message: `Operațiunea a eșuat. ${message}` };
}

export async function createOutboundIssue(
  input: NewIssueInput,
): Promise<ActionResult<{ id: string; reference: string }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };

  // P3-04: DESTINATIA ESTE UN PROIECT SI ESTE OBLIGATORIE. Asa se opreste
  // multimea de iesiri fara proiect din a mai creste, cat timp cele istorice
  // sunt reconciliate. Coloana din baza ramane NULLABLE, pentru ca randurile
  // vechi o au goala; obligatorie este CALEA DE SCRIERE, nu coloana.
  //
  // CAT TIMP MIGRATIILE FAZEI 3 NU SUNT APLICATE, nu exista niciun proiect de
  // ales SI nu exista nici versiunea cu cinci argumente a functiei, adaugata de
  // 0018. Pe calea aceea se scrie ca inainte de P3-04, cu nume in text liber.
  // Nu este o slabire a regulii: regula nu poate exista pe o baza care nu are
  // tabela de proiecte, iar alternativa este un depozit care nu poate elibera
  // material deloc.
  const phase3 = await hasPhase3Schema();
  const projectId = input.projectId.trim();
  if (phase3 && projectId.length === 0)
    return { ok: false, message: "Alege proiectul.", field: "projectId" };

  const fallbackClient = (input.clientName ?? "").trim();
  const fallbackProject = (input.projectName ?? "").trim();
  if (!phase3 && fallbackClient.length === 0)
    return { ok: false, message: "Completează clientul.", field: "clientName" };
  if (!phase3 && fallbackProject.length === 0)
    return { ok: false, message: "Completează proiectul.", field: "projectName" };

  const lines = input.lines
    .map((l) => ({
      product_id: l.productId.trim(),
      quantity: Number(String(l.quantity).replace(",", ".")),
      sale_price_mdl:
        String(l.salePriceMdl).trim() === ""
          ? null
          : Number(String(l.salePriceMdl).replace(",", ".")),
    }))
    .filter((l) => l.product_id.length > 0 && Number.isFinite(l.quantity) && l.quantity > 0);

  if (lines.length === 0)
    return {
      ok: false,
      message: "Adaugă cel puțin o poziție cu produs și cantitate.",
      field: "lines",
    };

  if (
    lines.some(
      (l) => l.sale_price_mdl !== null && (!Number.isFinite(l.sale_price_mdl) || l.sale_price_mdl < 0),
    )
  )
    return { ok: false, message: "Prețul de vânzare trebuie să fie un număr pozitiv.", field: "lines" };

  const supabase = await createClient();
  const reference = await nextOutboundReference();

  // p_client_name si p_project_name sunt trimise goale INTENTIONAT. Migratia
  // 0018 le rescrie din proiectul ales si nu se uita la ce vine de aici, exact
  // ca sa nu poata cele doua reprezentari ale destinatiei sa se contrazica cat
  // timp exista amandoua. Coloanele text sunt inca not null si dispar la
  // P3-04b; pana atunci ele sunt o copie a proiectului, nu o a doua sursa.
  const { data, error } = phase3
    ? await supabase.rpc("create_outbound_issue", {
        p_reference: reference,
        p_client_name: "",
        p_project_name: "",
        p_lines: lines,
        p_project_id: projectId,
      })
    : // Semnatura cu patru argumente, cea din 0004, singura care exista pe o
      // baza fara migratiile fazei 3. Numele sunt cele scrise de operator.
      await supabase.rpc("create_outbound_issue", {
        p_reference: reference,
        p_client_name: fallbackClient,
        p_project_name: fallbackProject,
        p_lines: lines,
      });

  if (error) return translateWriteError(error.code, error.message);

  // Crearea iesirii ESTE miscarea de stoc: randurile din outbound_lines sunt
  // scrise de create_outbound_issue si stocul scade cu ele. Verificarea pragului
  // se face aici, dupa ce tranzactia s-a inchis, deci o trimitere esuata nu are
  // ce sa anuleze (P2-10).
  await checkThresholdsFor(lines.map((l) => l.product_id));

  revalidatePath("/iesiri");
  revalidatePath("/comenzi");
  revalidatePath("/inventar");
  revalidatePath("/memento");
  return { ok: true, value: { id: data as string, reference } };
}

/**
 * Marcarea ca Expediata. NU ESTE O MISCARE DE STOC, deci nu verifica praguri.
 *
 * Stocul a scazut deja la crearea iesirii, cand s-au scris randurile din
 * outbound_lines. Expedierea muta doar statusul si scrie un rand de istoric.
 * O verificare aici ar reciti aceleasi numere si nu ar putea gasi nicio
 * traversare noua.
 */
export async function shipOutboundIssue(
  issueId: string,
): Promise<ActionResult<{ alreadyShipped: boolean }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ship_outbound_issue", { p_issue_id: issueId });
  if (error) return translateWriteError(error.code, error.message);

  const row = one(data);
  revalidatePath("/iesiri");
  revalidatePath("/comenzi");
  return { ok: true, value: { alreadyShipped: Boolean(row?.already_shipped) } };
}

