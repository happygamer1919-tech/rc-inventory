// Tipurile partajate de autentificare. Rolurile vin din enumul app_role al
// migratiei 0001 si sunt exact doua: owner si account_manager.
//
// Valorile stocate sunt tokenuri englezesti, etichetele afisate sunt romanesti.
// Regula este cea din P2-01: o valoare de enum nu este text de interfata.

export type AppRole = "owner" | "account_manager";

/** Eticheta romaneasca a rolului, folosita in interfata. */
export const ROLE_LABEL: Record<AppRole, string> = {
  owner: "Administrator",
  account_manager: "Operator",
};

/** Randul din public.profiles, doar campurile de care are nevoie sesiunea. */
export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AppRole;
  active: boolean;
};

/** Utilizatorul autentificat asa cum il vede aplicatia. */
export type SessionUser = {
  id: string;
  email: string | null;
  role: AppRole;
  fullName: string | null;
};
