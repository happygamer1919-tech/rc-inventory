---
id: proiect-deviz
chapter: relatii
order: 13
roles: [owner]
title: Cum faci și accepți un deviz
steps:
  - "Pe pagina proiectului deschide fila **Deviz**."
  - "Apasă **+ Deviz nou**. Se creează o versiune în starea **Ciornă**."
  - "La **Adaugă linia** caută produsul în **Produs**, scrie **Cantitate** și apasă **Adaugă linia**. Prețul vine din catalog."
  - "Când e gata, apasă **Emis**."
  - "După răspunsul clientului apasă **Acceptat** sau **Respins**."
  - "Un deviz emis nu se mai modifică. Pentru schimbări apasă din nou **+ Deviz nou**."
screenshots: [proiect-deviz]
see_also: [proiect-buget, proiect-nou]
screen: /proiecte/{project_offer}?fila=deviz
account: owner
before:
  - "fill [data-testid='deviz-add-quantity'] => 12"
marks:
  - "1 [data-testid='tab-deviz']"
  - "2 [data-testid='deviz-new']"
  - "3 [data-testid='deviz-add-product']"
  - "3 [data-testid='deviz-add-quantity']"
  - "3 [data-testid='deviz-add-submit']"
  - "4 [data-testid='deviz-status-sent']"
---

Un deviz este o estimare de materiale. Fiecare estimare este o versiune.
