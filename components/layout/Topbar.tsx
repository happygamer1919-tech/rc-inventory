"use client";

import { usePathname } from "next/navigation";
import { labelForPath } from "@/lib/nav";
import { ROLE_LABEL, type SessionUser } from "@/lib/supabase/types";
import { SignOutButton } from "@/components/auth/SignOutButton";

// Bara de sus. In faza 1 arata un rol fix, "Operator", scris in cod. Acum arata
// rolul real al contului conectat, primit din layout, care l-a citit o singura
// data pe cerere.
export function Topbar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const initials = initialsFor(user);

  return (
    <header className="h-[58px] shrink-0 border-b border-white/10 bg-rc-ink/60 backdrop-blur flex items-center justify-between px-8">
      <div className="flex items-center gap-3">
        <span className="text-[13.5px] font-semibold text-white">{labelForPath(pathname)}</span>
        <span className="text-rc-muted">/</span>
        <span className="text-[13px] text-rc-muted">Rapid Construct</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-[12px] text-rc-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-rc-ok" />
          Depozit central
        </span>
        <span className="w-px h-5 bg-white/10" />
        <span className="text-[12.5px] text-rc-muted-2" data-testid="topbar-role">
          {ROLE_LABEL[user.role]}
        </span>
        <span
          className="w-7 h-7 rounded-full bg-rc-orange text-white grid place-items-center text-[12px] font-bold"
          title={user.email ?? undefined}
          data-testid="topbar-avatar"
        >
          {initials}
        </span>
        <SignOutButton />
      </div>
    </header>
  );
}

function initialsFor(user: SessionUser): string {
  const source = user.fullName?.trim() || user.email?.trim() || "";
  if (source.length === 0) return "RC";
  const parts = source.replace(/@.*$/, "").split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "RC";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}
