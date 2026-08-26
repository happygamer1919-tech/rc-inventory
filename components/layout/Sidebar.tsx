"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";
import { Icon } from "@/components/ui/Icon";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[248px] shrink-0 bg-rc-ink border-r border-white/10 flex flex-col">
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
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={item.description}
                      aria-current={active ? "page" : undefined}
                      className={[
                        "group relative flex items-center gap-2.5 rounded-[9px] px-3 py-2 text-[13.5px] font-medium transition-colors",
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
  );
}
