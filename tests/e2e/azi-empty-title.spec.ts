// azi-empty-title.spec - linia de acceptanta a cardului P3-168. Fara browser si fara
// baza: titlul cardului de apeluri cand nu este niciun apel, in toate cele trei cazuri.
import { expect, test } from "@playwright/test";
import { aziEmptyTitle } from "../../lib/data/azi-empty";

test("azi: fara apeluri si fara sarcini, cardul spune 'Nimic de făcut azi.'", () => {
  expect(aziEmptyTitle(0)).toBe("Nimic de făcut azi.");
});

test("azi: fara apeluri dar cu sarcini scadente, cardul spune 'Niciun apel de făcut azi.'", () => {
  expect(aziEmptyTitle(1)).toBe("Niciun apel de făcut azi.");
  expect(aziEmptyTitle(7)).toBe("Niciun apel de făcut azi.");
});

test("azi: sarcini necitite (tabela lipseste), cardul spune 'Nimic de făcut azi.'", () => {
  expect(aziEmptyTitle(null)).toBe("Nimic de făcut azi.");
});
