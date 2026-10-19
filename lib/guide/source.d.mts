export const GUIDE_ROLES: string[];
export const MAX_WORDS: number;
export const MAX_STEPS: number;
export const MAX_SEE_ALSO: number;

export type GuideRecord = { file: string; dir: string; [key: string]: any };

export type Guide = {
  chapters: GuideRecord[];
  lessons: GuideRecord[];
  problems: string[];
};

export function parseFrontMatter(text: string, file?: string): { data: Record<string, any>; body: string };
export function countWords(text: string): number;
export function labelsOf(step: string): string[];
export function loadGuide(root: string): Guide;
export function visibleText(lesson: GuideRecord, titleOf: (id: string) => string | undefined): string;
export function validateGuide(guide: Guide, ctx: { navGroups: string[]; sourceText?: string }): string[];
export function navGroupTitles(repoRoot: string): string[];
export function readAppSourceText(repoRoot: string): string;
