"use server";

// Scrierile iesirilor. Trec prin functiile din migratia 0004, ca verificarea de
// stoc sa se faca sub blocaj, in aceeasi tranzactie cu scrierea.

import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { checkThresholdsFor } from "@/lib/reminders/notify";
import { nextOutboundReference } from "./outbound";
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

  // P3-04: DESTINATIA ESTE UN PROIECT SI ESTE OBLIGATORIE.
  //
  // P3-04b A INCHIS SI ULTIMA PORTITA: coloana este acum NOT NULL, nu doar calea
  // de scriere, iar cele doua coloane text au disparut. Sonda hasPhase3Schema()
  // nu mai are ce sa ramifice aici, pentru ca schema fara faza 3 nu mai este o
  // stare in care aceasta functie poate rula deloc.
  const projectId = input.projectId.trim();
  // P3-04b: THE PROJECT IS REQUIRED, FULL STOP. outbound_issues.project_id is
  // NOT NULL as of 0026 and the free-text columns are gone, so there is no
  // longer a shape of this call that records a destination without one.
  if (projectId.length === 0)
    return { ok: false, message: "Alege proiectul.", field: "projectId" };

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

  // p_client_name si p_project_name sunt trimise goale INTENTIONAT SI SUNT
  // IGNORATE. Migratia 0026 a sters coloanele pe care le umpleau si a pastrat
  // semnatura cu cinci argumente asa cum era, ca sa nu fie nevoie de un al
  // doilea DROP FUNCTION si ca sa nu cada afirmatia de semnatura din aplicator.
  // Destinatia este p_project_id si nimic altceva.
  //
  // RAMURA CU PATRU ARGUMENTE A DISPARUT. Functia aceea a fost stearsa de 0018,
  // care este aplicata pe productie de pe 2026-08-31, deci ramura nu mai avea ce
  // sa cheme: ar fi raspuns "function does not exist", nu ar fi degradat elegant.
  const { data, error } = await supabase.rpc("create_outbound_issue", {
    p_reference: reference,
    p_client_name: "",
    p_project_name: "",
    p_lines: lines,
    p_project_id: projectId,
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

