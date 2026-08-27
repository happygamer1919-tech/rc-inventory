// P2-11. Punctul de pornire al serverului.
//
// register() este apelat de Next O SINGURA DATA per proces, inaintea oricarei
// cereri. Este API stabil si documentat, nu un steag experimental, ceea ce este
// exact ce cere defaults-ul acestui card.
//
// Verificarea ruleaza NUMAI pe runtime-ul Node. Acelasi fisier este incarcat si
// pentru runtime-ul edge, unde process.env poarta alt set de variabile, si unde
// o aruncare ar opri un proces care nu are treaba cu ele.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertRequiredEnv } = await import("./lib/env-required");
  assertRequiredEnv();
}
