import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { StoreProvider } from "@/lib/store";
import { getSessionUser } from "@/lib/supabase/server";
import { LOGIN_PATH } from "@/lib/routes";

// Invelisul aplicatiei, pentru ecranele autentificate. Ecranul de autentificare
// este in afara acestui grup si nu il randeaza.
//
// Verificarea sesiunii de aici este a DOUA aparare, nu prima: middleware-ul deja
// a refuzat cererea neautentificata. Se pastreaza pentru ca un layout care isi
// presupune utilizatorul randeaza date goale in ziua in care matcher-ul din
// middleware se schimba gresit.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect(LOGIN_PATH);

  return (
    <StoreProvider>
      <div className="rc-shell flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Topbar user={user} />
          <main className="flex-1 overflow-y-auto px-8 py-7">{children}</main>
        </div>
      </div>
    </StoreProvider>
  );
}
