---
id: client-contact
chapter: relatii
order: 8
roles: [owner]
title: Cum adaugi o persoană de contact
steps:
  - "Deschide fișa clientului, fila **Contacte**."
  - "Apasă **Contact nou**."
  - "Scrie **Persoană de contact**; este obligatorie."
  - "Completează **Rol**, **Telefon**, **Email** și **Note**."
  - "Bifează **Contact principal. Cel mult unul per client.** dacă e cazul."
  - "Apasă **Salvează**."
screenshots: [client-contact]
see_also: [client-nou, client-nota]
screen: /clienti/{client}?fila=contacte
account: owner
before:
  - "click [data-testid='contact-new']"
  - "fill [data-testid='field-contact-name'] => TEST Contact Șantier"
marks:
  - "3 [data-testid='field-contact-name']"
  - "4 [data-testid='field-contact-role']"
  - "4 [data-testid='field-contact-phone']"
  - "4 [data-testid='field-contact-email']"
  - "4 [data-testid='field-contact-notes']"
  - "5 label:has([data-testid='field-contact-primary'])"
  - "6 [data-testid='contact-submit']"
---

Un client poate avea mai multe persoane de contact și cel mult una principală.
