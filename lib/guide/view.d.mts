import type { Guide, GuideRecord } from "./source.mjs";

export const GUIDE_BASE: string;
export function lessonHref(id: string): string;

export type GuideChapterView = { id: string; title: string; summary: string; lessons: GuideRecord[] };
export type GuideFlatEntry = {
  lesson: GuideRecord;
  chapterId: string;
  chapterTitle: string;
  /** Locul lectiei in capitolul ei, de la 1. */
  position: number;
  /** Cate lectii are capitolul pentru acest rol. */
  inChapter: number;
};

export function guideForRole(guide: Guide, role: string): { chapters: GuideChapterView[]; flat: GuideFlatEntry[] };
export function findInFlat(
  flat: GuideFlatEntry[],
  id: string,
): { entry: GuideFlatEntry; previous: GuideFlatEntry | null; next: GuideFlatEntry | null } | null;
export function splitBold(step: string): Array<{ text: string; bold: boolean }>;
export function readPngSize(file: string): { width: number; height: number } | null;

export type GuidePicture = { src: string; width: number; height: number };
export function lessonPictures(
  lesson: GuideRecord,
  publicGuideDir: string,
): { desktop: GuidePicture | null; mobile: GuidePicture | null };
