import Link from "next/link";

// P3-10. UN SINGUR STIL DE LEGATURA CATRE O INREGISTRARE, pentru toate cele
// noua directii pe care le cere cardul.
//
// Noua legaturi cu noua stiluri este chiar defectul pe care cardul acesta il
// repara, si el apare exact asa: fiecare ecran isi scrie propriul <Link> cu
// propriile clase, si trei luni mai tarziu nimeni nu mai stie care text este
// apasabil.
//
// O DESTINATIE ABSENTA NU ESTE NICIODATA O LEGATURA MOARTA. Cand href lipseste,
// se randeaza text simplu cu explicatia romaneasca primita, pentru ca o iesire
// fara proiect este o stare reala cat timp reconcilierea din P3-04 nu s-a
// terminat, si nu o eroare.

export function RecordLink({
  href,
  children,
  fallback,
  testId,
  className,
}: {
  href: string | null | undefined;
  children: React.ReactNode;
  /** Ce se scrie cand nu exista destinatie. Romaneste, si niciodata gol. */
  fallback: string;
  testId?: string;
  className?: string;
}) {
  if (!href) {
    return (
      <span className={`text-rc-muted ${className ?? ""}`} data-testid={testId} data-linked="false">
        {fallback}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={`text-rc-black underline decoration-rc-line-strong underline-offset-2 hover:decoration-rc-orange ${className ?? ""}`}
      data-testid={testId}
      data-linked="true"
    >
      {children}
    </Link>
  );
}
