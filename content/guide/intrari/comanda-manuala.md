---
id: comanda-manuala
chapter: intrari
order: 4
roles: [owner, account_manager]
title: Cum adaugi o comandă de intrare de mână
steps:
  - "Alege **Adăugare manuală** din meniu."
  - "La **Detalii comandă** completează **Furnizor**, **Monedă** și **Livrare estimată**."
  - "La **Poziții** alege **Alege produsul din catalog**, apoi scrie **Cantitate** și **Preț unitar**."
  - "Pentru încă un produs apasă **+ Adaugă poziție**."
  - "Apasă **Confirmă comanda**."
  - "Dacă ai documentul furnizorului, atașează-l cu **Alege fișierul**."
screenshots: [comanda-manuala]
see_also: [comanda-receptie, incarca-document]
screen: /adauga-manual
account: owner
before:
  - "fill [data-testid='order-supplier'] => TEST Furnizor Exemplu SRL"
  - "fill [data-testid='order-expected-at'] => 15.12.2026"
  - "fill [data-testid='line-quantity-0'] => 20"
  - "fill [data-testid='line-price-0'] => 85"
marks:
  - "1 #rc-sidebar >> role=link[name='Adăugare manuală']"
  - "2 [data-testid='order-supplier']"
  - "2 [data-testid='order-currency']"
  - "2 [data-testid='order-expected-at']"
  - "3 [data-testid='line-product-0']"
  - "3 [data-testid='line-quantity-0']"
  - "3 [data-testid='line-price-0']"
  - "4 [data-testid='order-add-line']"
  - "5 [data-testid='order-confirm']"
---

Folosește asta pentru furnizorii care nu trimit un document de citit.
