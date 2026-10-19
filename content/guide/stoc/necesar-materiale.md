---
id: necesar-materiale
chapter: stoc
order: 8
roles: [owner, account_manager]
title: Cum citești necesarul de materiale
steps:
  - "Alege **Necesar de materiale** din meniu, grupul Stoc."
  - "Citește caseta de sus: spune câte șantiere au deviz acceptat."
  - "La **Necesar pe produs** compară **Necesar**, **În stoc** și **Deficit**."
  - "Un deficit înseamnă că produsul trebuie comandat."
  - "Coloanele **Prospect**, **Ofertă**, **Contract** și **În lucru** arată de unde vine necesarul."
  - "Apasă un proiect de sub produs ca să deschizi comparația lui."
screenshots: [necesar-materiale]
see_also: [proiect-buget, comanda-manuala]
screen: /necesar
account: owner
before:
  - "wait [data-testid='need-rows'] tr"
sizes: [desktop, mobile]
marks:
  - "1 aside nav a[href='/necesar']"
  - "2 [data-testid='need-excluse']"
  - "3 [data-testid^='need-necesar-']"
  - "3 [data-testid^='need-stoc-']"
  - "4 [data-testid^='need-row-'][data-has-shortfall='true'] [data-testid^='need-deficit-']"
  - "5 [data-testid^='need-stare-'][data-testid$='-lead']"
  - "5 [data-testid^='need-stare-'][data-testid$='-offer']"
  - "5 [data-testid^='need-stare-'][data-testid$='-contract']"
  - "5 [data-testid^='need-stare-'][data-testid$='-active']"
  - "6 a[data-testid^='need-project-']"
---

Raportul arată ce mai trebuie cumpărat pentru șantierele cu deviz acceptat.
