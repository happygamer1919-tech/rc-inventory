"use server";

// P3-68. Scrierile listei de combinatii de tabla si ale preturilor ei, din ecranul
// din Setari. Server actions, deci codul nu ajunge in browser si nu poate fi ocolit
// dintr-o consola.
//
// APARARE PE DOUA NIVELURI, ca in product-actions.ts. Politicile din migratia 0048
// refuza deja orice scriere care nu vine de la proprietar, la nivel de baza de date.
// Verificarea de rol de aici exista ca sa intoarca un mesaj romanesc in loc de o
// eroare Postgres, nu ca sa tina locul politicii.
//
// NIMIC NU SE STERGE. O combinatie se retrage (retired_at) si se poate reactiva. Nu
// exista nici politica, nici drept de stergere pe cele doua tabele.
//
// CE SE SCRIE PE O LINIE DE PRET SE SCRIE PENTRU TOATE COMBINATIILE EI. O linie este
// (price_group, series, thickness_mm, finish), iar PK/PS-20 si VP-20 impart aceeasi
// linie. De aceea adaugarea unei combinatii nu schimba niciodata un pret existent:
// daca linia are deja alt pret, adaugarea se refuza si spune pretul (decizia (e) a
// cardului). Pretul se schimba numai din tabel, unde ecranul spune cine il imparte.

import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { hasSheetOptionRetirement } from "./schema-capability";
import { isUnitCode } from "./units";
import {
  normalizePrice,
  parsePriceInput,
  parseThicknessInput,
  thicknessOptionLabel,
  type SheetChoice,
  type SheetOptionInput,
} from "./sheet-options-types";

type Failure = { ok: false; message: string; field?: string };
export type SheetActionResult = { ok: true } | Failure;

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** O linie de pret, cu grosimea deja adusa la "0.45". */
export type SheetPriceLine = {
  priceGroup: string;
  series: string;
  thicknessMm: string;
  finish: string;
};

const OWNER_ONLY: Failure = {
  ok: false,
  message: "Doar administratorul poate modifica lista de modele.",
};

const NOT_ACTIVE: Failure = {
  ok: false,
  message: "Administrarea listei nu este încă activă. Încearcă din nou peste câteva minute.",
};

const EXPIRED: Failure = { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };

/** Textele unei combinatii nu au voie sa depaseasca atat; lista are cel mult 21. */
const MAX_TEXT = 64;

/** Sesiunea, rolul si migratia 0048, in aceasta ordine. */
async function ownerClient(): Promise<{ ok: true; supabase: Supabase } | Failure> {
  const user = await getSessionUser();
  if (!user) return EXPIRED;
  if (user.role !== "owner") return OWNER_ONLY;
  const supabase = await createClient();
  if (!(await hasSheetOptionRetirement(supabase))) return NOT_ACTIVE;
  return { ok: true, supabase };
}

function writeFailure(code: string | undefined): Failure {
  if (code === "42501") return OWNER_ONLY;
  return { ok: false, message: "Salvarea a eșuat. Încearcă din nou." };
}

function revalidate() {
  revalidatePath("/setari/tabla");
  revalidatePath("/inventar");
}

/** "C-10 Standart Zn 0,45 mm, Cr matt", pentru mesaje. */
function describe(choice: SheetChoice): string {
  return `${choice.model} ${choice.series} ${thicknessOptionLabel(choice)}`;
}

/** Textul unui camp: curatat, obligatoriu sau nu, si nu prea lung. */
function cleanText(
  value: string,
  field: string,
  messages: { required: string | null; tooLong: string },
): { ok: true; value: string } | Failure {
  const clean = String(value ?? "").trim();
  if (messages.required !== null && clean.length === 0) {
    return { ok: false, field, message: messages.required };
  }
  if (clean.length > MAX_TEXT) {
    return { ok: false, field, message: messages.tooLong };
  }
  return { ok: true, value: clean };
}

async function readPrice(supabase: Supabase, line: SheetPriceLine) {
  return supabase
    .from("sheet_prices")
    .select("price_lei")
    .eq("price_group", line.priceGroup)
    .eq("series", line.series)
    .eq("thickness_mm", line.thicknessMm)
    .eq("finish", line.finish)
    .maybeSingle();
}

/* ------------------------------------------------------------- adaugare -- */

export async function createSheetOption(input: SheetOptionInput): Promise<SheetActionResult> {
  const session = await ownerClient();
  if (!session.ok) return session;
  const { supabase } = session;

  // --- validarea, pe aceleasi reguli ca CHECK-urile din 0046 si 0047 ------------
  const model = cleanText(input.model, "model", {
    required: "Modelul este obligatoriu.",
    tooLong: "Modelul este prea lung.",
  });
  if (!model.ok) return model;
  const series = cleanText(input.series, "series", {
    required: "Seria este obligatorie.",
    tooLong: "Seria este prea lungă.",
  });
  if (!series.ok) return series;
  const thicknessMm = parseThicknessInput(String(input.thicknessMm ?? ""));
  if (thicknessMm === null) {
    return {
      ok: false,
      field: "thicknessMm",
      message: "Grosimea trebuie să fie un număr mai mare decât zero, în milimetri, cu cel mult două zecimale (de exemplu 0,45).",
    };
  }
  const finish = cleanText(input.finish, "finish", {
    required: null,
    tooLong: "Finisajul este prea lung.",
  });
  if (!finish.ok) return finish;
  if (!isUnitCode(input.unit)) {
    return { ok: false, field: "unit", message: "Alege o unitate de măsură." };
  }
  const group = cleanText(input.priceGroup, "priceGroup", {
    required: null,
    tooLong: "Grupul de preț este prea lung.",
  });
  if (!group.ok) return group;
  // Un grup de pret gol inseamna "modelul are linia lui", cazul obisnuit din lista.
  const priceGroup = group.value.length > 0 ? group.value : model.value;

  const rawPrice = String(input.priceLei ?? "").trim();
  const price = rawPrice.length === 0 ? null : parsePriceInput(rawPrice);
  if (rawPrice.length > 0 && price === null) {
    return {
      ok: false,
      field: "priceLei",
      message: "Prețul trebuie să fie un număr mai mare decât zero, cu cel mult două zecimale.",
    };
  }

  const choice: SheetChoice = {
    model: model.value,
    series: series.value,
    thicknessMm,
    finish: finish.value,
  };
  const line: SheetPriceLine = { priceGroup, series: series.value, thicknessMm, finish: finish.value };

  // --- combinatia exista deja? Mesaj romanesc, nu 23505 --------------------------
  const existing = await findOption(supabase, choice);
  if (existing.error) return { ok: false, message: "Lista nu a putut fi citită. Încearcă din nou." };
  if (existing.found) return duplicate(choice, existing.retired);

  // --- linia de pret: un pret existent nu se schimba de aici ---------------------
  const current = await readPrice(supabase, line);
  if (current.error) return { ok: false, message: "Prețurile nu au putut fi citite. Încearcă din nou." };
  const currentPrice = current.data ? normalizePrice(current.data.price_lei) : null;
  if (price !== null && currentPrice !== null && Number(currentPrice) !== price) {
    return {
      ok: false,
      field: "priceLei",
      message: `Linia de preț ${priceGroup} ${series.value} ${thicknessOptionLabel(choice)} are deja prețul ${currentPrice} lei. Lasă prețul gol sau scrie ${currentPrice}; prețul liniei se schimbă din tabel.`,
    };
  }

  // --- randul, la capatul listei -------------------------------------------------
  const inserted = await insertOption(supabase, choice, input.unit, priceGroup);
  if (!inserted.ok) return inserted;

  if (price !== null && currentPrice === null) {
    const { error } = await supabase.from("sheet_prices").insert({
      price_group: line.priceGroup,
      series: line.series,
      thickness_mm: line.thicknessMm,
      finish: line.finish,
      price_lei: price,
    });
    if (error) {
      revalidate();
      return {
        ok: false,
        field: "priceLei",
        message: "Combinația a fost adăugată, dar prețul nu s-a salvat. Scrie-l din tabel.",
      };
    }
  }

  revalidate();
  return { ok: true };
}

async function findOption(
  supabase: Supabase,
  choice: SheetChoice,
): Promise<{ error: boolean; found: boolean; retired: boolean }> {
  const { data, error } = await supabase
    .from("sheet_options")
    .select("retired_at")
    .eq("model", choice.model)
    .eq("series", choice.series)
    .eq("thickness_mm", choice.thicknessMm)
    .eq("finish", choice.finish)
    .maybeSingle();
  if (error) return { error: true, found: false, retired: false };
  return { error: false, found: data !== null, retired: data?.retired_at != null };
}

function duplicate(choice: SheetChoice, retired: boolean): Failure {
  return {
    ok: false,
    field: "model",
    message: retired
      ? `Combinația ${describe(choice)} există deja în listă și este retrasă. O poți reactiva din tabel.`
      : `Combinația ${describe(choice)} există deja în listă.`,
  };
}

/**
 * sort_order este unic, deci doua adaugari simultane pot cere acelasi numar. A doua
 * primeste 23505 si mai incearca o data, dupa ce verifica daca nu cumva cheia
 * combinatiei este cea care s-a ciocnit.
 */
async function insertOption(
  supabase: Supabase,
  choice: SheetChoice,
  unit: string,
  priceGroup: string,
): Promise<SheetActionResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data: last, error: readError } = await supabase
      .from("sheet_options")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (readError) return { ok: false, message: "Lista nu a putut fi citită. Încearcă din nou." };
    const sortOrder = Number(last?.sort_order ?? 0) + 1;

    const { error } = await supabase.from("sheet_options").insert({
      model: choice.model,
      series: choice.series,
      thickness_mm: choice.thicknessMm,
      finish: choice.finish,
      unit,
      price_group: priceGroup,
      sort_order: sortOrder,
    });
    if (!error) return { ok: true };
    if (error.code !== "23505") return writeFailure(error.code);

    const again = await findOption(supabase, choice);
    if (again.found) return duplicate(choice, again.retired);
  }
  return { ok: false, message: "Salvarea a eșuat. Încearcă din nou." };
}

/* ------------------------------------------------------------------ pret -- */

export async function setSheetPrice(line: SheetPriceLine, priceLei: string): Promise<SheetActionResult> {
  const session = await ownerClient();
  if (!session.ok) return session;
  const { supabase } = session;

  const price = parsePriceInput(String(priceLei ?? ""));
  if (price === null) {
    return {
      ok: false,
      field: "priceLei",
      message: "Prețul trebuie să fie un număr mai mare decât zero, cu cel mult două zecimale.",
    };
  }
  const thicknessMm = parseThicknessInput(String(line.thicknessMm ?? ""));
  if (thicknessMm === null) return { ok: false, message: "Linia de preț nu mai există în listă." };
  const clean: SheetPriceLine = {
    priceGroup: String(line.priceGroup ?? "").trim(),
    series: String(line.series ?? "").trim(),
    thicknessMm,
    finish: String(line.finish ?? "").trim(),
  };

  // Un pret se scrie numai pentru o linie pe care o poarta cel putin o combinatie.
  const { count, error: countError } = await supabase
    .from("sheet_options")
    .select("model", { count: "exact", head: true })
    .eq("price_group", clean.priceGroup)
    .eq("series", clean.series)
    .eq("thickness_mm", clean.thicknessMm)
    .eq("finish", clean.finish);
  if (countError) return { ok: false, message: "Lista nu a putut fi citită. Încearcă din nou." };
  if (!count) return { ok: false, message: "Linia de preț nu mai există în listă." };

  const current = await readPrice(supabase, clean);
  if (current.error) return { ok: false, message: "Prețurile nu au putut fi citite. Încearcă din nou." };

  if (current.data) {
    // UPDATE NUMAI PE price_lei. 0048 acorda dreptul de update doar pe acea coloana,
    // deci un upsert, care rescrie toate coloanele trimise, ar fi refuzat.
    const { data, error } = await supabase
      .from("sheet_prices")
      .update({ price_lei: price })
      .eq("price_group", clean.priceGroup)
      .eq("series", clean.series)
      .eq("thickness_mm", clean.thicknessMm)
      .eq("finish", clean.finish)
      .select("price_lei");
    if (error) return writeFailure(error.code);
    // Politica refuza tacut: zero randuri si nicio eroare.
    if (!data || data.length === 0) return OWNER_ONLY;
  } else {
    const { error } = await supabase.from("sheet_prices").insert({
      price_group: clean.priceGroup,
      series: clean.series,
      thickness_mm: clean.thicknessMm,
      finish: clean.finish,
      price_lei: price,
    });
    if (error) return writeFailure(error.code);
  }

  revalidate();
  return { ok: true };
}

/* ------------------------------------------------ retragere, reactivare -- */

export async function setSheetOptionRetired(
  choice: SheetChoice,
  retired: boolean,
): Promise<SheetActionResult> {
  const session = await ownerClient();
  if (!session.ok) return session;
  const { supabase } = session;

  const thicknessMm = parseThicknessInput(String(choice.thicknessMm ?? ""));
  if (thicknessMm === null) return { ok: false, message: "Combinația nu mai există în listă." };

  const { data, error } = await supabase
    .from("sheet_options")
    .update({ retired_at: retired ? new Date().toISOString() : null })
    .eq("model", String(choice.model ?? "").trim())
    .eq("series", String(choice.series ?? "").trim())
    .eq("thickness_mm", thicknessMm)
    .eq("finish", String(choice.finish ?? "").trim())
    .select("model");
  if (error) return writeFailure(error.code);
  if (!data || data.length === 0) {
    // Zero randuri: fie combinatia nu exista, fie politica a refuzat tacut.
    const found = await findOption(supabase, { ...choice, thicknessMm });
    return found.found ? OWNER_ONLY : { ok: false, message: "Combinația nu mai există în listă." };
  }

  revalidate();
  return { ok: true };
}
