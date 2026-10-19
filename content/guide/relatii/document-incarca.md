---
id: document-incarca
chapter: relatii
order: 15
roles: [owner]
title: Cum încarci un document pe fișa unui client sau a unui proiect
steps:
  - "Deschide fișa clientului sau pagina proiectului."
  - "Alege fila **Documente**."
  - "La **Tip document** alege **Contract**, **Act**, **Factură**, **Fotografie** sau **Altele**."
  - "Apasă **Alege fișierul** și alege fișierul."
  - "Apasă **Încarcă**. Apare **Documentul a fost încărcat.**"
  - "Oricine îl descarcă cu **Descarcă**. Administratorul îl poate șterge cu **Șterge**, definitiv."
screenshots: [document-incarca]
see_also: [client-nou, proiect-nou]
screen: /clienti/{client}?fila=documente
account: owner
before:
  - "select [data-testid='document-kind'] => Contract"
marks:
  - "2 [data-testid='tab-documente']"
  - "3 [data-testid='document-kind']"
  - "4 [data-testid='document-choose']"
  - "5 [data-testid='document-submit']"
  - "6 [data-testid='document-download']"
  - "6 [data-testid='document-delete']"
---

Se acceptă PDF, JPG, JPEG, PNG, WEBP, DOC, DOCX, XLS și XLSX, de cel mult 20 MB.
