---
id: client-etapa
chapter: relatii
order: 6
roles: [owner]
title: Cum muți un lead la altă etapă
steps:
  - "Deschide fișa lead-ului din **Leaduri**."
  - "Apasă **Modifică**, sus în dreapta."
  - "La **Etapă** alege **Lead rece**, **În cultivare**, **De reluat**, **Ofertat** sau **Client**."
  - "Pentru **De reluat** completează obligatoriu **Data de reluare**."
  - "Dacă vrei, scrie **Următorul pas**."
  - "Apasă **Salvează**. Alege **Client** când lead-ul a cumpărat."
screenshots: [client-etapa]
see_also: [client-nota, lead-nou]
screen: /clienti/{lead}
account: owner
before:
  - "click [data-testid='client-edit']"
  - "select [data-testid='field-client-stage'] => De reluat"
  - "fill [data-testid='field-client-follow-up'] => 03.11.2026"
  - "fill [data-testid='field-client-next-action'] => Sun după ce primește oferta"
marks:
  - "3 [data-testid='field-client-stage']"
  - "4 [data-testid='field-client-follow-up']"
  - "5 [data-testid='field-client-next-action']"
  - "6 [data-testid='client-submit']"
---

Nu există un buton separat. Etapa se schimbă din Modifică, iar mutarea apare în istoricul Notelor.
