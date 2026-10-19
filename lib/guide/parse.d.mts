import type { Guide } from "./source.mjs";

export function parseFrontMatter(text: string, file?: string): { data: Record<string, any>; body: string };
export function loadGuide(root: string): Guide;
