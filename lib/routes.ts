// Rutele numite o singura data, ca middleware-ul, layout-ul si testele sa nu
// tina fiecare propriul sir de caractere. Un literal repetat in trei locuri este
// un literal care se schimba in doua.

export const LOGIN_PATH = "/autentificare";
export const FORBIDDEN_PATH = "/acces-interzis";
export const HOME_PATH = "/";

/** Rute pe care le poate deschide numai rolul owner. */
export const OWNER_ONLY_PREFIXES = ["/setari"] as const;
