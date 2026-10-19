---
id: azi-lista
chapter: relatii
order: 1
roles: [owner, account_manager]
title: Cum folosești lista Azi
steps:
  - "Alege **Azi** din meniu, grupul Relații."
  - "La **De sunat** citește **Denumire**, **Telefon** și **Următorul pas**. Rândul întârziat are semnul **Întârziat**."
  - "Apasă numele ca să deschizi fișa sau numărul ca să suni."
  - "Administratorul apasă **Am sunat** după apel."
  - "În **Ce s-a discutat** scrie pe scurt convorbirea și apasă **Salvează**. Rândul iese din listă."
  - "Mai jos, **Sarcini scadente azi** arată sarcinile cu termenul azi."
screenshots: [azi-lista]
see_also: [crm-sectiuni, sarcina-noua]
screen: /azi
account: owner
before:
  - "click [data-testid='azi-called']"
  - "fill [data-testid='note-body'] => Am sunat. Vrea oferta pentru țiglă metalică, revine luni."
marks:
  - "1 #rc-sidebar a[href='/azi']"
  - "2 [data-testid='azi-next-action']"
  - "2 [data-testid='azi-overdue']"
  - "3 [data-testid='azi-name']"
  - "3 [data-testid='azi-call']"
  - "4 [data-testid='azi-called']"
  - "5 [data-testid='note-body']"
  - "5 [data-testid='note-save']"
  - "6 [data-testid='azi-tasks']"
---

Lista Azi arată leadurile și clienții de sunat azi, cei întârziați primii, în roșu.
