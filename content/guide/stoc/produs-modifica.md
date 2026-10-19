---
id: produs-modifica
chapter: stoc
order: 3
roles: [owner]
title: Cum modifici sau dezactivezi un produs
steps:
  - "În **Inventar** apasă rândul produsului."
  - "Apasă **Modifică**."
  - "Schimbă ce ai nevoie. Unitatea se blochează după prima mișcare."
  - "Apasă **Salvează modificările**."
  - "Ca să-l scoți din uz apasă **Dezactivează**."
  - "Îl aduci înapoi cu **Reactivează**."
screenshots: [produs-modifica]
see_also: [produs-nou, inventar-cauta]
screen: /inventar
account: owner
before:
  - "click [data-testid='product-row']"
  - "wait [data-testid='product-panel']"
  - "wait [data-testid='product-movements'] tr"
sizes: [desktop, mobile]
marks:
  - "2 [data-testid='panel-edit']"
  - "5 [data-testid='panel-toggle-active']"
---

Un produs nu se șterge. Se dezactivează.
