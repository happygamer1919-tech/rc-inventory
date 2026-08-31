// Rutele numite o singura data, ca middleware-ul, layout-ul si testele sa nu
// tina fiecare propriul sir de caractere. Un literal repetat in trei locuri este
// un literal care se schimba in doua.

export const LOGIN_PATH = "/autentificare";
export const FORBIDDEN_PATH = "/acces-interzis";
// CRIT-17. Contul s-a autentificat si nu are rand activ in profiles. Nu este
// acelasi lucru cu FORBIDDEN_PATH: acela inseamna "ai rol, dar nu acesta",
// acesta inseamna "nu ai niciun rol".
export const NO_PROFILE_PATH = "/cont-fara-acces";

/** Rute pe care le poate deschide numai rolul owner. */
export const OWNER_ONLY_PREFIXES = ["/setari"] as const;
