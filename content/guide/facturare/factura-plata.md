---
id: factura-plata
chapter: facturare
order: 4
roles: [owner, account_manager]
title: Cum marchezi o factură plătită
steps:
  - "Alege **Facturi** din meniu și deschide factura cu starea **Emisă**."
  - "Apasă **Marchează plătită**."
  - "La **Data plății** scrie ziua în care s-a plătit."
  - "Apasă **Da, marchează plătită**."
  - "Starea devine **Plătită**. De aici înainte factura se citește doar."
screenshots: [factura-plata]
see_also: [factura-emite, factura-anuleaza]
screen: /facturare/{invoice_issued}
account: owner
before:
  - "click [data-testid='factura-platita']"
  - "wait [data-testid='factura-platita-confirmare']"
sizes: [desktop, mobile]
marks:
  - "1 aside nav a[href='/facturare']"
  - "2 [data-testid='factura-platita']"
  - "3 [data-testid='factura-platita-data']"
  - "4 [data-testid='factura-platita-da']"
---

Ziua plății nu poate fi în viitor și nici înaintea emiterii.
