import "server-only";

// Regula mementourilor: cand se trimite un email si cand nu.
//
// UN EMAIL PE PRODUS PE TRAVERSARE, REARMAT CAND STOCUL URCA INAPOI PESTE PRAG.
// Randul din reminders poarta starea in is_armed. Coborarea sub prag trimite si
// dezarmeaza; cat timp stocul ramane sub prag nu se mai trimite nimic; o
// receptie care ridica stocul peste prag rearmeaza, si urmatoarea coborare
// trimite din nou. Fara regula asta un depozit care sta o saptamana sub prag
// trimite un email pe fiecare linie de iesire si operatorul filtreaza
// expeditorul, adica exact rezultatul opus celui cautat.
//
// SE VERIFICA LA FIECARE MISCARE DE STOC, pe acelasi drum care scrie miscarea:
// receptia unei comenzi de intrare si crearea unei iesiri. Fara cron, fara job
// programat, fara Inngest. Marcarea ca Expediata NU este o miscare de stoc:
// stocul scade la crearea iesirii, cand se scriu randurile din outbound_lines,
// deci acolo se verifica.
//
// VERIFICAREA RULEAZA DUPA CE TRANZACTIA MISCARII S-A INCHEIAT. Functiile din
// migratiile 0003 si 0004 s-au comis inainte ca acest cod sa fie chemat, deci o
// trimitere esuata nu are ce sa anuleze. Aceasta este garantia "o trimitere
// esuata nu blocheaza miscarea de stoc", si este structurala, nu o intentie.
//
// UN PRAG DE ZERO NU ESTE UN PRAG. products.threshold are implicit 0, deci
// fiecare produs creat fara prag ar trimite un email prima data cand se
// goleste. Un email pe care nimeni nu l-a cerut este cum ajunge expeditorul
// filtrat, si atunci si mementourile cerute se pierd. Cine vrea alerta la
// epuizare pune pragul pe ecranul produsului.

import { createClient } from "@/lib/supabase/server";
import { unitLabel, isUnitCode, type UnitCode } from "@/lib/data/units";
import { sendEmail } from "./resend";

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  threshold: number | string;
  active: boolean;
};

type ReminderRow = {
  id: string;
  is_armed: boolean;
  email_enabled: boolean;
};

function toNumber(value: unknown): number {
  // numeric() vine din PostgREST ca string, ca sa nu piarda precizie.
  const n = typeof value === "string" ? Number(value) : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatQuantity(value: number, unit: UnitCode): string {
  return `${new Intl.NumberFormat("ro-MD", { maximumFractionDigits: 2 }).format(value)} ${unitLabel(unit)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Corpul romanesc al emailului: produsul, SKU-ul, stocul si pragul. */
function compose(product: { sku: string; name: string }, stock: string, threshold: string) {
  const subject = `Stoc sub prag: ${product.name} (${product.sku})`;
  const text = [
    "Stocul unui produs a coborât sub pragul de recomandă.",
    "",
    `Produs: ${product.name}`,
    `Cod: ${product.sku}`,
    `Stoc curent: ${stock}`,
    `Prag: ${threshold}`,
    "",
    "Acest mesaj se trimite o singură dată pe traversare. Se rearmează când stocul urcă din nou peste prag.",
  ].join("\n");

  const html = [
    "<p>Stocul unui produs a coborât sub pragul de recomandă.</p>",
    "<ul>",
    `<li><strong>Produs:</strong> ${escapeHtml(product.name)}</li>`,
    `<li><strong>Cod:</strong> ${escapeHtml(product.sku)}</li>`,
    `<li><strong>Stoc curent:</strong> ${escapeHtml(stock)}</li>`,
    `<li><strong>Prag:</strong> ${escapeHtml(threshold)}</li>`,
    "</ul>",
    "<p>Acest mesaj se trimite o singură dată pe traversare. Se rearmează când stocul urcă din nou peste prag.</p>",
  ].join("");

  return { subject, text, html };
}

/**
 * Verifica pragurile produselor date si trimite ce trebuie trimis.
 *
 * NU ARUNCA NICIODATA. Este chemata dupa ce miscarea de stoc s-a scris deja;
 * daca ar arunca, operatorul ar vedea o eroare pentru o comanda care a reusit.
 */
export async function checkThresholdsFor(productIds: string[]): Promise<void> {
  const unique = [...new Set(productIds.filter((id) => id.trim().length > 0))];
  if (unique.length === 0) return;

  try {
    const supabase = await createClient();

    const { data: products } = await supabase
      .from("products")
      .select("id, sku, name, unit, threshold, active")
      .in("id", unique);

    if (!products || products.length === 0) return;

    // Destinatarii se citesc LENES si o singura data pe lot: cele mai multe
    // miscari de stoc nu traverseaza niciun prag, si acelea nu au de ce sa
    // intrebe cine ar fi primit emailul.
    let cached: Recipients | null = null;
    const recipients = async (): Promise<Recipients> => {
      cached ??= await loadRecipients(supabase);
      return cached;
    };

    for (const raw of products as ProductRow[]) {
      await checkOne(supabase, raw, recipients);
    }
  } catch {
    // Miscarea de stoc este deja scrisa. Un memento care nu a putut fi calculat
    // nu are voie sa se vada ca un esec al comenzii.
  }
}

type Recipients = { emails: string[]; error: string | null };

/**
 * Adresele administratorilor activi.
 *
 * owner_reminder_recipients este SECURITY DEFINER si vine din migratia 0006,
 * pentru ca profiles_select nu lasa un operator sa citeasca randul
 * administratorului. Daca functia lipseste din proiect, motivul se intoarce ca
 * atare si ajunge pe randul de memento: "nu exista administrator" si "functia nu
 * este aplicata" sunt doua defecte diferite si nu au voie sa arate la fel.
 */
async function loadRecipients(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Recipients> {
  const { data, error } = await supabase.rpc("owner_reminder_recipients");

  if (error) {
    return {
      emails: [],
      error: `Lista destinatarilor nu a putut fi citita: ${error.message}. Verifica daca migratia 0006 este aplicata pe proiect.`,
    };
  }

  const emails = Array.isArray(data)
    ? data
        .map((r: unknown) =>
          typeof r === "string" ? r : String((r as { email?: string } | null)?.email ?? ""),
        )
        .filter((email: string) => email.trim().length > 0)
    : [];

  return { emails, error: null };
}

async function checkOne(
  supabase: Awaited<ReturnType<typeof createClient>>,
  product: ProductRow,
  recipients: () => Promise<Recipients>,
): Promise<void> {
  if (!product.active) return;

  const threshold = toNumber(product.threshold);
  // Un prag de zero nu este un prag. Vezi antetul fisierului.
  if (threshold <= 0) return;

  const { data: stockData } = await supabase.rpc("product_available_stock", {
    p_product_id: product.id,
  });
  const stock = toNumber(stockData);
  const below = stock <= threshold;

  // Randul de memento se creeaza lenes, la prima verificare a produsului.
  // upsert pe constrangerea unica de product_id, ca doua miscari simultane sa nu
  // poata insera doua randuri pentru acelasi produs.
  const { data: existing } = await supabase
    .from("reminders")
    .select("id, is_armed, email_enabled")
    .eq("product_id", product.id)
    .maybeSingle();

  let reminder = existing as ReminderRow | null;
  if (!reminder) {
    const { data: created } = await supabase
      .from("reminders")
      .upsert({ product_id: product.id }, { onConflict: "product_id" })
      .select("id, is_armed, email_enabled")
      .maybeSingle();
    reminder = created as ReminderRow | null;
    if (!reminder) return;
  }

  if (!below) {
    // Stocul este peste prag. Rearmeaza, daca nu este deja armat. last_fired_at
    // si perechea lui raman pe rand: sunt istoric, nu stare.
    if (!reminder.is_armed) {
      await supabase.from("reminders").update({ is_armed: true }).eq("id", reminder.id);
    }
    return;
  }

  // Sub prag. Se trimite doar daca randul este armat si emailul este pornit.
  if (!reminder.is_armed || !reminder.email_enabled) return;

  const unit: UnitCode = isUnitCode(product.unit) ? product.unit : "pcs";
  const message = compose(
    { sku: product.sku, name: product.name },
    formatQuantity(stock, unit),
    formatQuantity(threshold, unit),
  );

  const to = await recipients();
  const result = to.error
    ? ({ ok: false, reason: to.error } as const)
    : await sendEmail({
        to: to.emails,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });

  // Dezarmeaza pe INCERCARE, nu pe livrare. "Un email pe traversare" este despre
  // traversare; daca trimiterea a esuat, motivul se scrie pe rand si se vede pe
  // ecranul de memento, exact cum cere cardul. A rearma dupa un esec ar insemna
  // o noua incercare la fiecare miscare de stoc, adica furtuna de emailuri pe
  // care regula o interzice, doar ca declansata de un serviciu cazut.
  await supabase
    .from("reminders")
    .update({
      is_armed: false,
      last_fired_at: new Date().toISOString(),
      last_stock_at_fire: stock,
      last_threshold_at_fire: threshold,
      last_send_error: result.ok ? null : result.reason,
    })
    .eq("id", reminder.id);
}
