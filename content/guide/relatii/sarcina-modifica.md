---
id: sarcina-modifica
chapter: relatii
order: 17
roles: [owner, account_manager]
title: Cum finalizezi sau anulezi o sarcină
steps:
  - "Din **CRM** apasă **Sarcini**."
  - "Găsește sarcina. Cele întârziate au semnul **Întârziată**."
  - "Apasă **Modifică** pe rândul ei."
  - "Ca s-o închizi, la **Stare** alege **Finalizată** și apasă **Salvează**."
  - "Ca s-o anulezi, apasă **Anulează sarcina**."
  - "Sarcinile închise se văd dacă la **Stare** alegi **Toate stările**."
screenshots: [sarcina-modifica]
see_also: [sarcina-noua, azi-lista]
screen: /sarcini?sarcina={task}
account: owner
before:
  - "wait [data-testid='task-form']"
  - "select [data-testid='field-task-status'] => Finalizată"
marks:
  - "4 [data-testid='field-task-status']"
  - "4 [data-testid='task-save']"
  - "5 [data-testid='task-cancel-task']"
---

Sarcinile nu se șterg. Una anulată rămâne pe înregistrare.
