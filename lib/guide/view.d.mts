import type { Guide, GuideRecord } from "./source.mjs";

export const GUIDE_BASE: string;
export function lessonHref(id: string): string;
export const GUIDE_IMAGE_BASE: string;
export const GUIDE_PDF_HREF: string;
export const GUIDE_IMAGE_NAME: RegExp;

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
export type PictureView =
  | { kind: "none" }
  | { kind: "phone"; mobile: GuidePicture }
  | { kind: "desktop"; desktop: GuidePicture }
  | { kind: "both"; desktop: GuidePicture; mobile: GuidePicture };
export function pictureView(pictures: { desktop: GuidePicture | null; mobile: GuidePicture | null }): PictureView;
export function lessonPictures(
  lesson: Record<string, any>,
  publicGuideDir: string,
): { desktop: GuidePicture | null; mobile: GuidePicture | null };
