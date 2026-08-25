// Datele conturilor de test, citite din mediu si niciodata scrise in cod.
//
// Valorile stau in .env.local, care este ignorat de git. Un test care poarta o
// parola literala este o parola comisa in istoric pentru totdeauna.
//
// Conturile sunt de DEZVOLTARE, pe o baza de date fara date reale de client.
// Conturile reale se creeaza la P2-13, care le si retrage pe acestea.

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    throw new Error(
      `Variabila de mediu ${name} lipseste. Scrie .env.local inainte de a rula testele; vezi P2-02.`,
    );
  }
  return v.trim();
}

export type TestAccount = {
  email: string;
  password: string;
  label: string;
};

export function ownerAccount(): TestAccount {
  return {
    email: required("TEST_OWNER_EMAIL"),
    password: required("TEST_OWNER_PASSWORD"),
    label: "administrator",
  };
}

export function managerAccount(): TestAccount {
  return {
    email: required("TEST_MANAGER_EMAIL"),
    password: required("TEST_MANAGER_PASSWORD"),
    label: "operator",
  };
}
