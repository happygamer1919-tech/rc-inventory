import type { GuideFlatEntry } from "./view.mjs";

export type FaqEntry = { lesson: string; question: string; answer: string };
export type Faq = { id: string | null; title: string | null; entries: FaqEntry[]; problems: string[] };
export type FaqView = FaqEntry & { lessonTitle: string };

export function parseFaqEntry(raw: unknown): FaqEntry | null;
export function loadFaq(file: string): Faq;
export function faqForRole(faq: Faq, flat: GuideFlatEntry[]): FaqView[];
