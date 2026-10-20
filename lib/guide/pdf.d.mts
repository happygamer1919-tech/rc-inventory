export const PDF_FILE: string;
export function guideSourceHash(role?: string): string;
export function hashFiles(root: string, files: string[]): string;
export function readPdfSourceHash(file?: string): string | null;
export function lessonIdsForRole(role: string): string[];
export function renderGuidePdf(role: string): Promise<{ pdf: Buffer; hash: string }>;
export function buildGuidePdf(outFile?: string, role?: string): Promise<string>;
