// Tipurile, limitele si etichetele documentelor, fara nimic de server. Cardul P3-15.
//
// DE CE ESTE UN FISIER SEPARAT, acelasi motiv ca la inbound-types.ts:
// documents.ts importa "server-only", iar document-actions.ts este "use server"
// si are voie sa exporte numai functii async. Tot ce citeste si panoul din
// browser, si serverul, traieste aici.

export const DOCUMENT_KINDS = ["contract", "act", "factura", "foto", "altele"] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Etichetele romanesti, cu diacriticele lor. Valorile sunt cele din enumul din 0044. */
export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  contract: "Contract",
  act: "Act",
  factura: "Factură",
  foto: "Fotografie",
  altele: "Altele",
};

export function isDocumentKind(value: string): value is DocumentKind {
  return (DOCUMENT_KINDS as readonly string[]).includes(value);
}

/** Un document apartine unui client SAU unui proiect, niciodata amandurora. */
export type DocumentOwner = { type: "client" | "project"; id: string };

/** 20 MB, acelasi plafon ca bucketul din 0044 si constrangerea de pe tabela. */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

/**
 * Extensia -> tipul canonic. Aceleasi opt tipuri ca in bucketul largit de 0044;
 * jpg si jpeg sunt acelasi tip.
 *
 * TIPUL SE DEDUCE DIN EXTENSIE SI SE VERIFICA PE CONTINUT. Tipul trimis de
 * browser nu conteaza: pentru .doc sau .xls unele sisteme trimit un sir gol sau
 * application/octet-stream, iar oricine poate trimite orice. Serverul citeste
 * primii octeti ai fisierului stocat si ii compara cu tipul extensiei.
 */
export const DOCUMENT_TYPES: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export const ALLOWED_EXTENSIONS_LABEL = "PDF, JPG, JPEG, PNG, WEBP, DOC, DOCX, XLS, XLSX";

/** Atributul accept al campului de fisier. O curtoazie, nu o regula. */
export const DOCUMENT_ACCEPT = Object.keys(DOCUMENT_TYPES)
  .map((ext) => `.${ext}`)
  .join(",");

export const DOCUMENT_MESSAGES = {
  tooLarge: "Fișierul depășește limita de 20 MB.",
  empty: "Fișierul este gol.",
  wrongType: `Tipul fișierului nu este acceptat. Se acceptă doar ${ALLOWED_EXTENSIONS_LABEL}.`,
  contentMismatch: `Conținutul fișierului nu corespunde extensiei lui. Se acceptă doar ${ALLOWED_EXTENSIONS_LABEL}.`,
  noKind: "Alege tipul documentului.",
  noFile: "Alege un fișier.",
  notActive: "Documentele nu sunt încă active.",
  session: "Sesiune expirată. Autentifică-te din nou.",
  forbidden: "Nu ai dreptul să faci această operațiune.",
  downloadFailed: "Documentul nu poate fi descărcat. Reîncarcă pagina și încearcă din nou.",
} as const;

/** Extensia acceptata a unui nume de fisier, cu litere mici, sau null. */
export function documentExtension(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  // hasOwnProperty si nu `in`: "constructor" este `in` orice obiect.
  return Object.prototype.hasOwnProperty.call(DOCUMENT_TYPES, ext) ? ext : null;
}

/** Cati octeti de la inceputul fisierului ajung ca sa ii recunoastem tipul. */
export const SNIFF_BYTES = 16;

/**
 * Primii octeti ai fisierului se potrivesc cu tipul extensiei?
 *
 * Semnaturile sunt cele publicate ale fiecarui format. DOCX si XLSX sunt ambele
 * arhive ZIP, deci semnatura le recunoaste ca ZIP si nu le deosebeste intre ele:
 * ce se refuza este un fisier care nu este deloc de familia declarata, de pilda
 * un text redenumit .pdf. DOC si XLS sunt ambele containere OLE2, la fel.
 */
export function contentMatchesType(bytes: Uint8Array, mimeType: string): boolean {
  const at = (signature: number[], offset = 0) =>
    bytes.length >= offset + signature.length &&
    signature.every((b, i) => bytes[offset + i] === b);

  switch (mimeType) {
    case "application/pdf":
      return at([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    case "image/jpeg":
      return at([0xff, 0xd8, 0xff]);
    case "image/png":
      return at([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return at([0x52, 0x49, 0x46, 0x46]) && at([0x57, 0x45, 0x42, 0x50], 8); // RIFF....WEBP
    case "application/msword":
    case "application/vnd.ms-excel":
      return at([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return at([0x50, 0x4b, 0x03, 0x04]); // PK
    default:
      return false;
  }
}

// ro-MD, acelasi locale ca in format.ts.
const SIZE_FORMAT = new Intl.NumberFormat("ro-MD", { maximumFractionDigits: 1 });

/** Marimea unui fisier, romaneste: 512 B, 34 KB, 1,2 MB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${SIZE_FORMAT.format(bytes / (1024 * 1024))} MB`;
}

export type DocumentRow = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  kind: DocumentKind;
  createdAt: string;
};

/** Cel mult 5 randuri pe fila, restul in lista completa, paginata la 25. */
export const DOCUMENTS_INLINE = 5;
export const DOCUMENTS_PAGE_SIZE = 25;

export type DocumentsView = {
  rows: DocumentRow[];
  total: number;
  /** Lista completa, paginata, in loc de rezumatul de cel mult 5 randuri. */
  showAll: boolean;
  page: number;
  pageSize: number;
  /** Citirea a cazut. Randurile sunt goale, iar ecranul o spune in loc sa arate "niciun document". */
  failed: boolean;
};
