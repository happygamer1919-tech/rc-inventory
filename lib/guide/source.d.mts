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
export const FAQ_MIN: number;
export const FAQ_MAX: number;
export const FAQ_MAX_ANSWER_WORDS: number;
export function validateFaq(
  faq: { id: string | null; title: string | null; entries: Array<{ lesson: string; question: string; answer: string }>; problems: string[] },
  guide: Guide,
  ctx: { sourceText?: string },
): string[];
export function navGroupTitles(repoRoot: string): string[];
export function readAppSourceText(repoRoot: string): string;

// P3-320. Cheile pentru poze.
export const SHOT_ACCOUNTS: string[];
export const SHOT_SIZES: string[];
export const SHOT_PLACEHOLDERS: string[];
export type ShotMark = { step: number; selector: string };
export type ShotAction = { verb: "click" | "wait" | "fill" | "select"; selector: string; value: string | null };
export type ShotSpec = {
  id: string;
  lesson: string;
  screen: string;
  account: string;
  before: Array<ShotAction | null>;
  beforeMobile: Array<ShotAction | null>;
  sizes: string[];
  marks: Array<ShotMark | null>;
};
export function parseMark(raw: unknown): ShotMark | null;
export function parseAction(raw: unknown): ShotAction | null;
export function shotSpec(lesson: GuideRecord): ShotSpec | null;
export function shotProblems(lesson: GuideRecord): string[];
