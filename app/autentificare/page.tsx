import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Autentificare - Rapid Construct",
};

// Ecranul de autentificare. Nu exista pagina de inregistrare si nu exista
// resetare de parola: conturile se creeaza de catre administrator in panoul
// Supabase. O ruta publica de inregistrare intr-un instrument intern de depozit
// este o cale de intrare pentru straini, nu o functionalitate.
export default function AutentificarePage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-rc-black text-rc-white">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center rounded-xl bg-rc-white px-5 py-3 mb-6">
            <span className="text-rc-black font-semibold tracking-tight text-lg">
              Rapid Construct
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Autentificare
          </h1>
          <p className="mt-2 text-sm text-rc-muted-2">
            Introdu datele contului pentru a intra în sistemul de inventar.
          </p>
        </div>

        <LoginForm />

        <p className="mt-8 text-center text-xs text-rc-muted">
          Conturile sunt create de administrator. Dacă nu poți intra, contactează-l.
        </p>
      </div>
    </div>
  );
}
