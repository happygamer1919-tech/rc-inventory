---
id: proiect-stare
chapter: relatii
order: 12
roles: [owner]
title: Cum schimbi starea unui proiect
steps:
  - "Deschide pagina proiectului din **Proiecte**."
  - "Găsește cartonașul **Stare**."
  - "Alege noua stare din listă. Se salvează imediat, fără alt buton."
  - "Vezi schimbarea în fila **Istoric**."
  - "În lista de proiecte, **În desfășurare** ascunde proiectele Suspendat și Închis. Alege **Toate stările** ca să le vezi."
screenshots: [proiect-stare]
see_also: [proiect-nou, proiect-buget]
screen: /proiecte/{project}?fila=istoric
account: owner
marks:
  - "2 [data-testid='project-status-chip']"
  - "3 [data-testid='project-status-select']"
  - "4 [data-testid='tab-istoric']"
---

Stările sunt Prospect, Ofertă, Contract, În lucru, Suspendat și Închis. Fiecare schimbare rămâne în istoric.
