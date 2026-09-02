// Tipurile pentru document-url-contract.mjs. Vezi comentariul din capul acelui
// fisier pentru motivul pentru care logica traieste in JavaScript simplu.

export type DocumentErrorCode =
  | "EXPIRED_TOKEN"
  | "INVALID_TOKEN"
  | "OBJECT_NOT_FOUND"
  | "UPSTREAM_UNAVAILABLE"
  | "METHOD_NOT_ALLOWED";

export declare const DOCUMENT_ERROR: {
  readonly expired: "EXPIRED_TOKEN";
  readonly invalid: "INVALID_TOKEN";
  readonly notFound: "OBJECT_NOT_FOUND";
  readonly upstream: "UPSTREAM_UNAVAILABLE";
  readonly method: "METHOD_NOT_ALLOWED";
};

export declare const DOCUMENT_STATUS: Record<DocumentErrorCode, number>;

export declare function tokenExpiry(token: string): number | null;

export declare function classifyStorageFailure(
  status: number,
  body: unknown,
  token: string,
  nowSeconds: number,
): DocumentErrorCode;
