---
id: iesire-client-direct
chapter: stoc
order: 5
roles: [owner, account_manager]
title: Cum eliberezi material unui client care ridică de la depozit
steps:
  - "Alege **Ieșiri materiale** din meniu."
  - "La **Tip ieșire** alege **Client direct**."
  - "Caută **Client** după nume. Dacă nu există, apasă **+ Client nou**, completează **Denumire** și **Tip**, apoi **Salvează clientul**."
  - "Alege **Data ridicării**."
  - "La **Materiale** adaugă **Produs** și **Cantitate**."
  - "Apasă **Creează bonul de eliberare**."
screenshots: [iesire-client-direct]
see_also: [iesire-proiect, comanda-expediere]
screen: /iesiri
account: owner
before:
  - "click [data-testid='issue-mode-direct_client']"
  - "wait [data-testid='field-pickup-date']"
  - "click [data-testid='field-client'] input"
  - "click [data-rc-combo-list] li button"
  - "fill [data-testid='issue-pickup-date'] => 20.10.2026"
  - "click [data-testid='issue-product-0'] input"
  - "click [data-rc-combo-list] li button"
  - "fill [data-testid='issue-quantity-0'] => 2"
sizes: [desktop, mobile]
marks:
  - "1 aside nav a[href='/iesiri']"
  - "2 [data-testid='issue-mode-option-direct_client']"
  - "3 [data-testid='field-client'] input"
  - "3 [data-testid='client-create-open']"
  - "4 [data-testid='issue-pickup-date']"
  - "5 [data-testid='issue-product-0'] input"
  - "5 [data-testid='issue-quantity-0']"
  - "6 [data-testid='issue-submit']"
---

Fără șantier. Banii se încasează în afara sistemului, deci din acest bon nu se face factură.
