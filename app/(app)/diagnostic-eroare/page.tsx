// P2-11. Ruta care arunca, si de ce exista una.
//
// Linia de acceptanta a cardului cere ca "un 500 fortat sa randeze pagina
// romaneasca". Un ecran de eroare care nu a fost niciodata vazut caderea este
// exact felul de plasa de siguranta care se descopera rupta in ziua in care este
// nevoie de ea, asa ca trebuie sa existe o cale de a o declansa.
//
// DE CE NU O RAMURA "DACA E TEST". Aceea ar fi a doua implementare, care ruleaza
// numai in teste si in care toata lumea are incredere in CI: exact greseala pe
// care docs/LEARNINGS.md o are scrisa la P2-10 despre mocarea unui serviciu
// printr-o ramura in loc de la transport. Ce se verifica trebuie sa fie ce
// ruleaza.
//
// CE ESTE SI CE NU ESTE ACEASTA RUTA. Arunca mereu, in orice mediu, si asta
// este tot ce face. Nu citeste nimic, nu scrie nimic, nu atinge baza de date si
// nu primeste parametri. Sta in grupul (app), deci proxy-ul cere sesiune ca
// pentru orice alt ecran: un vizitator neautentificat este redirectat catre
// autentificare si nu ajunge aici. Nu este in NAV, deci nu apare in meniu si
// nimeni nu da peste ea din greseala.
//
// Ce se vede cand cineva o deschide este ecranul din app/error.tsx: romanesc,
// cu digestul si cu drumul inapoi. Adica exact dovada.

export const dynamic = "force-dynamic";

export default function DiagnosticEroarePage() {
  throw new Error("Eroare deliberată: ruta de diagnostic pentru ecranul 500.");
}
