---
id: factura-noua
chapter: facturare
order: 2
roles: [owner, account_manager]
title: Cum faci o factură de la zero
steps:
  - "Alege **Facturi** din meniu, apoi **Factură nouă**."
  - "La **Client și proiect** caută **Client**. **Proiect** este opțional."
  - "La **Date și cotă** verifică **Data emiterii**, **Data scadenței** și **Cotă TVA (%)**."
  - "La **Poziții** caută produsul sau scrie o denumire, apoi completează **Cantitate** și **Preț unitar**."
  - "Pentru încă un rând apasă **+ Adaugă poziție**."
  - "Apasă **Salvează ciorna**. Dacă lipsește ceva, vezi **Mai lipsește ceva**."
screenshots: [factura-noua]
see_also: [factura-emite, factura-din-iesire]
screen: /facturare/nou
account: owner
before:
  - "wait [data-testid='factura-editor']"
  - "click [data-testid='factura-editor-client'] input"
  - "click [data-rc-combo-list] li button"
  - "fill [data-testid='editor-denumire-0'] => Transport material"
  - "fill [data-testid='editor-cantitate-0'] => 1"
  - "fill [data-testid='editor-pret-0'] => 350"
sizes: [desktop, mobile]
marks:
  - "1 aside nav a[href='/facturare']"
  - "2 [data-testid='factura-editor-client'] input"
  - "2 [data-testid='factura-editor-proiect'] input"
  - "3 [data-testid='factura-editor-data-emiterii']"
  - "3 [data-testid='factura-editor-scadenta']"
  - "3 [data-testid='factura-editor-tva']"
  - "4 [data-testid='editor-produs-0'] input"
  - "4 [data-testid='editor-denumire-0']"
  - "4 [data-testid='editor-cantitate-0']"
  - "4 [data-testid='editor-pret-0']"
  - "5 [data-testid='factura-editor-adauga']"
  - "6 [data-testid='factura-editor-salveaza']"
---

Cât timp este ciornă, factura se poate schimba.
