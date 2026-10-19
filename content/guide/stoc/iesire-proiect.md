---
id: iesire-proiect
chapter: stoc
order: 4
roles: [owner, account_manager]
title: Cum eliberezi material către un proiect
steps:
  - "Alege **Ieșiri materiale** din meniu."
  - "La **Tip ieșire** lasă **Proiect**."
  - "La **Destinație** caută șantierul în **Proiect**. **Client** se completează singur."
  - "La **Materiale** caută **Produs** și scrie **Cantitate**. **Preț unitar** (în MDL) poate rămâne gol."
  - "Pentru încă un produs apasă **+ Adaugă poziție**."
  - "Apasă **Creează bonul de eliberare**."
  - "Apare **Bon de eliberare creat**. Dacă stocul nu ajunge, bonul nu se creează."
screenshots: [iesire-proiect]
see_also: [comanda-expediere, factura-din-iesire]
screen: /iesiri
account: owner
before:
  - "click [data-testid='field-project'] input"
  - "click [data-rc-combo-list] li button"
  - "click [data-testid='issue-product-0'] input"
  - "click [data-rc-combo-list] li button"
  - "fill [data-testid='issue-quantity-0'] => 2"
  - "fill [data-testid='issue-price-0'] => 120"
sizes: [desktop, mobile]
marks:
  - "1 aside nav a[href='/iesiri']"
  - "2 [data-testid='issue-mode-option-project']"
  - "3 [data-testid='field-project'] input"
  - "3 [data-testid='field-client']"
  - "4 [data-testid='issue-product-0'] input"
  - "4 [data-testid='issue-quantity-0']"
  - "4 [data-testid='issue-price-0']"
  - "5 [data-testid='issue-add-line']"
  - "6 [data-testid='issue-submit']"
---

Stocul scade imediat ce bonul este creat.
