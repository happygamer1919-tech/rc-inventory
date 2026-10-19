---
id: sarcina-noua
chapter: relatii
order: 16
roles: [owner, account_manager]
title: Cum adaugi o sarcină
steps:
  - "Din **CRM** apasă **Sarcini**, apoi **Sarcină nouă**. Pe o fișă folosești același buton, la cartonașul **Sarcini**."
  - "Scrie **Titlu**; este obligatoriu."
  - "Alege **Stare** și **Urgență**."
  - "Scrie **Termen** ca zi.lună.an, de exemplu 01.12.2026."
  - "Alege **Responsabil**."
  - "Alege **Fel înregistrare**, apoi înregistrarea."
  - "Apasă **Salvează**."
screenshots: [sarcina-noua]
see_also: [sarcina-modifica, azi-lista]
screen: /sarcini
account: owner
before:
  - "click [data-testid='task-new']"
  - "fill [data-testid='field-task-title'] => Trimite oferta pentru acoperiș"
  - "fill [data-testid='field-task-due-date'] => 01.12.2026"
  - "select [data-testid='field-task-entity-type'] => Client"
marks:
  - "2 [data-testid='field-task-title']"
  - "3 [data-testid='field-task-status']"
  - "3 [data-testid='field-task-priority']"
  - "4 [data-testid='field-task-due-date']"
  - "5 [data-testid='field-task-assignee']"
  - "6 [data-testid='field-task-entity-type']"
  - "6 [data-testid='field-task-entity']"
  - "7 [data-testid='task-save']"
---

O sarcină poate sta pe un client, un lead sau un proiect.
