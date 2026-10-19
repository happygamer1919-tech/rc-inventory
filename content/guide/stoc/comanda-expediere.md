---
id: comanda-expediere
chapter: stoc
order: 7
roles: [owner, account_manager]
title: Cum marchezi o ieșire ca expediată
steps:
  - "Alege **Comenzi** din meniu."
  - "În coloana **Ieșiri** apasă bonul cu starea **În așteptare expediere**."
  - "Apasă **Marchează expediată**."
  - "Starea devine **Expediată**."
  - "Cu filtrul de tip poți vedea doar ieșirile **Proiect** sau **Client direct**."
screenshots: [comanda-expediere]
see_also: [iesire-proiect, comanda-receptie]
screen: /comenzi
account: owner
before:
  - "click [data-testid='outbound-item']:has-text('În așteptare expediere')"
  - "wait [data-testid='outbound-panel']"
sizes: [desktop, mobile]
marks:
  - "3 [data-testid='ship-issue']"
---

Stocul a scăzut deja la crearea bonului. Expedierea înregistrează doar plecarea.
