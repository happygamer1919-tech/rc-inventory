import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Acces interzis - Rapid Construct",
};

// Ecranul 403. Middleware-ul face rewrite catre el, deci adresa ramane cea
// ceruta si nu poate aparea o bucla de redirect. Cardul cere un ecran romanesc
// explicit, nu o pagina goala si nu o redirectare tacuta.
export default function AccesInterzisPage() {
  return (
    <div
      className="flex flex-col items-center justify-center py-24 text-center"
      data-testid="forbidden"
    >
      <p className="text-sm font-semibold uppercase tracking-widest text-rc-orange">
        403
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-rc-white">
        Acces interzis
      </h1>
      <p className="mt-3 max-w-md text-sm text-rc-muted-2">
        Contul tău are rol de operator. Această secțiune este disponibilă doar
        administratorului. Dacă ai nevoie de acces, cere-i administratorului să
        îți schimbe rolul.
      </p>
      <Link
        href="/"
        className="mt-7 rounded-lg bg-rc-orange px-4 py-2.5 text-sm font-semibold text-rc-black transition-colors hover:bg-rc-orange-dark"
      >
        Înapoi la tabloul de bord
      </Link>
    </div>
  );
}
