---
id: setari-categorie
chapter: configurare
order: 3
roles: [owner]
title: Cum adaugi o categorie de produse
steps:
  - "Alege **Setări** din meniu, grupul Configurare."
  - "Deschide **Vocabularul catalogului**."
  - "La **Categorii** scrie numele în **Categorie nouă**."
  - "Apasă **Adaugă**."
  - "Ca să schimbi un nume apasă **Redenumește**, scrie numele nou și apasă **Salvează**."
  - "O categorie nu se șterge."
screenshots: [setari-categorie]
see_also: [produs-nou, setari-date-firma]
screen: /setari?sectiune=catalog
account: owner
before:
  - "fill [data-testid='category-name'] => TEST Membrane"
marks:
  - "1 #rc-sidebar >> role=link[name='Setări']"
  - "2 [data-testid='settings-section-catalog']"
  - "3 [data-testid='category-name']"
  - "4 [data-testid='category-add']"
  - "5 [data-testid='category-rename']"
---

Fiecare produs aparține exact unei categorii. Doar administratorul deschide Setări.
