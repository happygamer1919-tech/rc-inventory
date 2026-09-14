// Tipurile pentru pdf-builder.mjs. Vezi comentariul din capul acelui fisier.

export declare function buildPdf(
  pageCount: number,
  options?: {
    objectStreams?: boolean;
    tree?: number[];
    packIntermediates?: boolean;
    incrementalTo?: number;
  },
): Buffer;
