// Definitia unica a navigatiei. Toate ecranele din faza 1 sunt aici si numai ele.
// RC-10 cere ca nimic care nu poate fi construit in faza 1 sa nu apara in meniu,
// asa ca lista aceasta este si sursa verificarii de legaturi moarte.

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  description: string;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export type IconName =
  | "dashboard"
  | "upload"
  | "plus"
  | "boxes"
  | "truck"
  | "orders"
  | "bell"
  | "settings";

export const NAV: NavGroup[] = [
  {
    title: "Principal",
    items: [
      {
        href: "/",
        label: "Tablou de bord",
        icon: "dashboard",
        description: "Valoare stoc, alerte si activitate recentă",
      },
    ],
  },
  {
    title: "Intrări",
    items: [
      {
        href: "/incarca-comanda",
        label: "Încarcă comandă",
        icon: "upload",
        description: "Încarcă o confirmare și lasă sistemul să o citească",
      },
      {
        href: "/adauga-manual",
        label: "Adăugare manuală",
        icon: "plus",
        description: "Aceeași fișă, completată de la zero",
      },
    ],
  },
  {
    title: "Stoc",
    items: [
      {
        href: "/inventar",
        label: "Inventar",
        icon: "boxes",
        description: "Toate produsele, cu loturi și mișcări",
      },
      {
        href: "/iesiri",
        label: "Ieșiri materiale",
        icon: "truck",
        description: "Eliberare de materiale către un proiect",
      },
      {
        href: "/comenzi",
        label: "Comenzi",
        icon: "orders",
        description: "Intrări și ieșiri, cu istoricul stărilor",
      },
    ],
  },
  {
    title: "Configurare",
    items: [
      {
        href: "/memento",
        label: "Memento stoc",
        icon: "bell",
        description: "Praguri per produs și alerte declanșate",
      },
      {
        href: "/setari",
        label: "Setări",
        icon: "settings",
        description: "Categorii și unități de măsură",
      },
    ],
  },
];

/** Lista plata a rutelor, folosita de verificarea din RC-11. */
export const ALL_ROUTES: string[] = NAV.flatMap((g) => g.items.map((i) => i.href));

/** Eticheta ecranului curent, pentru titlul din bara de sus. */
export function labelForPath(pathname: string): string {
  for (const g of NAV) {
    for (const i of g.items) {
      if (i.href === "/" ? pathname === "/" : pathname.startsWith(i.href)) return i.label;
    }
  }
  return "Rapid Construct";
}
