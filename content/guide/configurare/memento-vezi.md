---
id: memento-vezi
chapter: configurare
order: 1
roles: [owner, account_manager]
title: Cum vezi ce produse sunt sub prag
steps:
  - "Alege **Memento stoc** din meniu, grupul Configurare."
  - "La **Praguri per produs** citește **Stoc curent**, **Prag** și **Stare**."
  - "**Epuizat** înseamnă stoc zero, **Sub prag** stoc la prag sau sub el, **Suficient** restul."
  - "La **Alerte declanșate** vezi emailurile trimise: **Trimis** sau **Netrimis**."
  - "Emailul pleacă o singură dată, când produsul coboară sub prag."
  - "Un prag 0 nu trimite email."
screenshots: [memento-vezi]
see_also: [inventar-cauta, tablou-de-bord]
screen: /memento
account: owner
marks:
  - "1 #rc-sidebar >> role=link[name='Memento stoc']"
  - "2 role=columnheader[name='Stoc curent']"
  - "2 role=columnheader[name='Prag']"
  - "2 role=columnheader[name='Stare']"
  - "3 [data-testid='threshold-rows'] >> text='Epuizat'"
  - "3 [data-testid='threshold-rows'] >> text='Sub prag'"
  - "3 [data-testid='threshold-rows'] >> text='Suficient'"
  - "4 [data-testid='alert-rows'] >> text='Trimis'"
  - "4 [data-testid='alert-rows'] >> text='Netrimis'"
---

Memento stoc arată pragul fiecărui produs și alertele trimise pe email.
