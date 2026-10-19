---
id: setari-facturare
chapter: configurare
order: 5
roles: [owner]
title: Cum setezi seria facturilor și cota TVA
steps:
  - "Alege **Setări** din meniu, apoi **Facturare**."
  - "Scrie **Prefixul seriei**, de exemplu RC-."
  - "Sub câmp vezi cum va arăta următorul număr."
  - "Scrie **Cota TVA implicită (%)** și confirm-o cu contabilul."
  - "Bifează **Anul intră în numărul facturii** dacă vrei anul în număr."
  - "Apasă **Salvează setările**."
  - "Cota se poate schimba pe fiecare factură."
screenshots: [setari-facturare]
see_also: [setari-date-firma, factura-emite]
screen: /setari?sectiune=facturare
account: owner
before:
  - "fill [data-testid='facturare-series-prefix'] => RC-"
  - "fill [data-testid='facturare-vat-rate'] => 20"
marks:
  - "1 #rc-sidebar >> role=link[name='Setări']"
  - "1 [data-testid='settings-section-facturare']"
  - "2 [data-testid='facturare-series-prefix']"
  - "3 [data-testid='facturare-number-example']"
  - "4 [data-testid='facturare-vat-rate']"
  - "5 label:has([data-testid='facturare-year'])"
  - "6 [data-testid='facturare-save']"
---

Seria dă numerele facturilor, fără goluri și fără repetări.
