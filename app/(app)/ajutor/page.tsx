// P3-321. Suport și Ghid: ghidul platformei, capitol cu capitol.
//
// FARA INTRARE IN MENIU. Legatura din meniu este ultimul pull request al seriei (task 325),
// ca nimic sa nu se vada utilizatorilor pana nu e gata tot ghidul. Pagina se deschide numai
// scriind adresa /ajutor.
//
// TOT CE SE VEDE VINE DIN content/guide, filtrat pe rolul contului: administratorul vede
// toate lectiile, operatorul numai pe ale lui. Nu se retine cine a citit ce: fara cookie,
// fara tabela, fara urmarire.

import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardHeader, Chip, EmptyState, PageHeader } from "@/components/ui/primitives";
import { plural } from "@/lib/data/format";
import { readGuideFor } from "@/lib/guide/read";
import { lessonHref } from "@/lib/guide/view.mjs";
import { getSessionUser } from "@/lib/supabase/server";
import { ROLE_LABEL } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Suport și Ghid - Rapid Construct",
};

export default async function AjutorPage() {
  const user = await getSessionUser();
  const { chapters, flat } = readGuideFor(user?.role);
  const first = flat[0] ?? null;

  return (
    <div data-testid="ajutor">
      <PageHeader title="Suport și Ghid" lead="Cum faci fiecare lucru în platformă, pas cu pas." />

      <section aria-labelledby="ghidul-platformei">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="max-md:min-w-0">
            <h2 id="ghidul-platformei" className="text-[18px] font-bold tracking-tight text-white">
              Ghidul platformei
            </h2>
            <p className="mt-1 text-[13.5px] text-rc-muted-2" data-testid="guide-count">
              {plural(flat.length, "lecție", "lecții")} în {plural(chapters.length, "capitol", "capitole")}, în
              ordinea în care se citesc.
            </p>
          </div>
          {first ? (
            <Link
              href={lessonHref(first.lesson.id)}
              data-testid="guide-start"
              className="inline-flex items-center justify-center rounded-[10px] bg-rc-orange-button px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-rc-orange-button-hover max-md:min-h-11"
            >
              Începe cu prima lecție
            </Link>
          ) : null}
        </div>

        {chapters.length === 0 ? (
          <Card>
            <EmptyState title="Ghidul nu are încă lecții" hint="Revino în curând." />
          </Card>
        ) : (
          <ol className="grid gap-5 md:grid-cols-2">
            {chapters.map((chapter) => (
              <li key={chapter.id} data-testid="guide-chapter" data-chapter={chapter.id} className="min-w-0">
                <Card className="h-full">
                  <CardHeader title={chapter.title} hint={chapter.summary} />
                  <ol className="divide-y divide-rc-line">
                    {chapter.lessons.map((lesson, i) => {
                      const ownerOnly = lesson.roles.length === 1 && lesson.roles[0] === "owner";
                      return (
                        <li key={lesson.id}>
                          <Link
                            href={lessonHref(lesson.id)}
                            data-testid="guide-lesson-link"
                            data-lesson={lesson.id}
                            className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-rc-paper max-md:min-h-11 max-md:items-center max-md:px-4"
                          >
                            <span className="rc-num mt-px w-5 shrink-0 text-[12.5px] font-semibold text-rc-muted max-md:mt-0">
                              {i + 1}
                            </span>
                            <span
                              data-testid="guide-lesson-title"
                              className="min-w-0 flex-1 text-[14px] font-medium text-rc-black [overflow-wrap:anywhere]"
                            >
                              {lesson.title}
                            </span>
                            {/* Administratorul vede toate lectiile si trebuie sa stie care sunt numai ale lui. */}
                            {user?.role === "owner" && ownerOnly ? (
                              <Chip tone="neutral" className="shrink-0">
                                {ROLE_LABEL.owner}
                              </Chip>
                            ) : null}
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
