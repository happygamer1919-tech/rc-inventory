// Eticheta etapei unui client, cu culoarea ALATURI de ea. Cardul P3-43.
//
// Mutata aici din ClientDetailScreen de cardul P3-45, fiindca lista Leaduri si
// cipurile ei o deseneaza si ele, iar trei copii ale aceleiasi etichete sunt trei
// locuri in care culoarea poate sa se abata de la eticheta.
//
// Culoarea stă langa eticheta si niciodata in locul ei: cine nu deosebeste rosul
// de verde citeste tot eticheta. Tokenul brut nu ajunge pe ecran; `data-colour`
// este un atribut, nu text.

import {
  CLIENT_STAGE_COLOUR,
  CLIENT_STAGE_LABEL,
  type ClientStage,
} from "@/lib/data/clients-types";

export function StageMark({
  stage,
  testId = "client-stage",
  colourTestId = "client-stage-colour",
  labelTestId = "client-stage-label",
  labelClassName = "text-[13.5px] text-rc-black",
}: {
  stage: ClientStage;
  /** Id-urile de test implicite sunt cele ale fisei clientului, din P3-43. */
  testId?: string;
  colourTestId?: string;
  labelTestId?: string;
  labelClassName?: string;
}) {
  const colour = CLIENT_STAGE_COLOUR[stage];
  return (
    <span className="inline-flex items-center gap-2" data-testid={testId}>
      <span
        aria-hidden="true"
        data-testid={colourTestId}
        data-colour={colour.name}
        className={`inline-block w-2.5 h-2.5 rounded-full ${colour.className}`}
      />
      <span data-testid={labelTestId} className={labelClassName}>
        {CLIENT_STAGE_LABEL[stage]}
      </span>
    </span>
  );
}
