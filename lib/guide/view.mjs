// P3-321. Ce arata paginile /ajutor, calculat din sursa ghidului (content/guide) si din
// pozele din public/guide. Nicio pagina nu tine o lista proprie de lectii: totul vine de
// aici, iar aici totul vine din loadGuide (lib/guide/source.mjs).
//
// Fisier .mjs, fara React si fara Next, din acelasi motiv ca source.mjs: il importa si
// paginile, si testul Playwright, si scripturile de verificare. Nu citeste nicio baza de
// date si nu tine nimic minte: o cerere, o citire.

import { closeSync, openSync, readSync } from "node:fs";
import { join } from "node:path";

export const GUIDE_BASE = "/ajutor";

/** Adresa paginii unei lectii. */
export function lessonHref(id) {
  return `${GUIDE_BASE}/${id}`;
}

/**
 * Ghidul asa cum il vede un rol: capitolele in ordinea lor, in fiecare lectiile in
 * ordinea lor, numai cele care au rolul in `roles`. Un capitol fara nicio lectie
 * pentru acest rol nu apare. Un rol necunoscut nu vede nimic.
 *
 * `flat` este aceeasi lista pe un singur sir, in ordinea in care o citeste cursantul:
 * de aici vine "următoarea lecție", care trece de la un capitol la altul.
 */
export function guideForRole(guide, role) {
  const chapters = [...guide.chapters]
    .sort((a, b) => a.order - b.order)
    .map((c) => ({
      id: c.id,
      title: c.title,
      summary: c.summary,
      lessons: guide.lessons
        .filter((l) => l.chapter === c.id && Array.isArray(l.roles) && l.roles.includes(role))
        .sort((a, b) => a.order - b.order),
    }))
    .filter((c) => c.lessons.length > 0);
  const flat = chapters.flatMap((c) =>
    c.lessons.map((lesson, i) => ({
      lesson,
      chapterId: c.id,
      chapterTitle: c.title,
      position: i + 1,
      inChapter: c.lessons.length,
    })),
  );
  return { chapters, flat };
}

/** Lectia `id` din lista plata a rolului, cu cea dinainte si cea de dupa, sau null daca rolul nu o vede. */
export function findInFlat(flat, id) {
  const i = flat.findIndex((entry) => entry.lesson.id === id);
  if (i === -1) return null;
  return { entry: flat[i], previous: flat[i - 1] ?? null, next: flat[i + 1] ?? null };
}

/** Un pas, rupt in bucati: textul dintre ** este eticheta de pe ecran si se scrie ingrosat. */
export function splitBold(step) {
  const parts = [];
  let last = 0;
  for (const m of String(step).matchAll(/\*\*([^*]+)\*\*/g)) {
    if (m.index > last) parts.push({ text: step.slice(last, m.index), bold: false });
    parts.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < step.length) parts.push({ text: step.slice(last), bold: false });
  return parts;
}

/** Latimea si inaltimea unui PNG, citite din antetul lui (primii 24 de octeti), sau null daca fisierul lipseste sau nu e PNG. */
export function readPngSize(file) {
  let fd;
  try {
    fd = openSync(file, "r");
    const head = Buffer.alloc(24);
    const read = readSync(fd, head, 0, 24, 0);
    if (read < 24) return null;
    if (head.readUInt32BE(0) !== 0x89504e47 || head.readUInt32BE(4) !== 0x0d0a1a0a) return null;
    const width = head.readUInt32BE(16);
    const height = head.readUInt32BE(20);
    return width > 0 && height > 0 ? { width, height } : null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * Pozele unei lectii care exista pe disc: public/guide/<id>-desktop.png si <id>-mobile.png.
 * O poza care nu exista (lectia nu are `screen`, sau scriptul nu a ajuns la ea) este null,
 * iar pagina arata cardul "fără imagine". NICIODATA o adresa de imagine care nu duce nicaieri.
 */
export function lessonPictures(lesson, publicGuideDir) {
  const id = Array.isArray(lesson.screenshots) ? lesson.screenshots[0] : undefined;
  const none = { desktop: null, mobile: null };
  if (typeof id !== "string" || id === "") return none;
  const one = (size) => {
    const dims = readPngSize(join(publicGuideDir, `${id}-${size}.png`));
    return dims ? { src: `/guide/${id}-${size}.png`, ...dims } : null;
  };
  return { desktop: one("desktop"), mobile: one("mobile") };
}
