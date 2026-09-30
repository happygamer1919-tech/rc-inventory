// P3-114, goal G69 partea 3. UTILIZATORII. DOAR VIZUALIZARE, si asta este o
// decizie scrisa, nu o lipsa de timp.
//
// Raportul de proiectare docs/reports/2026-09-30-author-setari-design.md, sectiunea
// 4 Partea 3, cere fiecare cont cu numele, emailul, rolul romaneste si daca este
// activ, plus o propoziție romaneasca despre faptul ca un cont nou se face in afara
// aplicatiei. "Fara migratie, fara permisiune noua si fara scriere." Schimbarea unui
// rol si stingerea unui cont sunt PARTEA A PATRA, nu o extindere a acesteia, si
// motivul este al raportului: "un ecran care poate stinge un cont isi merita proba
// lui".
//
// DE CE PROPOZIȚIA MERITA UN RAND PE ECRAN. Nimic din RC nu creeaza conturi azi:
// nu exista pagina de inregistrare, iar comentariul tabelei profiles din migratia
// 0001 spune cum se fac, de mana, langa autentificare. Un ecran care nu isi spune
// limita trimite omul sa caute un buton care nu exista, deci scrie ce se poate face
// si unde. ACEEASI POLITEȚE O PLATESTE DEJA BLOCUL Unități de măsură, si acolo
// functioneaza.
//
// NICIUN BUTON DEZACTIVAT pentru "adaugă un cont". Un buton care nu poate reusi
// niciodata este mai rau decat un buton care nu exista, care este exact raspunsul
// pe care l-au primit si categoriile (fara stergere) si unitatile (fara adaugare).
// Propoziția este raspunsul.
//
// ACELASI TIPAR DE TELEFON ca la unitati si categorii: sub 768px fiecare cont
// devine un card, peste 768px nimic nu se schimba, fiindca fiecare clasa poarta
// max-md. Numele de clase vin din components/ui/phone.ts si NU se scriu local:
// asta a curatat obiectivul G56, cardul P3-100.

import {
  PHONE_CELL,
  PHONE_ROW,
  PHONE_TABLE,
  PHONE_WIDE,
} from "@/components/ui/phone";
import { Card, CardHeader, Chip, Table, Td, Th } from "@/components/ui/primitives";
import { plural } from "@/lib/data/format";
import type { AccountRow } from "@/lib/data/utilizatori";
import { ROLE_LABEL } from "@/lib/supabase/types";

export function UserSettings({ rows }: { rows: AccountRow[] }) {
  // Card nu primeste data-testid (components/ui/primitives.tsx), deci blocul este
  // invelit intr-o secțiune care il poarta, exact ca UnitSettings si
  // FacturareSettings. Asa poate acceptanta sa ceara ca in TOT blocul sa nu existe
  // niciun control de scriere, care este chiar afirmatia "doar vizualizare".
  return (
    <section data-testid="settings-utilizatori">
      <Card className={`mb-5 ${PHONE_TABLE}`}>
        <CardHeader
          title="Utilizatori"
          // NUMARUL TRECE PRIN plural: peste nouasprezece romana cere forma cu "de"
          // ("21 de conturi"), iar cardul P3-98 a reparat sase locuri care scriau
          // singure numarul si o greseau. Acesta nu devine al saptelea.
          hint={`${plural(rows.length, "cont", "conturi")} în sistem, cu rolul și starea fiecăruia.`}
          right={<Chip tone="neutral">Doar vizualizare</Chip>}
        />
        <p className="px-5 pt-4 text-[12.5px] text-rc-muted" data-testid="account-creation-note">
          Un cont nou este creat de administrator în afara aplicației, odată cu datele
          de autentificare. Din acest ecran conturile se citesc, nu se modifică.
        </p>
        <Table>
          <thead>
            <tr>
              <Th>Nume</Th>
              <Th>Email</Th>
              <Th>Rol</Th>
              <Th>Stare</Th>
            </tr>
          </thead>
          <tbody data-testid="account-rows">
            {rows.map((r) => (
              <tr
                key={r.id}
                data-testid="account-row"
                data-role={r.role}
                data-active={r.active ? "true" : "false"}
                className={PHONE_ROW}
              >
                <Td data-label="Nume" className={PHONE_WIDE}>
                  <span className="text-[13.5px] font-semibold text-rc-black">{r.name}</span>
                </Td>
                {/* Emailul este lung, deci pe telefon ia toata latimea cardului si se
                    rupe in loc sa fie tăiat. */}
                <Td data-label="Email" className={PHONE_WIDE}>
                  <span className="text-[12.5px] text-rc-muted [overflow-wrap:anywhere]">
                    {r.email ?? "-"}
                  </span>
                </Td>
                {/* ROLUL SE ARATA ROMANESTE SI VINE DIN ROLE_LABEL, harta pe care o
                    citeste deja bara de sus (components/layout/Topbar.tsx). Valoarea
                    stocata ramane tokenul englezesc al enumului app_role: regula este
                    cea din P2-01, o valoare de enum nu este text de interfata. Un al
                    treilea cuvant romanesc pentru acelasi om ar fi fost o invenție. */}
                <Td data-label="Rol" className={PHONE_CELL}>
                  <span className="text-[13px] text-rc-black">{ROLE_LABEL[r.role]}</span>
                </Td>
                {/* STAREA ESTE UN CIP CU CUVANTUL PE EL, niciodata culoare singura:
                    acelasi tipar, cuvant cu cuvant, ca pe lista de clienti
                    (components/clients/ClientsScreen.tsx). Amandoua tonurile sunt
                    masurate la 4.5:1 de tests/e2e/button-contrast.spec.ts. */}
                <Td data-label="Stare" className={PHONE_CELL}>
                  <Chip tone={r.active ? "ok" : "neutral"}>{r.active ? "Activ" : "Inactiv"}</Chip>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>

        {rows.length === 0 ? (
          <p
            className="px-5 py-10 text-center text-[13px] text-rc-muted"
            data-testid="account-empty"
          >
            Niciun cont de arătat.
          </p>
        ) : null}
      </Card>
    </section>
  );
}
