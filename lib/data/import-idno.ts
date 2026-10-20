// P3-329. IDNO-UL ESTE UNIC IN BAZA (migratia 0013, index unic partial pe fiscal_code).
//
// Completarea unui client existent ("Completează câmpurile goale") scrie IDNO-ul din fisier
// numai daca nimeni altcineva nu il are. Un IDNO tinut de alt client nu se scrie niciodata;
// restul campurilor se completeaza, iar operatorul afla de ce IDNO-ul a ramas gol.
//
// Folosit de importul de clienti si de cel de leaduri, fiindca amandoua completeaza
// aceeasi coloana. Fara "use server": nu este o actiune, este un ajutor al actiunilor.

import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

/** Mesajul pe care il vede operatorul cand IDNO-ul din fisier apartine altui client. */
export function idnoTakenMessage(idno: string, holderName: string): string {
  return `IDNO-ul ${idno} aparține deja clientului ${holderName}.`;
}

/** Clientul (altul decat `exceptId`) care are exact acest IDNO, daca exista. */
export async function findIdnoHolder(
  supabase: Db,
  idno: string,
  exceptId?: string,
): Promise<{ id: string; name: string } | null> {
  const query = supabase.from("clients").select("id, name").eq("fiscal_code", idno);
  const { data } = await (exceptId ? query.neq("id", exceptId) : query).limit(1);
  const row = (data as unknown as { id: string; name: string | null }[] | null)?.[0];
  return row ? { id: row.id, name: row.name ?? "" } : null;
}

/**
 * Scoate IDNO-ul din `patch` cand il tine alt client. Intoarce mesajul pentru operator in acel
 * caz, altfel nimic. `patch` se modifica pe loc.
 */
export async function dropHeldIdno(
  supabase: Db,
  patch: Record<string, string>,
  clientId: string,
): Promise<string | undefined> {
  const idno = patch.fiscal_code;
  if (idno === undefined) return undefined;
  const holder = await findIdnoHolder(supabase, idno, clientId);
  if (!holder) return undefined;
  delete patch.fiscal_code;
  return idnoTakenMessage(idno, holder.name);
}

/**
 * Mesajul pentru un client care nu s-a putut crea. Refuzul pe IDNO (field "fiscalCode", venit
 * dintr-un 23505) spune al cui este IDNO-ul; orice alt refuz ramane cum era.
 */
export async function createFailureMessage(
  supabase: Db,
  result: { message: string; field?: string },
  idno: string,
): Promise<string> {
  const code = idno.trim();
  if (result.field !== "fiscalCode" || code === "") return result.message;
  const holder = await findIdnoHolder(supabase, code);
  return holder ? idnoTakenMessage(code, holder.name) : result.message;
}

/**
 * Mesajul pentru o scriere refuzata. Un 23505 pe fiscal_code (un alt client a luat IDNO-ul
 * intre verificare si scriere) devine propozitia romaneasca; orice alta eroare ramane cum era.
 */
export async function fillWriteMessage(
  supabase: Db,
  error: { code?: string; message: string },
  patch: Record<string, string>,
  clientId: string,
): Promise<string> {
  if (error.code !== "23505" || patch.fiscal_code === undefined) return error.message;
  const holder = await findIdnoHolder(supabase, patch.fiscal_code, clientId);
  return holder
    ? idnoTakenMessage(patch.fiscal_code, holder.name)
    : `IDNO-ul ${patch.fiscal_code} aparține deja altui client.`;
}
