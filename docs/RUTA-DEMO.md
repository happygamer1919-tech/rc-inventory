# Ruta de demonstrație și rezultatul verificării complete

Livrat de cardul RC-11. Faza 1, previzualizare.

Aplicația pornește cu `npm run dev` și se deschide la `http://localhost:3000`.
Doar desktop. Nimic nu se salvează: la reîncărcarea paginii totul revine la
datele demonstrative de pornire, ceea ce este de dorit în timpul unei prezentări,
pentru că fiecare demonstrație începe curat.

---

## 1. Ruta de demonstrație

Ordinea exactă de clic pentru a purta clientul prin poveste. Durează în jur de
șase minute cu explicații.

### Pasul 1. Tablou de bord
Punctul de plecare. Se arată cele patru cifre de sus și fluxul de activitate.

> "Aici vezi tot depozitul dintr-o privire: cât valorează stocul, ce e pe
> terminate, ce urmează să intre și ce e pregătit să plece."

Cifrele de pornire: **2.441.222 MDL** valoare stoc, **9** produse sub prag
(2 epuizate), **4** intrări în așteptare, **3** ieșiri de expediat.

### Pasul 2. Încarcă comandă
Meniul stânga, secțiunea Intrări. Se apasă **Folosește acest document** la prima
confirmare din listă (Röben Klinker, EUR, 4 poziții).

> "Furnizorul îți trimite o confirmare pe e-mail. O arunci aici și atât."

### Pasul 3. Procesarea
Rulează cinci etape vizibile, aproximativ cinci secunde. Se lasă să curgă, nu se
vorbește peste ea.

> "Citește antetul, găsește furnizorul, scoate pozițiile din tabel și le pune în
> corespondență cu produsele tale."

### Pasul 4. Verifică și confirmă
Fișa apare deja completată. Se arată că sub fiecare produs scrie ce era pe
documentul furnizorului. Se modifică o cantitate în fața clientului, ca să se
vadă că totalurile se recalculează.

> "Nimic nu intră în sistem fără să confirmi tu. Poți corecta orice, poți
> adăuga sau șterge o linie."

Se apasă **Confirmă comanda**.

### Pasul 5. Comenzi
Se apasă **Vezi comanda în listă**. Comanda nouă apare în coloana Intrări cu
starea *În așteptare*.

> "Intrările și ieșirile stau una lângă alta. Vezi imediat ce datorezi și ce
> datorează depozitul."

### Pasul 6. Recepția creează loturile
Se deschide comanda nouă, se arată că scrie *Marfa nu a sosit încă*, apoi se
apasă **Marchează recepționată**.

> "Ăsta e momentul în care marfa devine stoc. Loturile se creează acum, nu când
> ai dat comanda."

Apare secțiunea *Loturi create de această recepție* cu patru loturi, iar
istoricul stărilor primește o intrare nouă cu oră și autor.

### Pasul 7. Ieșiri materiale
Meniul stânga, secțiunea Stoc. Se caută un produs scriind **tigla** (fără
diacritice, intenționat, pentru că așa se scrie în realitate).

> "Alegi șantierul și ce trimiți acolo. Prețul îl completezi doar dacă vinzi.
> Când trimiți la propriul șantier, îl lași gol."

Se pune o cantitate, un client și un proiect nou, se apasă **Creează bonul de
eliberare**.

### Pasul 8. Inventar
Se arată filtrele, apoi se apasă pe un rând.

> "Fiecare produs îți spune din ce loturi e făcut stocul și unde a plecat
> fiecare bucată."

### Pasul 9. Memento stoc
Se arată pragurile editabile și lista alertelor deja declanșate.

> "Îți spune ce se termină înainte să te sune șeful de șantier."

Comutatoarele de e-mail și SMS se arată explicit ca fiind **doar interfață** în
această fază.

### Pasul 10. Setări și închidere
Se arată categoriile și unitățile pe care sistemul le cunoaște, apoi se revine la
**Tablou de bord**, unde cifrele s-au schimbat față de pasul 1.

> "Tot ce am făcut în ultimele cinci minute se vede aici. Un singur loc,
> actualizat singur."

---

## 2. Rezultatul verificării complete

Fiecare ecran și fiecare control au fost parcurse pe `localhost` la 1501x812.

### Baleiaj automat, toate cele 8 ecrane

Fără nicio problemă la: controale fără nume accesibil, legături inerte, lipsa
titlului de pagină, text cu aceeași culoare ca fundalul, curgere orizontală a
paginii.

### Legături

| Verificare | Rezultat |
|---|---|
| Cele 8 rute răspund 200 | da |
| Fiecare `href` scris în cod duce la o rută reală | da |
| Logo și cele două PDF-uri răspund 200 | da |
| O rută inexistentă răspunde 404 | da |
| Intrare de meniu fără ecran | niciuna |
| Ecran care lipsește din meniu | niciunul |

### Parcurgerea rutei de demonstrație, cap la cap

Cifrele se leagă între ele, ceea ce este proba că ecranele citesc din aceeași
sursă:

- Valoarea stocului a urcat de la 2.441.222 la 2.795.542 MDL, adică exact
  354.320 MDL, suma celor patru poziții recepționate.
- Produsele sub prag au scăzut de la 9 la 8, pentru că un singur produs
  (KLI-002) a urcat de la 118 la 258 m² față de pragul lui de 150.
- Intrările în așteptare au rămas 4: una creată, una recepționată.
- Ieșirile de expediat au urcat de la 3 la 4, adică bonul nou.

### Probleme găsite și reparate în timpul construcției

| Unde | Problema | Reparat |
|---|---|---|
| Panoul de produs, RC-06 | Coloanele Lot și Cantitate erau invizibile: text alb pe suprafață albă, pentru că panoul nu își fixase culoarea textului | da, plus audit pe toate suprafețele albe |
| Căutarea din Inventar, RC-06 | Căutarea era sensibilă la diacritice, deci „tigla” nu găsea „Țiglă” | da, normalizare NFD |
| Lista derulantă cu căutare, RC-07 | Lista era tăiată de `overflow` al tabelului și se vedea doar o dungă | da, se randează prin portal |
| Confirmările PDF, RC-02 | Coloanele de preț se suprapuneau, din cauza estimării lățimii textului | da, metrici reale Helvetica |
| Tablou de bord, RC-03 | Numărul de produse era scris fix în pagină | da, se citește din date |
| Tablou de bord, RC-03 | Valoarea stocului rupea rândul și înălța cardul | da, moneda este sufix mai mic |

### Rămâne deliberat neconstruit în faza 1

Recepții și expedieri parțiale, mai multe depozite, autentificare și roluri,
păstrarea datelor între reîncărcări, trimiterea reală a alertelor, administrarea
categoriilor și a unităților, orice sursă de curs valutar, aspect pentru telefon.

Dacă clientul întreabă în timpul demonstrației, răspunsul este că sunt programate
pentru faza 2, nu că au fost uitate.
