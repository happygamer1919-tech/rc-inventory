---
id: factura-din-iesire
chapter: facturare
order: 1
roles: [owner, account_manager]
title: Cum faci o factură dintr-o ieșire
steps:
  - "Alege **Comenzi**, coloana **Ieșiri**, și apasă bonul."
  - "În panou, la **Facturare**, apasă **Creează factură**."
  - "Se deschide **Factură nouă**, completată din ieșire."
  - "Verifică **Data scadenței** și **Cotă TVA (%)**."
  - "Apasă **Salvează ciorna** sau **Emite factura**."
  - "Un bon către client direct sau cu o poziție fără preț nu se poate factura."
screenshots: [factura-din-iesire]
see_also: [factura-emite, iesire-proiect]
screen: /facturare/nou?iesire={outbound_pending}
account: owner
before:
  - "wait [data-testid='factura-editor']"
sizes: [desktop, mobile]
marks:
  - "4 [data-testid='factura-editor-scadenta']"
  - "4 [data-testid='factura-editor-tva']"
  - "5 [data-testid='factura-editor-salveaza']"
  - "5 [data-testid='factura-editor-emite']"
---

Clientul, proiectul și pozițiile se iau din ieșire și nu se mai scriu.
