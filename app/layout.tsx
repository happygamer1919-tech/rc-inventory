import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rapid Construct - Inventar",
  description: "Sistem de gestiune a inventarului.",
};

// Layout-ul radacina este deliberat gol: html, body si stilurile globale, atat.
//
// Invelisul aplicatiei (bara laterala, bara de sus, StoreProvider) s-a mutat in
// app/(app)/layout.tsx, pentru ca ecranul de autentificare NU trebuie sa il
// randeze. Un vizitator neautentificat care vede meniul si antetul cu zero date
// in ele citeste sistemul ca fiind stricat, iar cardul P2-02 cere explicit sa nu
// se randeze niciodata un invelis cu date goale.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ro">
      <body>{children}</body>
    </html>
  );
}
