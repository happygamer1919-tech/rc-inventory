// P3-321. O lectie din ghid: titlul, pasii numerotati, o poza, "Vezi și" si, la sfarsit,
// "Următoarea lecție". Fara intrare in meniu (task 325).
//
// O LECTIE CARE NU E A ROLULUI NU EXISTA PENTRU EL. Operatorul care scrie adresa unei lectii
// numai pentru administrator primeste aceeasi pagina "nu există" ca la o adresa gresita,
// nu un refuz care ar confirma ca lectia exista.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LessonPicture, LessonSteps, RichText } from "@/components/guide/LessonParts";
import { PHONE_LINK } from "@/components/ui/phone";
import { Card, PageHeader } from "@/components/ui/primitives";
import { GUIDE_IMAGES_DIR, readGuideFor } from "@/lib/guide/read";
import { GUIDE_BASE, findInFlat, lessonHref, lessonPictures } from "@/lib/guide/view.mjs";
import { getSessionUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { lectie: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { lectie } = await params;
  const user = await getSessionUser();
  const found = findInFlat(readGuideFor(user?.role).flat, lectie);
  return { title: `${found ? found.entry.lesson.title : "Suport și Ghid"} - Rapid Construct` };
}

export default async function LessonPage({ params }: { params: Promise<Params> }) {
  const { lectie } = await params;
  const user = await getSessionUser();
  const { flat } = readGuideFor(user?.role);
  const found = findInFlat(flat, lectie);
  if (!found) notFound();

  const { entry, next } = found;
  const { lesson } = entry;
  const pictures = lessonPictures(lesson, GUIDE_IMAGES_DIR);
  const notes = String(lesson.body ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p !== "");

  // Legaturile "Vezi și" duc numai la lectii pe care rolul le vede, ca nicio legatura sa nu dea 404.
  const seeAlso = (Array.isArray(lesson.see_also) ? (lesson.see_also as string[]) : [])
    .map((id) => findInFlat(flat, id)?.entry.lesson)
    .filter((l): l is NonNullable<typeof l> => l !== undefined);

  return (
    <div data-testid="lesson-page" data-lesson={lesson.id} className="max-w-[880px]">
      <nav aria-label="Unde ești" className="mb-3 flex flex-wrap items-center gap-x-2 text-[13px] text-rc-muted-2">
        <Link href={GUIDE_BASE} data-testid="lesson-back" className={`hover:text-white ${PHONE_LINK}`}>
          Suport și Ghid
        </Link>
        <span aria-hidden="true">/</span>
        <span>{entry.chapterTitle}</span>
      </nav>

      <PageHeader title={lesson.title} lead={`Lecția ${entry.position} din ${entry.inChapter}, capitolul ${entry.chapterTitle}.`} />

      <Card>
        <div className="space-y-6 px-5 py-5 max-md:px-4">
          <LessonSteps steps={lesson.steps} />

          {notes.map((note, i) => (
            <p
              key={i}
              data-testid="lesson-note"
              className="rounded-[10px] bg-rc-orange-soft px-4 py-3 text-[13.5px] leading-6 text-rc-black [overflow-wrap:anywhere]"
            >
              <RichText text={note} />
            </p>
          ))}

          <LessonPicture title={lesson.title} desktop={pictures.desktop} mobile={pictures.mobile} />

          {seeAlso.length > 0 ? (
            <div
              data-testid="lesson-see-also"
              className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-rc-line pt-4 text-[13.5px]"
            >
              <span className="font-semibold text-rc-black">Vezi și:</span>
              {seeAlso.map((other) => (
                <Link
                  key={other.id}
                  href={lessonHref(other.id)}
                  data-see-also={other.id}
                  className={`text-rc-info underline underline-offset-2 hover:text-rc-black ${PHONE_LINK}`}
                >
                  {other.title}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </Card>

      {next ? (
        <Link
          href={lessonHref(next.lesson.id)}
          data-testid="lesson-next"
          data-next={next.lesson.id}
          className="mt-5 flex items-center justify-between gap-4 rounded-[14px] bg-rc-orange-button px-5 py-4 text-white transition-colors hover:bg-rc-orange-button-hover max-md:px-4"
        >
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold uppercase tracking-wide">Următoarea lecție</span>
            <span className="mt-0.5 block text-[15px] font-semibold [overflow-wrap:anywhere]">{next.lesson.title}</span>
            {next.chapterId !== entry.chapterId ? (
              <span className="mt-0.5 block text-[12.5px]">Capitolul următor: {next.chapterTitle}</span>
            ) : null}
          </span>
          <span aria-hidden="true" className="shrink-0 text-[20px]">
            →
          </span>
        </Link>
      ) : (
        <div
          data-testid="lesson-end"
          className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-white/10 px-5 py-4 max-md:px-4"
        >
          <p className="text-[14px] font-semibold text-white">Aceasta a fost ultima lecție.</p>
          <Link
            href={GUIDE_BASE}
            className="inline-flex items-center justify-center rounded-[10px] bg-rc-white px-4 py-2.5 text-[14px] font-semibold text-rc-black transition-colors hover:bg-rc-paper max-md:min-h-11"
          >
            Înapoi la Suport și Ghid
          </Link>
        </div>
      )}
    </div>
  );
}
