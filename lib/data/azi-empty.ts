// Titlul cardului de apeluri de pe ecranul Azi cand nu este niciun apel de facut.
//
// "Nimic de făcut azi." spune ca ziua este libera si este adevarat NUMAI cand nici
// sarcinile nu au nimic scadent. Cu sarcini scadente dar fara apeluri, ziua nu este
// libera, deci cardul spune doar ce lipseste, apelurile. Fisier fara server-only,
// ca un test sa il poata rula fara ecran: o lista de apeluri vine din date comune, iar
// un test in browser nu poate garanta ca ea este goala.
//
// `taskCount` este null cand sarcinile nu se citesc deloc (tabela nu exista inca).
export function aziEmptyTitle(taskCount: number | null): string {
  return taskCount === null || taskCount === 0 ? "Nimic de făcut azi." : "Niciun apel de făcut azi.";
}
