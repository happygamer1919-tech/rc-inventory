// P3-46 CRM, ecranul de intrare: trei carduri mari si colorate, Clienți, Leaduri
// si Proiecte.
//
// NU CITESTE NIMIC DIN BAZA. Trei carduri si trei legaturi, fara numere: predarea
// proprietarului nu cere niciunul, iar cardul P3-40 a masurat deja in jur de 32 de
// drumuri la baza pe o randare autentificata. Un ecran al carui singur rost este sa
// fie un meniu nu adauga altele. Sesiunea o citeste layout-ul, ca la orice ecran.
//
// DESTINATIILE FOLOSESC PARAMETRII PE CARE I-A LIVRAT P3-45, cititi din
// parseClientQuery in lib/data/clients.ts: `vedere=clienti` arata doar clientii de
// la etapa Client, `vedere=leaduri` pe toti ceilalti. Proiecte duce la /proiecte,
// neschimbat. Nicio ruta noua pentru vederi, deci nicio redirectare.
//
// Culoarea sta LANGA eticheta si niciodata in locul ei, ca la etapele clientului:
// cine nu deosebeste culorile citeste tot eticheta. `data-colour` este un atribut,
// nu text.

import Link from "next/link";
import { PageHeader } from "@/components/ui/primitives";

const CARDS = [
  {
    href: "/clienti?vedere=clienti",
    label: "Clienți",
    description: "Cei care au devenit clienți, cu datele lor de contact și proiectele lor.",
    colour: { name: "green", className: "bg-rc-ok" },
  },
  {
    href: "/clienti?vedere=leaduri",
    label: "Leaduri",
    description: "Cei care nu sunt încă clienți, cu etapa lor și data la care trebuie reluați.",
    colour: { name: "amber", className: "bg-rc-warn" },
  },
  {
    href: "/proiecte",
    label: "Proiecte",
    description: "Șantierele, cu stadiul lor și cu bugetul lor.",
    colour: { name: "blue", className: "bg-rc-info" },
  },
  // P3-131, goal G73, Item 4 al lui Ivan. AL PATRULEA CARD, si asta este "fila nouă
  // Sarcini in secțiunea CRM" a clauzei 1: secțiunea aceasta NU ARE BANDA DE FILE,
  // are ecranul de intrare cu carduri mari, deci o fila nouă aici este un card nou
  // plus ruta /sarcini inscrisa in CRM_SCREENS din lib/nav.ts.
  //
  // SI AICI NU SE CITESTE NIMIC DIN BAZA, nici pe cardul acesta: niciun numar de
  // sarcini restante si niciunul de sarcini de azi, oricat ar fi fost de util. Vezi
  // antetul fisierului. Numarul acela ar fi fost primul drum la baza al unui ecran
  // care nu face niciunul.
  //
  // A PATRA CULOARE ESTE PORTOCALIUL, singurul token de fundal rămas langa verde,
  // chihlimbar si albastru care nu este rosul de pericol: o sarcina nu este o
  // eroare. Este si accentul platformei, deci nu se adauga niciun token nou.
  {
    href: "/sarcini",
    label: "Sarcini",
    description: "Treburile de făcut, grupate în restante, azi și această săptămână.",
    colour: { name: "orange", className: "bg-rc-orange" },
  },
] as const;

export default function CrmPage() {
  return (
    <>
      <PageHeader
        title="CRM"
        // P3-131. Subtitlul numara ce este pe ecran, deci creste cu al patrulea
        // card: lasat la trei, ar fi fost singura propozitie de pe pagina care
        // spunea ceva fals despre pagina.
        lead="Clienții, leadurile, proiectele și sarcinile, fiecare la un clic distanță."
      />

      {/* P3-67. Pe telefon (sub 768px) cardurile stau unul sub altul, in aceeasi
          ordine; peste 768px stau alaturi.
          P3-131. PATRU COLOANE SI NU TREI, fiindca de la cardul acesta sunt patru
          carduri si al patrulea intr-o grila de trei ar fi rămas singur pe un rand.
          Invelisul garanteaza 1100px de la 768px in sus (app/globals.css, .rc-shell),
          deci patru carduri intra. `max-md:grid-cols-1` rămâne NEATINS: pe telefon
          sunt tot unul sub altul. */}
      <div className="grid grid-cols-4 gap-5 max-md:grid-cols-1" data-testid="crm-cards">
        {CARDS.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            data-testid="crm-card"
            className="group flex min-h-[200px] flex-col overflow-hidden rounded-[14px] border border-rc-line bg-rc-white text-rc-black shadow-[0_1px_2px_rgba(0,0,0,.28)] transition-transform hover:-translate-y-0.5"
          >
            <span aria-hidden="true" className={`block h-2 ${c.colour.className}`} />
            <span className="flex flex-1 flex-col p-6">
              <span className="inline-flex items-center gap-2.5" data-testid="crm-card-title">
                <span
                  aria-hidden="true"
                  data-testid="crm-card-colour"
                  data-colour={c.colour.name}
                  className={`inline-block h-3.5 w-3.5 rounded-full ${c.colour.className}`}
                />
                <span data-testid="crm-card-label" className="text-[22px] font-bold tracking-tight">
                  {c.label}
                </span>
              </span>
              <span className="mt-2 text-[13.5px] text-rc-muted">{c.description}</span>
              <span className="mt-auto pt-6 text-[13px] font-semibold text-rc-orange group-hover:underline">
                Deschide
              </span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
