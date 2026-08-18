"use client";

import { usePathname } from "next/navigation";
import { labelForPath } from "@/lib/nav";

export function Topbar() {
  const pathname = usePathname();

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
        <span className="text-[12.5px] text-rc-muted-2">Operator</span>
        <span className="w-7 h-7 rounded-full bg-rc-orange text-white grid place-items-center text-[12px] font-bold">
          RC
        </span>
      </div>
    </header>
  );
}
