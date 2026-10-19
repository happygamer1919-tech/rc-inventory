# Guide measure: screens, actions, roles, tokens

Card P3-319, PR 1 of the six-PR in-platform guide (brief of 2026-10-19, "FIRST, MEASURE").
Written from the source code on `main` at a9c4c953, not from the running app (this machine has no
Docker and may never open the live site). Labels are copied from the source; the guide check
(`npm run check:guide-source`) fails if a label in a lesson stops existing in `app/`, `components/`
or `lib/`.

The lessons live in `content/guide/<chapter>/<lesson>.md`. This file is the inventory they were
cut from. A line marked **no lesson** is an action that exists and is deliberately not taught yet.

## 1. Roles

There are two roles (`lib/supabase/types.ts`, migration 0001 `app_role`):

| Role in code | Shown as | What it can do |
|---|---|---|
| `owner` | Administrator | Everything. Only role that opens `/setari` and `/setari/tabla`. |
| `account_manager` | Operator | Reads every screen except Setări. Writes only the actions listed below. |

Only `/setari` is blocked by route (`lib/routes.ts` `OWNER_ONLY_PREFIXES`). An Operator who opens it
sees "Acces interzis". The menu is not filtered by role: an Operator still sees "Setări".

Write actions open to **both** roles: tasks (create, change, cancel), outbound slips (Ieșiri
materiale, including creating a client in the "Client direct" mode), receiving an inbound order,
marking an outbound slip shipped, uploading a supplier document for automatic reading, manual
inbound orders, retrying a failed reading, confirming a reviewed reading, the whole invoice flow
(create, issue, mark paid, cancel, PDF).

Write actions for the **Administrator only** (buttons are hidden, not greyed, for an Operator):
leads and clients (add, edit, stage, deactivate, contacts, notes, "Am sunat", import, export),
projects (add, edit, status, import, export), deviz (all of it), documents on a client or project
(upload, delete), products (add, edit, picture, deactivate, import, export), "Renunță la document",
everything under Setări, changing a threshold from Memento stoc.

Role filtering is therefore needed: each lesson carries `roles`, and a lesson for an owner-only
action is not shown to an Operator.

## 2. Chapters (same order as the main menu, `lib/nav.ts` NAV)

Chapter 0, "Primii pași", has no menu group (`menu: null` in its `_chapter.md`). It comes first and
is the only chapter that does not follow the menu. Max approved it on 2026-10-19 ("ok + Primii
pași"). Its five lessons: intra-in-cont, iesi-din-cont, meniu-telefon, acces-interzis, scrie-o-data.

| Order | Chapter = menu group | Menu entries |
|---|---|---|
| 0 | Primii pași | none (no menu group) |
| 1 | Principal | Tablou de bord |
| 2 | Intrări | Încarcă comandă, Adăugare manuală |
| 3 | Relații | Azi, CRM (and, through CRM: Clienți, Leaduri, Proiecte, Sarcini) |
| 4 | Stoc | Inventar, Ieșiri materiale, Comenzi, Necesar de materiale |
| 5 | Facturare | Facturi |
| 6 | Configurare | Memento stoc, Setări |

## 3. Screens and actions, by chapter

### Principal

`/` "Tablou de bord", both roles, read only. Cards "Valoare totală stoc", "Produse sub prag",
"Intrări în așteptare", "Ieșiri de expediat"; blocks "Activitate recentă" (button "Vezi comenzile"),
"Produse sub prag" (link "Vezi toate (N)", which goes to Memento stoc, not Inventar),
"Intrări în așteptare", "Ieșiri de expediat". Lesson: tablou-de-bord.

### Intrări

`/incarca-comanda` "Încarcă comandă", both roles. Upload for automatic reading (card "Citire
automată din document", "Alege fișierul"), document states "În lucru", "De verificat", "Parțial",
"Eșuat", buttons "Verifică", "Vezi antetul", "Retrimite", "Renunță la document" (Administrator
only). The review form ends in "Confirmă și creează comanda". Below it the same manual form as
Adăugare manuală. Lessons: incarca-document, verifica-document, retrimite-document.
**No lesson:** "Renunță la document" (Administrator), "Vezi antetul", reading the technical
details of a reading.

`/adauga-manual` "Adăugare manuală", both roles. Cards "Detalii comandă" and "Poziții",
"+ Adaugă poziție", "Confirmă comanda", optional supplier document. Lesson: comanda-manuala.

### Relații

`/azi` "Azi", both roles. "De sunat" table, "Responsabil" filter, "Am sunat" (Administrator),
"Sarcini scadente azi". Lesson: azi-lista.

`/crm` "CRM", both roles. Four cards "Clienți", "Leaduri", "Proiecte", "Sarcini" with "Deschide".
Lesson: crm-sectiuni. Clienți, Leaduri, Proiecte and Sarcini have no menu entry of their own.

`/clienti` (views Toți, Leaduri, Clienți, Inactivi). Search, type and status filters, stage chips,
paging; Administrator buttons "Lead nou", "Client nou", "Importă din CSV", "Exportă CSV",
"Reactivează" (Inactivi view). Lessons: lead-nou, client-nou, clienti-filtre, clienti-import,
client-dezactiveaza. **No lesson:** "Exportă CSV" (clients and leads).

`/clienti/[id]` client or lead record, both roles read. Cards "Date de identificare",
"Note", "Sarcini"; tabs "Contacte", "Proiecte", "Consum materiale", "Documente", "Facturi".
Administrator: "Modifică" (the only way to change a stage), "Dezactivează"/"Reactivează", the
note form, "Contact nou", document upload and delete. Lead stages in order: "Lead rece",
"În cultivare", "De reluat", "Ofertat", "Client". Lessons: client-etapa, client-nota,
client-contact, document-incarca.

`/proiecte` list, both roles read. Filters (search, "În desfășurare" default, "Toate stările",
client), paging; Administrator "Proiect nou", "Importă din CSV", "Exportă CSV".
Lesson: proiect-nou. **No lesson:** project import, project export.

`/proiecte/[id]` project page. Cards "Date proiect", "Stare" (Administrator changes the status
here, saved at once), "Buget, deviz și cost"; tabs "Consum", "Cost", "Deviz", "Comparație",
"Documente", "Facturi", "Istoric". Project statuses: Prospect, Ofertă, Contract, În lucru,
Suspendat, Închis. Deviz (Administrator): "+ Deviz nou", "Adaugă linia", "Reevaluează", "Șterge",
status buttons "Emis", "Acceptat", "Respins", "Expirat". Lessons: proiect-stare, proiect-deviz,
proiect-buget. **No lesson:** the "Comparație" tab on its own, "Reevaluează".

`/sarcini` "Sarcini", both roles. "Sarcină nouă", filters, groups Restante/Azi/Această
săptămână/Alte sarcini/Fără termen, "Modifică", "Anulează sarcina"; no delete anywhere.
Lessons: sarcina-noua, sarcina-modifica.

### Stoc

`/inventar` "Inventar", both roles read. Search, filters, product panel with "Loturi" and
"Mișcări". Administrator: "Adaugă produs", "Modifică", picture, "Dezactivează"/"Reactivează",
"Importă din CSV", "Exportă CSV". No delete. Lessons: inventar-cauta, produs-nou, produs-modifica.
**No lesson:** product import, product export, product picture.

`/iesiri` "Ieșiri materiale", both roles. "Tip ieșire" with "Proiect" or "Client direct";
"Creează bonul de eliberare"; "+ Client nou" in the direct mode. Stock drops when the slip is
created. Lessons: iesire-proiect, iesire-client-direct.

`/comenzi` "Comenzi", both roles. Columns "Intrări" and "Ieșiri"; inbound panel "Confirmă
recepția"; outbound panel "Marchează expediată" and "Creează factură". Lessons: comanda-receptie,
comanda-expediere. **No lesson:** opening the attached document ("Pregătește legătura").

`/necesar` "Necesar de materiale", both roles, read only. Lesson: necesar-materiale.

### Facturare

`/facturare` "Facturi", both roles. "Factură nouă", filters (De la, Până la, Stare, Client,
Caută). `/facturare/nou`: editor with "Salvează ciorna" and "Emite factura".
`/facturare/[id]`: "Modifică ciorna", "Emite factura", "Marchează plătită", "Anulează factura",
"Descarcă PDF". Statuses: Ciornă, Emisă, Plătită, Anulată. An invoice is never deleted. Lessons:
factura-din-iesire, factura-noua, factura-emite, factura-plata, factura-anuleaza.
**No lesson:** the invoice list filters and search.

### Configurare

`/memento` "Memento stoc", both roles read; the threshold number is a link for the Administrator
only. Cards "Praguri per produs" and "Alerte declanșate". Lessons: memento-vezi, memento-prag.

`/setari` "Setări", Administrator only. Sections "Vocabularul catalogului" (Categorii: add,
rename; Unități de măsură: read only), "Date firmă", "Facturare", "Opțiuni produse" (link to
`/setari/tabla`), "Utilizatori" (read only). Lessons: setari-categorie, setari-date-firma,
setari-facturare. **No lesson:** `/setari/tabla` (model, series, thickness combinations: add,
change price, "Retrage", "Reactivează"), the read-only "Utilizatori" list.

## 4. Things the menu-section structure does not cover

The brief says not to bend the structure for these. Max answered on 2026-10-19: they become the
chapter "Primii pași" (chapter 0). Covered by a lesson:

- Signing in ("Intră în cont", lesson intra-in-cont) and out ("Ieșire", iesi-din-cont); there is
  no sign-up and no password reset.
- The phone menu button "Deschide meniul" / "Închide meniul" (meniu-telefon).
- "Acces interzis" and "Contul nu are acces" (acces-interzis, intra-in-cont).
- Typing a date as zz.ll.aaaa (scrie-o-data).

Still **no lesson**: 404 and 500 pages, the search list (arrows, Enter, Escape, diacritics
ignored), paging ("Înapoi", "Înainte"), the side panel (✕ or Esc).

## 5. Design tokens (for the screenshot and page PRs)

Tailwind v4, tokens in `@theme` in `app/globals.css`, no `tailwind.config`.

| Token | Hex | Use |
|---|---|---|
| `rc-orange` | `#f47c1f` | the accent: focus ring, active menu bar, tab underline |
| `rc-orange-button` | `#c25401` | primary button background (white text) |
| `rc-orange-button-hover` | `#a84900` | hover |
| `rc-orange-soft` | `#fff5ea` | pale orange background |
| `rc-black` | `#0b0b0c` | page background |
| `rc-ink` | `#16161a` | side menu, top bar |
| `rc-white` | `#ffffff` | card surface |
| `rc-paper` | `#f7f7f8` | table header, hover |
| `rc-line` / `rc-line-strong` | `#e6e6ea` / `#d3d3da` | borders |
| `rc-muted` / `rc-muted-2` | `#6b6b73` / `#93939d` | secondary text |
| `rc-danger` | `#c92a2a` | errors |
| `rc-warn` | `#b7791f` | warnings |
| `rc-ok` | `#1f7a45` | success |
| `rc-info` | `#1e5fa8` | information |

- Font: system stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue",
  Arial, sans-serif`), no web font. Numbers use `.rc-num`.
- Radius: buttons and inputs 10px, cards 14px, chips fully round.
- Spacing: main area `px-8 py-7`, card header and body `px-5 py-4`, menu 248 px, top bar 58 px.
- Phone breakpoint `max-md` (768 px); controls are at least 44 px high there; tables become cards.
- Icons: the 12 inline SVG icons in `components/ui/Icon.tsx` (`dashboard`, `upload`, `plus`,
  `boxes`, `truck`, `orders`, `bell`, `settings`, `clients`, `projects`, `invoice`, `tasks`).
  The guide draws no icon of its own.

The annotations of PR 2 use `rc-orange` and nothing else.

## 6. What the next PRs need to know

- Unit-style specs live in `tests/e2e/*.spec.ts` (Playwright, no browser needed for a file
  check). `tests/*.test.ts` files are not run by CI.
- Seeded test accounts come from env var names `TEST_OWNER_EMAIL`, `TEST_OWNER_PASSWORD`,
  `TEST_MANAGER_EMAIL`, `TEST_MANAGER_PASSWORD`; seeding is `scripts/seed-test-accounts.mjs` plus
  the `seed-test-*.mjs` scripts, run only in CI after `supabase start`. Invented rows are
  prefixed "TEST". No Docker here, so PR 2 must run in GitHub Actions.
- No markdown library is installed. The front matter is read by `lib/guide/source.mjs`
  (three forms only: `key: value`, `key: [a, b]`, block lists).

## 7. Wording problems seen in the source (not fixed here; not this card)

- Import step 2 offers "Nu importa" without the diacritic (`lib/data/import-shared.ts`); it
  should read "Nu importă". The lesson uses the label as it is on screen.
- The dashboard link "Vezi toate (N)" opens Memento stoc, not Inventar.
- The deviz panel has no field for the margin ("Adaos"), the version name or the validity date,
  although the server function exists.
- The page title of `/adauga-manual` is "Adaugă comandă manual" while the menu says "Adăugare
  manuală".
