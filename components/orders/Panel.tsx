"use client";

// Invelisul panoului lateral. Extras din ecranul de comenzi al fazei 1 ca sa fie
// folosit si de intrari, si de iesiri, fara doua copii care apoi diverg.

import * as React from "react";

export function Panel({
  title,
  subtitle,
  chip,
  onClose,
  testId,
  children,
}: {
  title: string;
  subtitle: string;
  chip: React.ReactNode;
  onClose: () => void;
  testId?: string;
  children: React.ReactNode;
}) {
  // Inchidere cu Escape, ca panoul sa nu fie o capcana la tastatura.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      {/* text-rc-black este obligatoriu: body are culoarea alba, deci orice text
          fara clasa de culoare ar iesi alb pe alb in interiorul panoului. */}
      <aside
        className="relative w-[640px] h-full bg-rc-white text-rc-black overflow-y-auto shadow-2xl"
        data-testid={testId}
      >
        <div className="sticky top-0 bg-rc-white text-rc-black border-b border-rc-line px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h2 className="text-[17px] font-bold">{title}</h2>
              {chip}
            </div>
            <p className="text-[12.5px] text-rc-muted mt-1">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Închide"
            className="shrink-0 w-8 h-8 rounded-[9px] text-rc-muted hover:bg-rc-paper hover:text-rc-black transition-colors"
          >
            ✕
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}
