"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { NAV, pathMatches, type NavItem } from "@/lib/nav";
import { Icon } from "@/components/ui/Icon";

// P3-46. O intrare este activa si pe rutele care tin de ea: CRM ramane marcat pe
// /clienti si pe /proiecte, care nu mai au intrare proprie in meniu.
function isActive(pathname: string, item: NavItem) {
  return [item.href, ...(item.activeFor ?? [])].some((href) => pathMatches(pathname, href));
}

// P3-60. SERTARUL DE PE TELEFON.
//
// Sub 768px meniul lateral nu mai incape langa continut, asa ca sta ascuns si se
// deschide din butonul din bara de sus. Starea deschis/inchis traieste aici, la
// nivel de modul, si nu intr-un provider: butonul (Topbar) si sertarul (Sidebar)
// sunt frati in layout, iar un provider ar insemna inca un invelis in
// app/(app)/layout.tsx doar pentru un boolean. Peste 768px starea nu schimba
// nimic: toate clasele sertarului au prefixul max-md.
const SIDEBAR_ID = "rc-sidebar";

let drawerOpen = false;
let opener: HTMLElement | null = null;
const listeners = new Set<() => void>();

function setDrawerOpen(next: boolean) {
  if (drawerOpen === next) return;
  drawerOpen = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function useDrawerOpen() {
  return useSyncExternalStore(
    subscribe,
    () => drawerOpen,
    () => false,
  );
}

/** Inchide sertarul si, daca focusul era in el, il intoarce pe butonul care l-a deschis. */
function closeDrawer() {
  if (!drawerOpen) return;
  const focusWasInside = document.getElementById(SIDEBAR_ID)?.contains(document.activeElement);
  setDrawerOpen(false);
  if (focusWasInside && opener?.isConnected) opener.focus();
}

/** Butonul din bara de sus care deschide sertarul. Exista doar sub 768px. */
export function SidebarMenuButton() {
  const open = useDrawerOpen();

  // Fara niciun <span> inauntru: crm-landing.spec citeste titlul barei de sus ca
  // primul span din <header>, iar butonul sta inaintea titlului.
  return (
    <button
      type="button"
      aria-label="Deschide meniul"
      aria-controls={SIDEBAR_ID}
      aria-expanded={open}
      data-testid="sidebar-open"
      onClick={(event) => {
        opener = event.currentTarget;
        setDrawerOpen(true);
      }}
      className="md:hidden -ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-md text-rc-muted-2 transition-colors hover:bg-white/5 hover:text-white"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const open = useDrawerOpen();
  const closeRef = useRef<HTMLButtonElement>(null);

  // O legatura apasata in sertar schimba ruta: sertarul se inchide singur.
  useEffect(() => {
    closeDrawer();
  }, [pathname]);

  // Deschis: focusul intra in sertar, iar Escape il inchide.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeDrawer();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      {open ? (
        <div
          aria-hidden="true"
          data-testid="sidebar-backdrop"
          onClick={closeDrawer}
          className="md:hidden fixed inset-0 z-40 bg-black/60"
        />
      ) : null}
      <aside
        id={SIDEBAR_ID}
        className={[
          "w-[248px] shrink-0 bg-rc-ink border-r border-white/10 flex flex-col",
          open
            ? "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:max-w-[85vw] max-md:shadow-2xl"
            : "max-md:hidden",
        ].join(" ")}
      >
        {/* Inchiderea sta in afara lui <nav>: crm-landing.spec numara legaturile
            meniului ca `aside nav a`. */}
        <div className="md:hidden flex justify-end px-2 pt-2">
          <button
            ref={closeRef}
            type="button"
            aria-label="Închide meniul"
            data-testid="sidebar-close"
            onClick={closeDrawer}
            className="grid h-11 w-11 place-items-center rounded-md text-rc-muted-2 transition-colors hover:bg-white/5 hover:text-white"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Logoul are fundal alb opac, fara canal alfa, asa ca primeste propria
            placa alba. Asa arata intentionat, nu ca o imagine lipita pe negru. */}
        <div className="p-4 border-b border-white/10">
          <Link href="/" className="block rounded-[10px] bg-white px-3.5 py-3">
            <Image
              src="/brand/rapid-construct-logo.png"
              alt="Rapid Construct"
              width={752}
              height={331}
              priority
              className="w-full h-auto"
            />
          </Link>
          <p className="mt-2.5 text-[11px] uppercase tracking-[0.14em] text-rc-muted-2 text-center">
            Gestiune inventar
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          {NAV.map((group) => (
            <div key={group.title} className="mb-5">
              <p className="px-5 mb-2 text-[10.5px] font-bold uppercase tracking-[0.13em] text-rc-muted">
                {group.title}
              </p>
              <ul className="px-2.5 space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(pathname, item);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={item.description}
                        aria-current={active ? "page" : undefined}
                        className={[
                          "group relative flex items-center gap-2.5 rounded-[9px] px-3 py-2 text-[13.5px] font-medium transition-colors max-md:min-h-11",
                          active
                            ? "bg-rc-orange/12 text-rc-orange"
                            : "text-rc-muted-2 hover:bg-white/5 hover:text-white",
                        ].join(" ")}
                      >
                        {active ? (
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-rc-orange" />
                        ) : null}
                        <Icon name={item.icon} />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

      </aside>
    </>
  );
}
