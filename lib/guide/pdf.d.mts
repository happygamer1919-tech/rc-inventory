export const PDF_FILE: string;
export function guideSourceHash(): string;
export function hashFiles(root: string, files: string[]): string;
export function readPdfSourceHash(file?: string): string | null;
export function buildGuidePdf(outFile?: string): Promise<string>;
