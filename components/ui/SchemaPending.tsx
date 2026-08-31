import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";

// Ecranul pe care il vede cineva cand functia este scrisa dar migratiile ei nu
// au fost inca aplicate pe baza de date.
//
// EXISTA PENTRU CA ALTERNATIVA ESTE UN 500. Codul fazei 3 este fuzionat si
// livrat; migratiile ei sunt scrise si NEAPLICATE, si asta este o stare
// legitima: aplicarea este cardul P3-27 si apartine proprietarului. Pana atunci
// ecranele acestea nu au ce citi, iar un ecran care nu are ce citi trebuie sa o
// spuna, nu sa arunce.
//
// SPUNE CE LIPSESTE SI CINE O REZOLVA. Un "ceva nu a mers" generic ar trimite pe
// cineva sa caute un defect care nu exista.

export function SchemaPending({ title, lead }: { title: string; lead: string }) {
  return (
    <>
      <PageHeader title={title} lead={lead} />
      <Card>
        <EmptyState
          title="Secțiunea nu este încă activă pe această bază de date"
          hint="Ecranul este gata, dar modificările de structură pe care le folosește nu au fost încă aplicate. Se activează singură imediat după aplicare, fără o nouă livrare."
        />
      </Card>
    </>
  );
}
