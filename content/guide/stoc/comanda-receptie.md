---
id: comanda-receptie
chapter: stoc
order: 6
roles: [owner, account_manager]
title: Cum confirmi recepția unei comenzi de intrare
steps:
  - "Alege **Comenzi** din meniu."
  - "În coloana **Intrări** apasă comanda cu starea **În așteptare**."
  - "Verifică **Poziții**."
  - "Apasă **Confirmă recepția**."
  - "Apare **Recepție confirmată.** și numărul loturilor create."
  - "Starea devine **Recepționată**. O recepție parțială nu se poate înregistra: se confirmă toată comanda."
screenshots: [comanda-receptie]
see_also: [comanda-expediere, inventar-cauta]
screen: /comenzi
account: owner
before:
  - "click [data-testid='inbound-item']:has-text('În așteptare')"
  - "wait [data-testid='inbound-panel']"
sizes: [desktop, mobile]
marks:
  - "3 [data-testid='inbound-lines']"
  - "4 [data-testid='receive-order']"
---

Recepția creează loturile și crește stocul.
