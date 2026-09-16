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
] as const;

export default function CrmPage() {
  return (
    <>
      <PageHeader
        title="CRM"
        lead="Clienții, leadurile și proiectele, fiecare la un clic distanță."
      />

      {/* P3-67. Pe telefon (sub 768px) cele trei carduri stau unul sub altul, in
          aceeasi ordine; peste 768px raman trei alaturi. */}
      <div className="grid grid-cols-3 gap-5 max-md:grid-cols-1" data-testid="crm-cards">
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
