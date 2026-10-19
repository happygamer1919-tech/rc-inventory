---
id: factura-anuleaza
chapter: facturare
order: 5
roles: [owner, account_manager]
title: Cum anulezi o factură
steps:
  - "Alege **Facturi** din meniu și deschide factura."
  - "Apasă **Anulează factura**."
  - "Scrie **Motivul anulării**; este obligatoriu."
  - "Apasă **Da, anulează factura**."
  - "Starea devine **Anulată**, iar motivul se vede la cartonașul **Anulare**."
  - "O factură plătită nu se mai anulează de aici. Pentru corecții faci o factură nouă."
screenshots: [factura-anuleaza]
see_also: [factura-emite, factura-noua]
screen: /facturare/{invoice_issued}
account: owner
before:
  - "click [data-testid='factura-anuleaza']"
  - "wait [data-testid='factura-anuleaza-confirmare']"
  - "fill [data-testid='factura-anuleaza-motiv'] => Factură emisă din greșeală, se reface."
sizes: [desktop, mobile]
marks:
  - "1 aside nav a[href='/facturare']"
  - "2 [data-testid='factura-anuleaza']"
  - "3 [data-testid='factura-anuleaza-motiv']"
  - "4 [data-testid='factura-anuleaza-da']"
---

O factură nu se șterge niciodată. Se anulează, cu motiv, și rămâne în listă.
