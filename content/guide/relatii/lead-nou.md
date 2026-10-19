---
id: lead-nou
chapter: relatii
order: 3
roles: [owner]
title: Cum adaugi un lead nou
steps:
  - "Din **CRM** apasă **Leaduri**, apoi **Lead nou**."
  - "Scrie **Denumire**; este obligatorie."
  - "Adaugă **Persoană de contact**, **Telefon** și **Email**."
  - "Alege **Sursă** și scrie în **Interes** ce își dorește."
  - "Alege **Etapă**. Pentru **De reluat** completează și **Data de reluare**."
  - "Alege **Responsabil** și scrie **Note**, dacă e nevoie."
  - "Apasă **Salvează**. Se deschide fișa noului lead."
screenshots: [lead-nou]
see_also: [client-etapa, client-nota, clienti-filtre]
screen: /clienti?vedere=leaduri
account: owner
before:
  - "click [data-testid='leaduri-new']"
  - "fill [data-testid='field-leaduri-name'] => TEST Casă Ialoveni"
  - "fill [data-testid='field-leaduri-interest'] => Acoperiș din țiglă metalică, 120 mp"
marks:
  - "2 [data-testid='field-leaduri-name']"
  - "3 [data-testid='field-leaduri-contact']"
  - "3 [data-testid='field-leaduri-phone']"
  - "3 [data-testid='field-leaduri-email']"
  - "4 [data-testid='field-leaduri-source']"
  - "4 [data-testid='field-leaduri-interest']"
  - "5 [data-testid='field-leaduri-stage']"
  - "5 [data-testid='field-leaduri-follow-up']"
  - "6 [data-testid='field-leaduri-owner']"
  - "6 [data-testid='field-leaduri-notes']"
  - "7 [data-testid='leaduri-submit']"
---

Un lead este un client care nu a ajuns încă la etapa Client. Doar administratorul vede butonul.
