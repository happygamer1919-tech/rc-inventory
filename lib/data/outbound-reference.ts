import type { ActionResult } from "./inbound-types";

// P3-340. Numarul iesirii vine dintr-o functie a bazei. nextOutboundReference
// (P3-334) arunca o eroare cand citirea esueaza, ca sa nu se scrie o iesire cu
// numar inventat. Actiunea nu o prindea, iar formularul ramanea pe "se salveaza"
// pentru totdeauna. Acum operatorul primeste un mesaj si poate incerca din nou.
export const SLIP_NUMBER_READ_FAILED = "Numărul ieșirii nu a putut fi citit. Încearcă din nou.";

export async function readSlipNumber(read: () => Promise<string>): Promise<ActionResult<string>> {
  try {
    return { ok: true, value: await read() };
  } catch {
    return { ok: false, message: SLIP_NUMBER_READ_FAILED };
  }
}
