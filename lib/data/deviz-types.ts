// Tipurile devizului, cardul P3-13b.
//
// STARILE SUNT JETOANE ENGLEZESTI IN BAZA SI ETICHETE ROMANESTI PE ECRAN, la
// fel ca public.project_status din 0016 si public.outbound_status: enumul
// public.deviz_status din 0025 stocheaza draft, sent, accepted, rejected si
// expired, iar Ciorna, Emis, Acceptat, Respins si Expirat traiesc aici, in
// stratul de prezentare. Ordinea din DEVIZ_STATUSES este conducta, nu o
// preferinta de afisare.

export const DEVIZ_STATUSES = ["draft", "sent", "accepted", "rejected", "expired"] as const;

export type DevizStatus = (typeof DEVIZ_STATUSES)[number];

export const DEVIZ_STATUS_LABEL: Record<DevizStatus, string> = {
  draft: "Ciornă",
  sent: "Emis",
  accepted: "Acceptat",
  rejected: "Respins",
  expired: "Expirat",
};

export function isDevizStatus(value: unknown): value is DevizStatus {
  return typeof value === "string" && (DEVIZ_STATUSES as readonly string[]).includes(value);
}

/** O CIORNA SE EDITEAZA, RESTUL NU. Regula traieste in declansatoarele din
 *  migratia 0025 si este garantia reala; functia de aici este doar propozitia
 *  care dezactiveaza butoanele, ca operatorul sa nu ajunga la un refuz de baza
 *  de date pentru ceva ce ecranul putea sa nu ii ofere. */
export function isEditable(status: DevizStatus): boolean {
  return status === "draft";
}

/** Un deviz EMIS a carui valabilitate a trecut se AFISEAZA ca expirat.
 *
 *  Nimic nu ii schimba starea: migratia 0025 spune in terminologia ei ca
 *  valid_until este inregistrat si nu impus de un job, iar enumul este mutat de o
 *  persoana. Aceasta este exact avertismentul de pe ecran si nimic mai mult.
 *
 *  TRAIESTE AICI SI NU IN deviz.ts pentru ca o cheama un component de client, iar
 *  deviz.ts importa clientul Supabase de server. Acest fisier nu importa nimic si
 *  poate fi citit de amandoua partile.
 */
export function isPastValidity(
  deviz: { status: DevizStatus; validUntil: string | null },
  today = new Date(),
): boolean {
  if (deviz.status !== "sent" || !deviz.validUntil) return false;
  return deviz.validUntil < today.toISOString().slice(0, 10);
}
