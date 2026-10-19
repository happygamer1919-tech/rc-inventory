---
id: produs-nou
chapter: stoc
order: 2
roles: [owner]
title: Cum adaugi un produs nou
steps:
  - "În **Inventar** apasă **Adaugă produs**."
  - "Scrie **Cod SKU** și **Denumire**."
  - "Alege **Categorie** și **Unitate de măsură**."
  - "Completează **Prag recomandă** și **Valoare unitară (MDL)**."
  - "Dacă vrei, alege sau scrie **Furnizor (opțional)**."
  - "Apasă **Adaugă produsul**."
  - "Dacă nu există nicio categorie, adaug-o întâi în Setări."
screenshots: [produs-nou]
see_also: [produs-modifica, setari-categorie]
screen: /inventar
account: owner
before:
  - "click [data-testid='product-new']"
  - "wait [data-testid='product-form']"
  - "fill [data-testid='field-sku'] => TEST-0102"
  - "fill [data-testid='field-name'] => Țiglă metalică TEST"
  - "fill [data-testid='field-threshold'] => 20"
  - "fill [data-testid='field-unit-value'] => 145"
sizes: [desktop, mobile]
marks:
  - "2 [data-testid='field-sku']"
  - "2 [data-testid='field-name']"
  - "3 [data-testid='field-category']"
  - "3 [data-testid='field-unit']"
  - "4 [data-testid='field-threshold']"
  - "4 [data-testid='field-unit-value']"
  - "5 [data-testid='field-supplier']"
  - "6 [data-testid='form-submit']"
---

Unitatea de măsură se fixează acum și nu se mai schimbă după prima mișcare.
