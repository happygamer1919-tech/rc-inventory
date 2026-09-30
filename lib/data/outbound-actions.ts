"use server";

// Scrierile iesirilor. Trec prin functiile din migratia 0004, ca verificarea de
// stoc sa se faca sub blocaj, in aceeasi tranzactie cu scrierea.

import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { checkThresholdsFor } from "@/lib/reminders/notify";
import { nextOutboundReference } from "./outbound";
import { unitLabel, isUnitCode } from "./units";
import { validateNewIssue } from "./outbound-mode";
import type { ActionResult } from "./inbound-types";
import type { NewIssueInput, OutboundMode } from "./outbound-types";
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
  // P3-118. CELE DOUA RESTRICTII DE FORMA ALE MODULUI, pe nume, ca refuzul bazei
  // sa ajunga la operator ca propozitie si nu ca nume de restrictie. Ele apara
  // apelantii care nu sunt acest fisier, deci mesajul trebuie sa existe si aici.
  if (code === "23514") {
    if (message.includes("outbound_issues_direct_client_mode_shape"))
      return {
        ok: false,
        message:
          "O ieșire către un client direct are nevoie de client și de data ridicării, și nu are proiect.",
      };
    if (message.includes("outbound_issues_project_mode_shape"))
      return {
        ok: false,
        message: "O ieșire pe proiect are nevoie de proiect și nu are dată de ridicare.",
      };
  }
  // P3-118. Ziua ridicarii, cand nu exista in calendar. Singura autoritate
  // asupra unei date este coloana `date` din PostgreSQL; aici se traduce refuzul
  // ei, ca sa nu existe o a doua verificare de calendar in acest depozit.
  if (code === "22007" || code === "22008")
    return {
      ok: false,
      message: "Data ridicării nu este validă. Scrie ziua, luna și anul, de exemplu 01.12.2026.",
      field: "pickupDate",
    };
  if (code === "23503")
    return { ok: false, message: "Clientul sau proiectul ales nu mai există. Reîncarcă pagina." };
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
  //
  // P3-118 SI HOTARAREA R-215 NARROW ACEA PROPOZITIE SI NU O STERG. Ea rămâne
  // adevarata despre modul pe care il descrie: o iesire PE PROIECT are nevoie de
  // proiect, de la faza 1 incoace. Ce se schimba este ca a incetat sa fie
  // singurul mod. Coloana project_id nu mai este NOT NULL la nivel de coloana,
  // fiindca o iesire catre client direct nu are proiect; cerinta este purtata de
  // outbound_issues_project_mode_shape din migratia 0067, care o cere pentru
  // fiecare rand al modului "project", si nicio iesire pe proiect nu poate fi
  // scrisa fara ea nici de aici, nici de vreun alt apelant.
  const mode: OutboundMode = input.mode ?? "project";
  const projectId = (input.projectId ?? "").trim();
  const clientId = (input.clientId ?? "").trim();
  const pickupDate = (input.pickupDate ?? "").trim();

  // CE CERE FIECARE MOD, o singura data, in lib/data/outbound-mode.ts. Acolo si
  // unitatile se verifica, din ALL_UNITS si fara nicio lista proprie, D3.
  const refusal = validateNewIssue({ ...input, mode });
  if (refusal) return { ok: false, message: refusal.message, field: refusal.field };

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

  // O SINGURA CHEMARE, PENTRU AMANDOUA MODURILE, SI ASTA ESTE CHIAR CE CERE
  // CARDUL. Scaderea de stoc nu se ramifica: blocajele, verificarea de descoperire
  // insumata pe produs sub ele, scrierea pozitiilor si primul rand de istoric sunt
  // un singur bloc in public.create_outbound_issue si ruleaza la fel pentru
  // amandoua. Modul hotaraste numai care coloane ale randului de iesire se umplu.
  // Nu exista o a doua rutina de scadere, niciun contor stocat si niciun total
  // scris nicaieri: stocul este loturi minus pozitii de iesire, prin
  // public.product_available_stock.
  //
  // p_client_name SI p_project_name AU DISPARUT DIN SEMNATURA. 0026 le-a pastrat,
  // primite si ignorate, pentru un singur motiv pe care l-a si scris: o reformare
  // ar fi cerut un DROP FUNCTION si ar fi facut sa cada afirmatia de semnatura din
  // aplicator. Cardul APPLY-01 a inlocuit afirmatia aceea cu una derivata din ce
  // declara chiar lotul, deci motivul este consumat, si doua parametri morti intr-o
  // semnatura nou scrisa ar fi mai rau decat scoaterea pe care o evitau.
  const { data, error } = await supabase.rpc("create_outbound_issue", {
    p_reference: reference,
    p_lines: lines,
    p_project_id: mode === "project" ? projectId : null,
    p_mode: mode,
    p_client_id: mode === "direct_client" ? clientId : null,
    p_pickup_date: mode === "direct_client" ? pickupDate : null,
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

