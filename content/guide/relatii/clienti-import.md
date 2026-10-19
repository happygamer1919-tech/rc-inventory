---
id: clienti-import
chapter: relatii
order: 10
roles: [owner]
title: Cum imporți clienți sau leaduri dintr-un fișier CSV
steps:
  - "În **Clienți** sau **Leaduri** apasă **Importă din CSV**."
  - "Pasul 1: apasă **Descarcă modelul de import**, completează-l, apoi **Alege fișierul** (doar CSV, cel mult 5 MB) și **Continuă**."
  - "Pasul 2: pentru fiecare coloană alege câmpul potrivit sau **Nu importa**, apoi **Verifică**."
  - "Pasul 3: la un rând dublat alege **Sari peste** sau **Completează câmpurile goale**. Rândurile din **Rânduri cu erori** se sar. Apasă **Continuă**."
  - "Pasul 4: apasă **Importă**."
  - "Citește **Gata. Iată ce s-a întâmplat:**. Dacă au rămas rânduri, apasă **Descarcă rândurile nepreluate**."
screenshots: [clienti-import]
see_also: [clienti-filtre, lead-nou]
screen: /clienti?vedere=clienti
account: owner
before:
  - "click [data-testid='clienti-import']"
  - "wait [data-testid='import-step-1']"
marks:
  - "2 [data-testid='import-template']"
  - "2 [data-testid='import-choose']"
  - "2 [data-testid='import-next']"
---

Importul are patru pași. Nimic nu se scrie până la ultimul.
