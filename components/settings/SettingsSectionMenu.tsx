// P3-113, goal G69 partea 2. SUB-MENIUL SECTIUNILOR DE PE /setari.
//
// ACEEASI BANDA CA FILELE DE PE FISA CLIENTULUI, cuvant cu cuvant aceleasi clase
// (components/clients/ClientTabs.tsx). Raportul de proiectare a cerut "un sub-meniu de
// secțiuni" si a recomandat explicit mecanismul care exista deja in RC, in loc de o
// coloana laterala nou inventata: un al doilea fel de a arata acelasi lucru ar fi
// insemnat doua lucruri de invatat pentru acelasi gest.
//
// LEGATURI, NU BUTOANE, si asta este singura diferenta fata de ClientTabs. Filele de
// acolo impinge ruta din client (`router.push`), aici fiecare secțiune ARE adresa ei si
// o legatura este adresa aceea: se deschide intr-o fila noua, se trimite pe chat, iar
// bararea de legaturi moarte din tests/e2e/headers.spec.ts o poate urma. Componenta
// ramane de server, deci nu adauga nici un gram de JavaScript in browser.
//
// PE TELEFON banda se rupe pe doua randuri si fiecare intrare are 44px. Numele de
// clase vin din components/ui/phone.ts si nu se scriu local: asta a curatat
// obiectivul G56, cardul P3-100.

import Link from "next/link";
import { PHONE_LINK, PHONE_TABS } from "@/components/ui/phone";
import {
  SETTINGS_SECTIONS,
  settingsSectionHref,
  type SettingsSectionId,
} from "@/lib/data/setari-sections";

export function SettingsSectionMenu({ active }: { active: SettingsSectionId }) {
  return (
    <nav
      aria-label="Secțiunile setărilor"
      data-testid="settings-sections"
      className={`flex gap-1 border-b border-rc-line mb-5 ${PHONE_TABS}`}
    >
      {SETTINGS_SECTIONS.map((s) => (
        <Link
          key={s.id}
          href={settingsSectionHref(s.id)}
          title={s.hint}
          data-testid={`settings-section-${s.id}`}
          data-active={active === s.id ? "true" : "false"}
          aria-current={active === s.id ? "page" : undefined}
          className={
            active === s.id
              ? `px-4 py-2.5 text-[13.5px] font-semibold text-rc-white border-b-2 border-rc-orange -mb-px ${PHONE_LINK}`
              : `px-4 py-2.5 text-[13.5px] text-rc-muted-2 hover:text-rc-white ${PHONE_LINK}`
          }
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
