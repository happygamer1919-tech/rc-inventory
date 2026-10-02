"use server";

// Scrierile sarcinilor. Cardul P3-130, goal G73, Item 4 al lui Ivan.
//
// DOUA FUNCTII SI NICIUNA A TREIA: se scrie o sarcina si se modifica una. NU EXISTA
// NICIO STERGERE AICI SI NU POATE EXISTA NICIUNA: migratia 0068 nu da tabelei nici
// politica de stergere, nici drept de stergere pentru vreun rol, proprietarul
// inclus, iar clauza 4 este propozitia lui Ivan: anularea este o stare si nu este
// niciodata o stergere. O sarcina anulata rămâne pe inregistrare.
//
// SI NU EXISTA NICI O FUNCTIE "anuleaza". Anularea este o modificare de stare catre
// 'cancelled', pe care updateTask o face ca pe oricare alta, exact ce scrie si
// secțiunea finala a migratiei 0068. O functie de anulare cu reguli proprii ar
// aparține cardului care are butonul, adica P3-131.
//
// INTAI SE INTREABA DACA TABELA EXISTA. Migratia 0068 ajunge pe productie la
// fuziune, in aproximativ doua minute, iar acest cod pleaca din acelasi push. Cat
// timp raspunsul este "nu", scrierea REFUZA ROMANESTE si nu arunca un 500: asta este
// jumatatea de scriere a comportamentului pe care il descrie si lib/data/tasks.ts.
//
// NU SE CHEAMA revalidatePath, SI GOLUL ESTE LASAT ANUME. Acest card nu construieste
// niciun ecran, clauza 7, deci nu exista nicio cale de reimprospatat: o cale scrisa
// acum ar fi ghicita de cineva care nu vede ecranul. Cardurile P3-131, P3-132 si
// P3-133 o adauga, fiecare pentru calea pe care o construieste.

import { createClient, getSessionUser } from "@/lib/supabase/server";
import { hasTasks } from "./schema-capability";
import { validateNewTask, validateTaskPatch } from "./tasks-shape";
import type { ActionResult } from "./inbound-types";
import type { NewTaskInput, TaskPatch } from "./tasks-types";

/** Propozitia cu care fiecare scriere refuza cat timp migratia nu este aplicata. */
const NOT_APPLIED =
  "Sarcinile nu sunt încă active. Încearcă din nou în câteva minute.";

const NO_SESSION = "Sesiune expirată. Autentifică-te din nou.";

/**
 * Refuzul masinal al bazei, tradus in propozitia romaneasca pe care o vede
 * operatorul.
 *
 * RESTRICTIILE SE NUMESC PE NUME, exact cum o face translateWriteError din
 * lib/data/outbound-actions.ts: ele apara toti apelantii care nu sunt acest fisier,
 * deci refuzul lor trebuie sa aiba o propozitie si aici, altfel operatorul citeste un
 * nume de restrictie.
 */
function translateWriteError(code: string | undefined, message: string): ActionResult<never> {
  if (code === "42501")
    return { ok: false, message: "Nu ai dreptul să faci această operațiune." };

  if (code === "23514") {
    if (message.includes("tasks_entity_both_or_neither"))
      return {
        ok: false,
        message:
          "Înregistrarea legată se alege întreagă: felul ei și înregistrarea însăși, sau niciuna.",
        field: "entityId",
      };
    if (message.includes("tasks_title_not_blank"))
      return { ok: false, message: "Scrie un titlu pentru sarcină.", field: "title" };
  }

  // Ziua scadentei, cand nu exista in calendar. SINGURA AUTORITATE ASUPRA UNEI ZILE
  // ESTE COLOANA `date` DIN PostgreSQL, hotararea cardului P3-118: aici se traduce
  // refuzul ei, ca sa nu existe o a doua verificare de calendar in acest depozit.
  if (code === "22007" || code === "22008")
    return {
      ok: false,
      message: "Termenul nu este o dată validă. Scrie ziua, luna și anul, de exemplu 01.12.2026.",
      field: "dueDate",
    };

  if (code === "23503")
    return {
      ok: false,
      message: "Persoana responsabilă aleasă nu mai există. Reîncarcă pagina.",
      field: "assigneeId",
    };

  if (code === "22P02")
    return { ok: false, message: "Una dintre valorile trimise nu este recunoscută." };

  if (code === "P0001" || code === "P0002") return { ok: false, message };
  return { ok: false, message: `Operațiunea a eșuat. ${message}` };
}

/** Un sir gol inseamna "fara", adica null in baza. */
function orNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * O sarcina noua.
 *
 * created_by NU SE TRIMITE DE AICI si nu este o scapare: coloana are implicit
 * auth.uid() in migratia 0068, exact ca public.invoices.created_by din 0063, deci
 * baza scrie cine a scris-o si nicio cale de scriere nu poate uita sa o faca. Un
 * apelant care ar trimite o alta valoare ar fi un apelant care isi alege autorul.
 *
 * STAREA SI URGENTA ABSENTE NU SE COMPLETEAZA AICI, din acelasi motiv: implicitele
 * 'todo' si 'medium' sunt ale coloanelor, si un al doilea implicit scris in
 * TypeScript ar fi doua raspunsuri care trebuie sa fie de acord pentru totdeauna.
 */
export async function createTask(
  input: NewTaskInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: NO_SESSION };

  const refusal = validateNewTask(input);
  if (refusal) return { ok: false, message: refusal.message, field: refusal.field };

  const supabase = await createClient();
  if (!(await hasTasks(supabase))) return { ok: false, message: NOT_APPLIED };

  const row: Record<string, unknown> = { title: input.title.trim() };
  const optional: [string, string | null][] = [
    ["description", orNull(input.description)],
    ["status", orNull(input.status)],
    ["priority", orNull(input.priority)],
    ["due_date", orNull(input.dueDate)],
    ["assignee_id", orNull(input.assigneeId)],
    ["entity_type", orNull(input.entityType)],
    ["entity_id", orNull(input.entityId)],
  ];
  // CHEILE ABSENTE NU SE TRIMIT, ca implicitul coloanei sa se vada. Un `null` trimis
  // pe o coloana cu implicit scrie null si nu implicitul, care este tocmai greseala
  // ce ar face o sarcina sa ajunga fara stare pe o schema ce avea una.
  for (const [key, value] of optional) if (value !== null) row[key] = value;

  const { data, error } = await supabase.from("tasks").insert(row).select("id").maybeSingle();
  if (error) return translateWriteError(error.code, error.message);
  if (!data) return { ok: false, message: "Sarcina nu a putut fi scrisă. Încearcă din nou." };

  return { ok: true, value: { id: String(data.id) } };
}

/**
 * O modificare pe o sarcina care exista, ANULAREA INCLUSA.
 *
 * UN CAMP ABSENT NU SE ATINGE SI UN CAMP TRIMIS GOL SE GOLESTE: "nu schimb
 * responsabilul" si "scot responsabilul" sunt doua apasari de buton diferite si
 * amandoua trebuie sa fie spuse. Titlul este singura exceptie, fiindca
 * tasks_title_not_blank nu lasa o sarcina fara titlu sa existe.
 *
 * updated_at NU SE TRIMITE: declansatorul tasks_set_updated_at din migratia 0068 il
 * scrie, prin functia comuna a migratiei 0001, al carei comentariu spune de ce ("o
 * coloana updated_at care nu se actualizeaza niciodata este o minciuna pe care intreg
 * sistemul o citeste apoi").
 */
export async function updateTask(id: string, patch: TaskPatch): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: NO_SESSION };

  const refusal = validateTaskPatch(patch);
  if (refusal) return { ok: false, message: refusal.message, field: refusal.field };

  const supabase = await createClient();
  if (!(await hasTasks(supabase))) return { ok: false, message: NOT_APPLIED };

  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title.trim();
  if (patch.description !== undefined) row.description = orNull(patch.description);
  if (patch.status !== undefined) row.status = patch.status.trim();
  if (patch.priority !== undefined) row.priority = patch.priority.trim();
  if (patch.dueDate !== undefined) row.due_date = orNull(patch.dueDate);
  if (patch.assigneeId !== undefined) row.assignee_id = orNull(patch.assigneeId);
  if (patch.entityType !== undefined) row.entity_type = orNull(patch.entityType);
  if (patch.entityId !== undefined) row.entity_id = orNull(patch.entityId);

  if (Object.keys(row).length === 0) return { ok: true, value: undefined };

  const { data, error } = await supabase
    .from("tasks")
    .update(row)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return translateWriteError(error.code, error.message);
  // ZERO RANDURI MODIFICATE NU ESTE UN SUCCES TACUT. Securitatea pe rand filtreaza
  // randuri in loc sa ridice o eroare, deci o scriere refuzata de politica arata ca
  // o scriere care nu a gasit nimic, si cele doua trebuie sa fie spuse la fel:
  // operatorul nu a schimbat ce credea ca schimba.
  if (!data)
    return {
      ok: false,
      message: "Sarcina nu a putut fi modificată. Reîncarcă pagina și încearcă din nou.",
    };

  return { ok: true, value: undefined };
}
