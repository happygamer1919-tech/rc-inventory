import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pagina nu există - Rapid Construct",
};

// P2-11. Ecranul 404, in romana.
//
// STA IN app/ SI NU IN app/(app)/, deliberat. Layout-ul grupului (app) randeaza
// bara laterala si bara de sus si citeste rolul din sesiune; o adresa gresita
// tastata de un vizitator neautentificat nu are sesiune, si un invelis cu date
// goale este exact ce cardul P2-02 interzice. Aici pagina se randeaza singura,
// cu propriul ei drum inapoi.
//
// Legatura inapoi duce la tabloul de bord. Un 404 fara iesire lasa operatorul cu
// butonul "inapoi" al browserului ca singura optiune, ceea ce dupa o redirectare
// il duce inapoi tot aici.
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-rc-black px-6 py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-rc-orange" data-testid="not-found-code">
        404
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-rc-white" data-testid="not-found">
        Pagina nu există
      </h1>
      <p className="mt-3 max-w-md text-sm text-rc-muted-2">
        Adresa cerută nu duce nicăieri în aplicație. Poate a fost tastată greșit
        sau poate ai urmat o legătură veche.
      </p>
      <Link
        href="/"
        data-testid="not-found-home"
        className="mt-7 rounded-lg bg-rc-orange px-4 py-2.5 text-sm font-semibold text-rc-black transition-colors hover:bg-rc-orange-dark"
      >
        Înapoi la tabloul de bord
      </Link>
    </main>
  );
}
