// Tipurile, limita si mesajele imaginii de produs, fara nimic de server. Cardul P3-56.
//
// DE CE ESTE UN FISIER SEPARAT, acelasi motiv ca la documents-types.ts:
// product-actions.ts este "use server" si are voie sa exporte numai functii
// async. Tot ce citeste si formularul din browser, si serverul, traieste aici.
//
// RECUNOASTEREA CONTINUTULUI NU SE COPIAZA: semnaturile JPEG, PNG si WEBP sunt
// deja in documents-types.ts, pentru aceleasi trei tipuri din acelasi bucket.

export { SNIFF_BYTES, contentMatchesType } from "./documents-types";

/** 10 MB, limita cardului. Bucketul primeste pana la 20 MB (0044), deci limita aceasta o tine aplicatia. */
export const MAX_PRODUCT_IMAGE_BYTES = 10 * 1024 * 1024;

/** Extensia -> tipul canonic. jpg si jpeg sunt acelasi tip. */
export const PRODUCT_IMAGE_TYPES: Readonly<Record<string, string>> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export const PRODUCT_IMAGE_EXTENSIONS_LABEL = "JPG, JPEG, PNG, WEBP";

/** Atributul accept al campului de fisier. O curtoazie, nu o regula. */
export const PRODUCT_IMAGE_ACCEPT = Object.keys(PRODUCT_IMAGE_TYPES)
  .map((ext) => `.${ext}`)
  .join(",");

export const PRODUCT_IMAGE_MESSAGES = {
  wrongType: `Tipul imaginii nu este acceptat. Se acceptă doar ${PRODUCT_IMAGE_EXTENSIONS_LABEL}.`,
  tooLarge: "Imaginea depășește limita de 10 MB.",
  empty: "Fișierul imaginii este gol.",
  contentMismatch: `Conținutul fișierului nu este o imagine ${PRODUCT_IMAGE_EXTENSIONS_LABEL}.`,
  notActive: "Imaginile produselor nu sunt încă active. Încearcă din nou peste câteva minute.",
} as const;

/** Extensia acceptata a unui nume de fisier, cu litere mici, sau null. */
export function productImageExtension(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  // hasOwnProperty si nu `in`: "constructor" este `in` orice obiect.
  return Object.prototype.hasOwnProperty.call(PRODUCT_IMAGE_TYPES, ext) ? ext : null;
}

/** Imaginea aleasa in formular, asa cum o declara browserul. Serverul nu o crede pe cuvant. */
export type ProductImageChoice = { fileName: string; sizeBytes: number };

/** Primul motiv de refuz al unei imagini declarate, dupa nume si marime, sau null. */
export function productImageProblem(choice: ProductImageChoice): string | null {
  if (!productImageExtension(String(choice.fileName ?? ""))) return PRODUCT_IMAGE_MESSAGES.wrongType;
  const size = Number(choice.sizeBytes);
  if (!Number.isFinite(size) || size <= 0) return PRODUCT_IMAGE_MESSAGES.empty;
  if (size > MAX_PRODUCT_IMAGE_BYTES) return PRODUCT_IMAGE_MESSAGES.tooLarge;
  return null;
}
