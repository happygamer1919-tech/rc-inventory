import "server-only";

// Fila Note de pe fisa clientului, cardul P3-90, goal G45.
//
// O SINGURA ISTORIE DIN DOUA SURSE. Notele scrise ("Ce s-a discutat") vin din
// public.client_notes (0059); mutarile de etapa vin din client_stage_history,
// functia pe care 0039 a scris-o si pe care pana acum nu o chema niciun ecran.
// Se citesc amandoua, se unesc intr-o lista, cele mai noi primele, si fiecare rand
// isi spune felul, ca fila sa le deseneze diferit.
//
// NUMELE AUTORILOR SE CITESC O SINGURA DATA, pentru toata lista: un singur select
// pe profiles cu toate id-urile distincte, nu unul pe rand.
//
// FISIER SEPARAT, ca client-detail.ts si client-actions.ts: un fisier pe grija.

import { createClient } from "@/lib/supabase/server";
import { hasClientNotes } from "./schema-capability";
import { ownerDisplayName } from "./clients";
import { isClientStage, type ClientTimelineEntry } from "./clients-types";

/** Mutare de etapa fara autor inregistrat: facuta de sistem, nu de un om. */
const NO_ACTOR = "Sistem";
/** Autor al carui profil cel care se uita nu il poate citi: profiles_select din
 *  0001 ii arata unui manager de cont numai profilul lui. Aceleasi cuvinte ca
 *  responsabilul de pe fisa. */
const UNREADABLE_ACTOR = "Alt membru al echipei";

type NoteRow = { id: string; body: string; created_by: string | null; created_at: string };
type StageRow = {
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  created_at: string;
};

/**
 * Notele si mutarile de etapa ale unui client, cele mai noi primele. Null cand
 * migratia 0059 nu este inca aplicata: fila arata atunci starea goala de azi.
 */
export async function getClientTimeline(clientId: string): Promise<ClientTimelineEntry[] | null> {
  const supabase = await createClient();
  if (!(await hasClientNotes(supabase))) return null;

  const [notesResult, stagesResult] = await Promise.all([
    supabase
      .from("client_notes")
      .select("id, body, created_by, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
    supabase.rpc("client_stage_history", { p_client_id: clientId }),
  ]);

  const notes = (notesResult.data ?? []) as NoteRow[];
  const stages = (stagesResult.data ?? []) as StageRow[];

  // Un singur select pentru toti autorii din lista.
  const ids = [
    ...new Set(
      [...notes.map((n) => n.created_by), ...stages.map((s) => s.changed_by)].filter(
        (id): id is string => id !== null,
      ),
    ),
  ];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
    for (const p of (data ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
      names.set(p.id, ownerDisplayName(p));
    }
  }
  const author = (id: string | null) => (id === null ? NO_ACTOR : (names.get(id) ?? UNREADABLE_ACTOR));

  const entries: ClientTimelineEntry[] = [
    ...notes.map(
      (n): ClientTimelineEntry => ({
        kind: "note",
        id: n.id,
        body: n.body,
        author: author(n.created_by),
        createdAt: n.created_at,
      }),
    ),
    ...stages.flatMap((s, i): ClientTimelineEntry[] =>
      isClientStage(s.to_status)
        ? [
            {
              kind: "stage",
              // Istoria nu intoarce id-ul randului; pozitia si momentul il fac unic aici.
              id: `stage-${i}-${s.created_at}`,
              fromStage: isClientStage(s.from_status) ? s.from_status : null,
              toStage: s.to_status,
              author: author(s.changed_by),
              createdAt: s.created_at,
            },
          ]
        : [],
    ),
  ];

  // Cele mai noi primele. Sortarea este stabila, deci la acelasi moment fiecare
  // sursa isi pastreaza ordinea ei.
  return entries.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
