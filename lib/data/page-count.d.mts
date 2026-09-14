// Tipurile pentru page-count.mjs. Vezi comentariul din capul acelui fisier
// pentru motivul pentru care logica traieste in JavaScript simplu.

export declare const DOCUMENT_PAGE_LIMIT: 100;

export declare function isTooManyPages(pageCount: number | null): boolean;

export declare function countPages(
  bytes: ArrayBuffer | Uint8Array,
  mimeType: string,
): number | null;
