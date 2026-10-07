// P3-192. Pluralul romanesc din foile de import, din notele de export si din
// cardul de sarcini de pe Azi. Nu atinge nici browserul, nici baza: regula este
// o functie pura, iar sursele ecranelor se citesc ca text.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { plural } from "@/lib/data/format";

const importRead = (n: number) => `Am citit ${plural(n, "rând", "rânduri")}`;
const exportNotice = (n: number) => `Am exportat ${plural(n, "rând", "rânduri")}.`;
const aziHint = (n: number) =>
  `${plural(n, "sarcină deschisă", "sarcini deschise")}, cu termenul azi`;

test("foile de import: Am citit n rânduri, cu de doar de la 20 in sus", () => {
  expect(importRead(0)).toBe("Am citit 0 rânduri");
  expect(importRead(1)).toBe("Am citit 1 rând");
  expect(importRead(3)).toBe("Am citit 3 rânduri");
  expect(importRead(19)).toBe("Am citit 19 rânduri");
  expect(importRead(20)).toBe("Am citit 20 de rânduri");
  expect(importRead(25)).toBe("Am citit 25 de rânduri");
  expect(importRead(101)).toBe("Am citit 101 rânduri");
  expect(importRead(120)).toBe("Am citit 120 de rânduri");
});

test("notele de export: 25 de rânduri, nu 25 rânduri", () => {
  expect(exportNotice(1)).toBe("Am exportat 1 rând.");
  expect(exportNotice(3)).toBe("Am exportat 3 rânduri.");
  expect(exportNotice(25)).toBe("Am exportat 25 de rânduri.");
});

test("cardul de sarcini de pe Azi: singular pentru una, plural pentru mai multe", () => {
  expect(aziHint(1)).toBe("1 sarcină deschisă, cu termenul azi");
  expect(aziHint(2)).toBe("2 sarcini deschise, cu termenul azi");
  expect(aziHint(20)).toBe("20 de sarcini deschise, cu termenul azi");
});

test("ecranele trec prin plural(), nu prin ternarul vechi", () => {
  const files = [
    "components/clients/ClientImportSheet.tsx",
    "components/clients/LeadImportSheet.tsx",
    "components/projects/ProjectImportSheet.tsx",
    "components/inventory/MaterialImportSheet.tsx",
    "components/clients/ClientsScreen.tsx",
    "components/projects/ProjectsScreen.tsx",
    "components/inventory/InventoryScreen.tsx",
    "components/tasks/AziTasksSection.tsx",
  ];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    expect(src, `${file} foloseste plural()`).toContain('plural(');
    expect(src, `${file} nu mai are ternarul vechi`).not.toMatch(/=== 1 \? "rând"/);
    expect(src, `${file} nu mai scrie "deschise, cu termenul azi" cu numar gol`).not.toContain(
      "} deschise, cu termenul azi",
    );
  }
});
