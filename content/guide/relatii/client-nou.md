---
id: client-nou
chapter: relatii
order: 4
roles: [owner]
title: Cum adaugi un client nou
steps:
  - "Din **CRM** apasă **Clienți**, apoi **Client nou**."
  - "Scrie **Denumire** și alege **Tip**: **Companie** sau **Persoană fizică**."
  - "Scrie **IDNO**. Persoanele fizice îl lasă gol."
  - "Completează **Telefon**, **Email**, **Adresă** și **Note**."
  - "Apasă **Salvează**. Se deschide fișa clientului."
  - "Dacă IDNO-ul există deja, vezi **Există deja un client cu acest IDNO.**"
screenshots: [client-nou]
see_also: [lead-nou, client-contact]
screen: /clienti?vedere=clienti
account: owner
before:
  - "click [data-testid='client-new']"
  - "fill [data-testid='field-client-name'] => TEST Construct Nord SRL"
marks:
  - "2 [data-testid='field-client-name']"
  - "2 [data-testid='field-client-type']"
  - "3 [data-testid='field-client-fiscal']"
  - "4 [data-testid='field-client-phone']"
  - "4 [data-testid='field-client-email']"
  - "4 [data-testid='field-client-address']"
  - "4 [data-testid='field-client-notes']"
  - "5 [data-testid='client-submit']"
---

Folosește asta pentru cineva care este deja client. Pentru un interesat adaugi un lead.
