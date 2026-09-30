"use client";

// P2-05 Iesiri materiale. P3-119: DE ACUM SUNT DOUA FELURI DE IESIRE, si acest
// fisier este alegerea dintre ele si nimic mai mult.
//
// CE FACE, TOT: tine modul ales si randeaza unul din cele doua formulare. Nu are
// nicio stare de formular, nicio validare si nicio scriere. Corpul de dinainte al
// acestui fisier, adica modul "Proiect", este acum OutboundProjectForm.tsx, mutat
// acolo neschimbat.
//
// DE CE ASA. Clauza 1 a cardului P3-119 si hotararea R-215: "Proiect" este implicit
// si este COMPLET NESCHIMBAT in orice privinta, aceleasi campuri, aceeasi validare,
// acelasi comportament, acelasi efect pe stoc. Un singur formular cu ramuri pe mod ar
// fi rescris chiar acele randuri. Deviatia cardului spune ce se face atunci: "keep
// the project path byte-for-byte and add beside it".
//
// MODUL TRAIESTE AICI SI NU IN FORMULARE, ca alegerea sa fie un singur adevar: doua
// stari, una in fiecare formular, s-ar putea deosebi, si atunci ecranul ar arata un
// mod si ar trimite celalalt.
//
// TRECEREA DE LA UN MOD LA ALTUL GOLESTE CAMPURILE CELUILALT, si asta este o
// consecinta a formei si nu o hotarare in plus: React demonteaza formularul care
// pleaca. Este si ce trebuie sa se intample, fiindca un proiect ales nu are niciun
// inteles intr-o iesire catre un client direct.

import * as React from "react";
import { Card, PageHeader } from "@/components/ui/primitives";
import type { CatalogProduct } from "@/lib/data/products";
import type { SelectableProject } from "@/lib/data/projects-types";
import type { OutboundMode } from "@/lib/data/outbound-types";
import { OutboundProjectForm } from "./OutboundProjectForm";
import { OutboundDirectClientForm } from "./OutboundDirectClientForm";
import type { ClientChoice } from "./OutboundDirectClientForm";

export function OutboundScreen({
  products,
  projects,
  clients,
  canCreateClient,
}: {
  products: CatalogProduct[];
  projects: SelectableProject[];
  /** P3-119. Clientii CRM pentru selectorul modului "Client direct". */
  clients: ClientChoice[];
  /** P3-119. Poate utilizatorul sa creeze un client pe loc. Numai administratorul,
   *  de la cardul P3-06, si ecranul nu arata butonul celui care nu poate. */
  canCreateClient: boolean;
}) {
  // "PROIECT" ESTE IMPLICIT, clauza 1. Singurul mod care a existat pana la
  // 2026-09-30, deci si singurul pe care operatorul il foloseste fara sa aleaga.
  const [mode, setMode] = React.useState<OutboundMode>("project");

  // CATALOGUL GOL OPRESTE AMANDOUA MODURILE, deci se raspunde inaintea alegerii:
  // material care nu exista in catalog nu poate pleca nici spre un santier, nici cu
  // un cumparator de la tejghea. Propozitia este cuvant cu cuvant cea de dinainte,
  // mutata din corpul modului proiect, cu acelasi data-testid.
  if (products.length === 0) {
    return (
      <>
        <PageHeader
          title="Ieșiri materiale"
          lead="Eliberare de material către un șantier."
        />
        <Card>
          <div className="px-7 py-12 text-center" data-testid="outbound-no-products">
            <p className="text-[15px] font-semibold text-rc-black">Catalogul este gol</p>
            <p className="text-[13px] text-rc-muted mt-2 max-w-[52ch] mx-auto">
              Nu se poate elibera material care nu există în catalog. Adaugă produse în Inventar și
              recepționează o comandă de intrare ca să existe stoc.
            </p>
          </div>
        </Card>
      </>
    );
  }

  if (mode === "direct_client") {
    return (
      <OutboundDirectClientForm
        products={products}
        clients={clients}
        canCreateClient={canCreateClient}
        mode={mode}
        onModeChange={setMode}
      />
    );
  }

  return (
    <OutboundProjectForm
      products={products}
      projects={projects}
      mode={mode}
      onModeChange={setMode}
    />
  );
}
