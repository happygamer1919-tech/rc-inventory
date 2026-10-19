---
id: setari-date-firma
chapter: configurare
order: 4
roles: [owner]
title: Cum completezi datele firmei
steps:
  - "Alege **Setări** din meniu."
  - "Deschide **Date firmă**."
  - "Completează **Denumirea firmei**, **IDNO**, **Adresa**, **Banca** și **IBAN**."
  - "Sub **Cod TVA, telefon și email** completează **Cod TVA**, **Telefon** și **Email**."
  - "Apasă **Salvează datele firmei**."
  - "Apare **Datele firmei au fost salvate.**"
screenshots: [setari-date-firma]
see_also: [setari-facturare, factura-emite]
screen: /setari?sectiune=date-firma
account: owner
before:
  - "fill [data-testid='date-firma-name'] => TEST Firma Exemplu SRL"
  - "fill [data-testid='date-firma-fiscal-code'] => 1000000000000"
  - "fill [data-testid='date-firma-address'] => str. Exemplului 1, Chișinău"
  - "fill [data-testid='date-firma-bank'] => TEST Banca Exemplu"
  - "fill [data-testid='date-firma-iban'] => MD00TE000000000000000000"
  - "fill [data-testid='date-firma-vat-code'] => 0000000"
  - "fill [data-testid='date-firma-phone'] => +373 22 000 000"
  - "fill [data-testid='date-firma-email'] => contact@exemplu.test"
marks:
  - "1 #rc-sidebar >> role=link[name='Setări']"
  - "2 [data-testid='settings-section-date-firma']"
  - "3 [data-testid='date-firma-name']"
  - "3 [data-testid='date-firma-fiscal-code']"
  - "3 [data-testid='date-firma-address']"
  - "3 [data-testid='date-firma-bank']"
  - "3 [data-testid='date-firma-iban']"
  - "4 [data-testid='date-firma-vat-code']"
  - "4 [data-testid='date-firma-phone']"
  - "4 [data-testid='date-firma-email']"
  - "5 [data-testid='date-firma-save']"
---

Aceleași date apar pe fiecare factură.
