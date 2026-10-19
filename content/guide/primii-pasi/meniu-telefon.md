---
id: meniu-telefon
chapter: primii-pasi
order: 3
roles: [owner, account_manager]
title: Cum folosești meniul pe telefon
steps:
  - "Pe telefon meniul din stânga este ascuns. Apasă butonul cu trei linii din bara de sus, **Deschide meniul**."
  - "Alege pagina dorită din listă."
  - "Ca să închizi meniul fără să alegi nimic, apasă **Închide meniul**."
screenshots: [meniu-telefon]
see_also: [intra-in-cont, iesi-din-cont]
screen: /
account: owner
before:
  - "click [data-testid='sidebar-open']"
  - "wait [data-testid='sidebar-close']"
sizes: [mobile]
marks:
  - "2 #rc-sidebar >> role=link[name='Inventar']"
  - "3 [data-testid='sidebar-close']"
---

Pe un ecran lat, peste 768 de pixeli, meniul este mereu afișat și nu ai nevoie de buton.
