// Tipurile pentru callback-keys.mjs. Vezi comentariul din capul acelui fisier
// pentru motivul pentru care regula traieste in JavaScript simplu.

export declare const ROUTE_TOP_LEVEL_KEYS: readonly string[];
export declare const ROUTE_LINE_KEYS: readonly string[];
export declare const EXT34_TOP_LEVEL_KEYS: readonly string[];
export declare const EXT34_LINE_KEYS: readonly string[];
export declare const MAX_KEYS_NAMED: number;
export declare const MAX_KEY_LENGTH: number;

export declare function unknownCallbackKeys(body: unknown): {
  topLevel: string[];
  lines: { line: number; keys: string[] }[];
};

export declare function unknownKeysWarning(body: unknown): string | null;

export declare function warnUnknownCallbackKeys(
  body: unknown,
  warn?: (message: string) => void,
): string | null;
