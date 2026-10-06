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
// revalidatePath SE CHEAMA PENTRU CALEA PE CARE O CONSTRUIESTE CARDUL P3-131, si
// numai pentru ea. Pana la acel card antetul acesta spunea:
//
//   "NU SE CHEAMA revalidatePath, SI GOLUL ESTE LASAT ANUME. Acest card nu
//   construieste niciun ecran, clauza 7, deci nu exista nicio cale de
//   reimprospatat: o cale scrisa acum ar fi ghicita de cineva care nu vede ecranul.
//   Cardurile P3-131, P3-132 si P3-133 o adauga, fiecare pentru calea pe care o
//   construieste."
//
// Asta rămâne regula si este urmata la litera: aici se scrie `/sarcini`, ecranul
// cardului P3-131, SI NIMIC ALTCEVA. Panoul de pe fisa unei inregistrari este P3-132
// si secțiunea de pe Azi este P3-133: ele isi adauga calea cand o au, fiindca o cale
// scrisa inainte de ecranul ei este tot o cale ghicita.
//
// CARDUL P3-132 ISI ADAUGA ACUM CALEA, fiindca are ecranul: fisa inregistrarii de
// care sarcina este legata, adica `/clienti/<id>` sau `/proiecte/<id>`. Ea se DEDUCE
// din perechea pe care randul scris o poarta si nu se primeste ca parametru, ca un
// apelant sa nu poata cere reimprospatarea unei pagini care nu are nicio legatura cu
// ce s-a scris. TREI PAGINI, DOUA TOKENURI: fisa unui lead este chiar
// `/clienti/<id>`, fiindca un lead este un rand din public.clients care poarta o
// etapa, deci tokenul `client` acopera si leadul si clientul. Motivul intreg este in
// lib/data/tasks-types.ts. Secțiunea de pe Azi rămâne a cardului P3-133 si calea ei
// nu este scrisa aici.

import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { hasTasks } from "./schema-capability";
import { orNull, taskPatchRow, validateNewTask, validateTaskPatch } from "./tasks-shape";
import type { ActionResult } from "./inbound-types";
import type { NewTaskInput, TaskPatch } from "./tasks-types";

/** Propozitia cu care fiecare scriere refuza cat timp migratia nu este aplicata. */
const NOT_APPLIED =
  "Sarcinile nu sunt încă active. Încearcă din nou în câteva minute.";

const NO_SESSION = "Sesiune expirată. Autentifică-te din nou.";

/** Ecranul cardului P3-131. Scris o singura data: doua drumuri de scriere care
 *  reimprospateaza doua cai diferite este un ecran care uneori nu se schimba. */
const TASKS_PATH = "/sarcini";

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

/**
 * Reimprospateaza fila /sarcini si, cand randul scris poarta o inregistrare legata,
 * fisa acelei inregistrari: panoul cardului P3-132 sta pe ea.
 *
 * PERECHEA SE CITESTE INTREAGA SAU DELOC, exact ca restrictia
 * tasks_entity_both_or_neither: un fel fara id nu duce la nicio pagina, iar un id
 * fara fel este un id pe care nimeni nu il poate duce la o tabela. Un fel pe care
 * acest fisier nu il cunoaste nu reimprospateaza nimic si nu arunca: o cale
 * construita dintr-un token necunoscut ar fi o cale ghicita.
 */
function revalidateTaskPaths(entityType: string | null, entityId: string | null): void {
  revalidatePath(TASKS_PATH);
  if (entityType === null || entityId === null) return;
  if (entityType === "client") revalidatePath(`/clienti/${entityId}`);
  if (entityType === "project") revalidatePath(`/proiecte/${entityId}`);
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

  // PERECHEA SE CITESTE INAPOI DIN RANDUL SCRIS si nu din ce s-a trimis: pagina de
  // reimprospatat se deduce din ce baza a stocat, care este singurul adevar despre
  // unde sarcina s-a asezat.
  const { data, error } = await supabase
    .from("tasks")
    .insert(row)
    .select("id, entity_type, entity_id")
    .maybeSingle();
  if (error) return translateWriteError(error.code, error.message);
  if (!data) return { ok: false, message: "Sarcina nu a putut fi scrisă. Încearcă din nou." };

  revalidateTaskPaths(orNull(data.entity_type ?? undefined), orNull(data.entity_id ?? undefined));
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

  // NUMAI CHEILE PRIMITE AJUNG IN RAND, cardul P3-157: o coloana pe care apelantul nu
  // a trimis-o nu se scrie, deci nu poate anula modificarea unui coleg.
  const row = taskPatchRow(patch);

  if (Object.keys(row).length === 0) return { ok: true, value: undefined };

  const { data, error } = await supabase
    .from("tasks")
    .update(row)
    .eq("id", id)
    .select("id, entity_type, entity_id")
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

  revalidateTaskPaths(orNull(data.entity_type ?? undefined), orNull(data.entity_id ?? undefined));
  return { ok: true, value: undefined };
}
