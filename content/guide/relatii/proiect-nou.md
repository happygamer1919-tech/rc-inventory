---
id: proiect-nou
chapter: relatii
order: 11
roles: [owner]
title: Cum adaugi un proiect nou
steps:
  - "Din **CRM** apasă **Proiecte**, apoi **Proiect nou**."
  - "Alege **Client** și scrie **Denumire**."
  - "Completează **Adresă**, **Data început** și **Termen estimat**."
  - "Scrie **Buget (MDL)**. Gol înseamnă fără buget."
  - "Apasă **Salvează**. Se deschide pagina proiectului."
  - "La același client denumirea trebuie să fie unică, altfel vezi **Clientul are deja un proiect cu această denumire.**"
screenshots: [proiect-nou]
see_also: [proiect-stare, proiect-deviz]
screen: /proiecte
account: owner
before:
  - "click [data-testid='project-new']"
  - "fill [data-testid='field-project-name'] => TEST Acoperiș casă Stăuceni"
  - "fill [data-testid='field-project-budget'] => 85000"
marks:
  - "2 [data-testid='field-project-client']"
  - "2 [data-testid='field-project-name']"
  - "3 [data-testid='field-project-address']"
  - "3 [data-testid='field-project-start']"
  - "3 [data-testid='field-project-end']"
  - "4 [data-testid='field-project-budget']"
  - "5 [data-testid='project-submit']"
---

Un proiect aparține unui client, deci clientul trebuie să existe deja.
