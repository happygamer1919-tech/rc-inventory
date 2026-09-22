// Definitia unica a navigatiei. Toate ecranele din faza 1 sunt aici si numai ele.
// RC-10 cere ca nimic care nu poate fi construit in faza 1 sa nu apara in meniu,
// asa ca lista aceasta este si sursa verificarii de legaturi moarte.

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  description: string;
  /** P3-46. Alte rute care tin de aceasta intrare si o marcheaza activa in meniu. */
  activeFor?: string[];
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
  | "settings"
  // P3-06 si P3-07: grupul Relatii.
  | "clients"
  | "projects";

/**
 * P3-46. Ecranele la care se ajunge prin CRM si nu direct din meniu. Adresele lor
 * nu s-au schimbat si nicio ruta nu s-a mutat.
 *
 * STAU AICI, SI NU DOAR IN ECRANUL CRM, PENTRU CEI DOI CITITORI AI LISTEI DE
 * NAVIGATIE: titlul din bara de sus (labelForPath) si lista de rute pe care o
 * parcurge tests/e2e/headers.spec.ts (ALL_ROUTES). Scoase din NAV fara lista
 * aceasta, amandoua ar fi pierdut /clienti si /proiecte fara niciun semnal.
 */
export const CRM_SCREENS: NavItem[] = [
  {
    href: "/clienti",
    label: "Clienți",
    icon: "clients",
    description: "Beneficiarii, cu datele lor de contact și proiectele lor",
  },
  {
    href: "/proiecte",
    label: "Proiecte",
    icon: "projects",
    description: "Șantierele, cu stadiul lor și cu bugetul lor",
  },
];

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
    // P3-06 si P3-07. Grupul apare INAINTE de Stoc pentru ca de aici incepe
    // orice intrebare de-a proprietarului: cine, apoi ce santier, apoi ce
    // material. Meniul citeste in ordinea in care se pun intrebarile.
    //
    // P3-46. O SINGURA INTRARE, CRM, in locul lui Clienți si Proiecte. Deschide
    // ecranul cu cele trei carduri, iar pe listele de clienti si de proiecte ramane
    // marcata, fiindca ele tin de CRM.
    //
    // P3-91, goal G46. AZI ESTE PRIMA INTRARE A GRUPULUI, inaintea lui CRM: lista
    // celor de sunat azi este locul din care porneste ziua. Sta direct in NAV, nu
    // in CRM_SCREENS, fiindca are intrarea ei in meniu si nu se ajunge la ea prin
    // CRM; asa o citesc si labelForPath, si ALL_ROUTES.
    title: "Relații",
    items: [
      {
        href: "/azi",
        label: "Azi",
        icon: "bell",
        description: "Leadurile și clienții de sunat azi, cei întârziați primii",
      },
      {
        href: "/crm",
        label: "CRM",
        icon: "clients",
        description: "Clienți, leaduri și proiecte",
        activeFor: CRM_SCREENS.map((s) => s.href),
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
      // P3-18. Un RAPORT sub Stoc, nu un grup nou in navigatie: cardul o cere in
      // terminii aceia si ecranul raspunde la o intrebare despre stoc.
      {
        href: "/necesar",
        label: "Necesar de materiale",
        icon: "boxes",
        description: "Ce mai trebuie cumpărat pentru șantierele cu deviz acceptat",
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

/** Fiecare ecran cu nume: intrarile din meniu, apoi cele deschise prin CRM. */
const SCREENS: NavItem[] = [...NAV.flatMap((g) => g.items), ...CRM_SCREENS];

/** Lista plata a rutelor, folosita de verificarea din RC-11. */
export const ALL_ROUTES: string[] = SCREENS.map((i) => i.href);

/** Daca adresa curenta este ecranul de la `href` sau o ruta de sub el. */
export function pathMatches(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Eticheta ecranului curent, pentru titlul din bara de sus. */
export function labelForPath(pathname: string): string {
  for (const i of SCREENS) {
    if (pathMatches(pathname, i.href)) return i.label;
  }
  return "Rapid Construct";
}
