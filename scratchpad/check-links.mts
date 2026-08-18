// Verifica faptul ca fiecare intrare din navigatie are un ecran real si invers:
// niciun ecran construit nu lipseste din meniu, nicio intrare nu duce nicaieri.
import { NAV, ALL_ROUTES } from "../lib/nav.ts";
import { readdirSync, existsSync } from "node:fs";

const fsRoutes = ["/"].concat(
  readdirSync("app", { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(`app/${d.name}/page.tsx`))
    .map((d) => `/${d.name}`),
).sort();

const navRoutes = [...ALL_ROUTES].sort();
console.log("ecrane pe disc :", fsRoutes.join(" "));
console.log("in navigatie   :", navRoutes.join(" "));

const missingFromNav = fsRoutes.filter((r) => !navRoutes.includes(r));
const deadInNav = navRoutes.filter((r) => !fsRoutes.includes(r));

console.log("\nintrari de meniu fara ecran (legaturi moarte):", deadInNav.length ? deadInNav.join(", ") : "niciuna");
console.log("ecrane care lipsesc din meniu               :", missingFromNav.length ? missingFromNav.join(", ") : "niciunul");

let dupes = 0;
const seen = new Set<string>();
for (const g of NAV) for (const i of g.items) {
  if (seen.has(i.href)) { console.log("DUPLICAT in meniu:", i.href); dupes++; }
  seen.add(i.href);
}
const ok = deadInNav.length === 0 && missingFromNav.length === 0 && dupes === 0;
console.log("\nverdict:", ok ? "OK, navigatia este completa si fara legaturi moarte" : "PROBLEME");
process.exit(ok ? 0 : 1);
