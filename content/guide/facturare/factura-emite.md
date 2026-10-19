---
id: factura-emite
chapter: facturare
order: 3
roles: [owner, account_manager]
title: Cum emiți o factură
steps:
  - "Alege **Facturi** din meniu și deschide ciorna."
  - "Verifică pozițiile. Pentru schimbări apasă **Modifică ciorna**."
  - "Apasă **Emite factura**."
  - "Citește avertismentul și apasă **Da, emite factura**."
  - "Factura primește numărul din serie și starea **Emisă**."
  - "Apasă **Descarcă PDF** ca s-o trimiți clientului."
screenshots: [factura-emite]
see_also: [factura-plata, factura-anuleaza]
screen: /facturare/{invoice_draft}
account: owner
before:
  - "click [data-testid='factura-emite']"
  - "wait [data-testid='factura-emite-confirmare']"
sizes: [desktop, mobile]
marks:
  - "1 aside nav a[href='/facturare']"
  - "2 [data-testid='factura-modifica']"
  - "3 [data-testid='factura-emite']"
  - "4 [data-testid='factura-emite-da']"
---

După emitere factura primește numărul și nu se mai modifică.
