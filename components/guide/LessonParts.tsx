import { pictureView, splitBold } from "@/lib/guide/view.mjs";
import type { GuidePicture } from "@/lib/guide/view.mjs";

// P3-321. Bucatile paginii unei lectii. Fara stare si fara cod de browser: tot ce se vede
// aici vine din sursa ghidului (lib/guide/read.ts), nimic nu se scrie a doua oara.

/** Un text cu etichetele dintre ** ingrosate, exact cum scrie pe ecran. Fara HTML din sursa. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {splitBold(text).map((part, i) =>
        part.bold ? (
          <strong key={i} className="font-semibold text-rc-black">
            {part.text}
          </strong>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

/** Pasii, numerotati ca marcajele de pe poza. Numarul este pus de pagina, nu scris in sursa. */
export function LessonSteps({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-3" data-testid="lesson-steps">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-3" data-testid="lesson-step">
          <span
            aria-hidden="true"
            className="rc-num mt-px grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rc-orange-button text-[12px] font-bold text-white"
          >
            {i + 1}
          </span>
          <span className="min-w-0 text-[14.5px] leading-6 text-rc-black [overflow-wrap:anywhere]">
            <RichText text={step} />
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Poza lectiei: cea de telefon sub 768px, cea de desktop de la 768px in sus. Daca poza nu
 * exista pe disc, in locul ei sta cardul "fără imagine" si nu se scrie niciun <img>:
 * niciodata o imagine stricata. Ce se alege, in functie de ce poze exista, decide
 * pictureView (lib/guide/view.mjs).
 */
export function LessonPicture({
  title,
  desktop,
  mobile,
}: {
  title: string;
  desktop: GuidePicture | null;
  mobile: GuidePicture | null;
}) {
  const view = pictureView({ desktop, mobile });
  if (view.kind === "none") {
    return (
      <div
        data-testid="lesson-no-picture"
        className="grid place-items-center rounded-[12px] border border-dashed border-rc-line-strong bg-rc-paper px-4 py-10 text-[13px] font-medium text-rc-muted"
      >
        fără imagine
      </div>
    );
  }
  const alt = `Captură de ecran cu pașii lecției: ${title}`;
  // Un <img> simplu si nu next/image, ca in ProductPanel: pozele sunt fisiere statice
  // gata taiate la marimea lor, iar optimizatorul ar scrie a doua copie a fiecareia.
  // Latimea si inaltimea sunt cele din fisier, ca pagina sa nu sara cand se incarca poza.
  if (view.kind === "phone") {
    // Lectie numai pentru telefon: poza ei are 390px latime, deci nu se intinde pe desktop.
    return (
      <figure data-testid="lesson-picture" className="mx-auto max-w-[390px]">
        <img
          src={view.mobile.src}
          width={view.mobile.width}
          height={view.mobile.height}
          alt={alt}
          loading="lazy"
          className="block h-auto w-full rounded-[10px] border border-rc-line"
        />
      </figure>
    );
  }
  return (
    <figure data-testid="lesson-picture">
      <picture>
        {view.kind === "both" ? <source media="(max-width: 767px)" srcSet={view.mobile.src} /> : null}
        <img
          src={view.desktop.src}
          width={view.desktop.width}
          height={view.desktop.height}
          alt={alt}
          loading="lazy"
          className="block h-auto w-full rounded-[10px] border border-rc-line max-md:mx-auto max-md:max-w-[390px]"
        />
      </picture>
    </figure>
  );
}
