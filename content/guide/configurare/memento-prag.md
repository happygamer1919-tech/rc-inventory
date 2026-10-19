---
id: memento-prag
chapter: configurare
order: 2
roles: [owner]
title: Cum schimbi pragul unui produs
steps:
  - "Alege **Memento stoc** din meniu."
  - "La **Praguri per produs** apasă numărul din coloana **Prag**."
  - "Se deschide **Modifică produsul**."
  - "Schimbă **Prag recomandă**."
  - "Apasă **Salvează modificările**."
screenshots: [memento-prag]
see_also: [memento-vezi, produs-modifica]
screen: /memento
account: owner
before:
  - "click [data-testid='threshold-edit-link']"
  - "wait [data-testid='product-form']"
  - "fill [data-testid='field-threshold'] => 10"
marks:
  - "3 role=heading[name='Modifică produsul']"
  - "4 [data-testid='field-threshold']"
  - "5 [data-testid='form-submit']"
---

Pragul decide când pleacă emailul de stoc scăzut.
