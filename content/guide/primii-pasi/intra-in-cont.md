---
id: intra-in-cont
chapter: primii-pasi
order: 1
roles: [owner, account_manager]
title: Cum intri în cont
steps:
  - "Deschide adresa platformei în browser."
  - "În câmpul **Email** scrie adresa contului tău."
  - "În câmpul **Parolă** scrie parola."
  - "Apasă **Intră în cont**."
  - "Dacă apare mesajul **Contul nu are acces**, cere administratorului să-ți activeze contul."
screenshots: [intra-in-cont]
see_also: [iesi-din-cont, meniu-telefon]
screen: /autentificare
account: none
before:
  - "fill #email => operator@exemplu.test"
  - "fill #password => parola-exemplu"
marks:
  - "2 #email"
  - "3 #password"
  - "4 [data-testid='login-submit']"
---

Conturile le creează administratorul. Nu există înregistrare de la sine și nici resetare de parolă.
