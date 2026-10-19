---
id: proiect-buget
chapter: relatii
order: 14
roles: [owner, account_manager]
title: Cum vezi bugetul și costul unui proiect
steps:
  - "Deschide un proiect din **Proiecte**."
  - "La **Buget, deviz și cost** citește **Buget**, **Total deviz acceptat** și **Cost real**."
  - "**Abatere față de buget** arată dacă ești peste buget sau cât a rămas."
  - "Fila **Consum** listează ieșirile de material către proiect."
  - "Fila **Cost** adună valoarea materialelor pe produs și pe lună."
  - "Fila **Comparație** pune devizul lângă ce s-a eliberat."
screenshots: [proiect-buget]
see_also: [iesire-proiect, crm-sectiuni]
screen: /proiecte/{project}?fila=consum
account: owner
marks:
  - "2 [data-testid='project-budget']"
  - "2 [data-testid='project-deviz-total']"
  - "2 [data-testid='project-actual-cost']"
  - "3 [data-testid='project-variance']"
  - "4 [data-testid='tab-consum']"
  - "5 [data-testid='tab-cost']"
  - "6 [data-testid='tab-comparatie']"
---

Pagina proiectului arată cât s-a planificat și cât s-a consumat.
