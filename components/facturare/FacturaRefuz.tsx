import Link from "next/link";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { PHONE_TAP } from "@/components/ui/phone";

// De ce nu se poate deschide ecranul, spus romanesc, cu o cale inapoi. Cardul P3-110.
//
// NU ESTE O EROARE SI NU ESTE UN 404. Sunt situatii reale si explicabile: o Iesire care
// are deja o factura, o Iesire cu o poziție fără preț, o factură care nu mai este ciornă
// si deci nu se mai modifică. Un ecran gol sau un mesaj tehnic ar trimite pe cineva sa
// caute un defect care nu exista, ceea ce este chiar judecata scrisa in
// components/ui/SchemaPending.tsx.
//
// TOT TIMPUL EXISTA O CALE INAPOI. Un capăt de drum fără niciun buton este locul in care
// operatorul apasa butonul de inapoi al browserului si pierde ce facea.

export function FacturaRefuz({
  title,
  message,
  back,
  backLabel,
}: {
  title: string;
  message: string;
  back: string;
  backLabel: string;
}) {
  return (
    <>
      <PageHeader title={title} lead="Ecranul nu poate fi deschis acum." />
      <Card>
        <div data-testid="factura-refuz">
          <EmptyState
            title={message}
            action={
              <Link href={back} className="max-md:flex max-md:flex-col">
                <Button variant="secondary" className={PHONE_TAP} data-testid="factura-refuz-inapoi">
                  {backLabel}
                </Button>
              </Link>
            }
          />
        </div>
      </Card>
    </>
  );
}
