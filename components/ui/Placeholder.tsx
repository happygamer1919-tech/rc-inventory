import { Card, PageHeader } from "@/components/ui/primitives";

// Ecran de tranzitie livrat de RC-01, ca navigatia sa nu aiba legaturi moarte
// inainte ca ecranele reale sa fie construite. Fiecare este inlocuit de cardul
// care il livreaza.
export function Placeholder({
  title,
  lead,
  card,
}: {
  title: string;
  lead: string;
  card: string;
}) {
  return (
    <>
      <PageHeader title={title} lead={lead} />
      <Card>
        <div className="px-6 py-14 text-center">
          <p className="text-[14px] font-semibold text-rc-black">Ecran în construcție</p>
          <p className="text-[13px] text-rc-muted mt-1.5">
            Livrat de cardul <span className="font-semibold text-rc-orange-deep">{card}</span>.
            Structura de navigație și sistemul de design sunt deja active.
          </p>
        </div>
      </Card>
    </>
  );
}
