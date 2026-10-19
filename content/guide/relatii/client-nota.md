---
id: client-nota
chapter: relatii
order: 7
roles: [owner]
title: Cum notezi ce ai discutat cu un client
steps:
  - "Deschide fișa clientului sau a lead-ului."
  - "La cartonașul **Note** scrie în **Ce s-a discutat**."
  - "Dacă vrei, completează **Data următorului pas** și **Următorul pas**."
  - "Apasă **Salvează**."
  - "Nota apare în istoric, cu autorul și data."
  - "Dacă lași câmpul gol, vezi **Scrie ce s-a discutat.**"
screenshots: [client-nota]
see_also: [client-etapa, azi-lista]
screen: /clienti/{client}
account: owner
before:
  - "fill [data-testid='note-body'] => Clientul confirmă comanda de țiglă pentru luna viitoare."
  - "fill [data-testid='note-next-action-at'] => 05.11.2026"
  - "fill [data-testid='note-next-action'] => Trimit factura"
marks:
  - "2 [data-testid='note-body']"
  - "3 [data-testid='note-next-action-at']"
  - "3 [data-testid='note-next-action']"
  - "4 [data-testid='note-save']"
  - "5 [data-testid='timeline-note']"
---

Notele rămân pe fișă, cele mai noi primele, împreună cu mutările de etapă.
