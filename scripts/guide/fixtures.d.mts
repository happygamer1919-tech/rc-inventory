// P3-320. Tipurile pentru scripts/guide/fixtures.mjs, ca testele TypeScript sa il poata importa.
export const PLACEHOLDER_IDS: Record<string, string>;
export function resolvePlaceholders(text: string, ids?: Record<string, string>): string;
export function chisinauDay(offset?: number, now?: Date): string;
export function chisinauMoment(offset?: number, hourUtc?: number, now?: Date): string;
export const ISSUER: Record<string, string>;
export const ACCOUNT_NAMES: Record<string, string>;
export const SUPPLIERS: Array<Record<string, any>>;
export const PRODUCTS: Array<Record<string, any>>;
export const CLIENTS: Array<Record<string, any>>;
export const CONTACTS: Array<Record<string, any>>;
export const NOTES: Array<Record<string, any>>;
export const PROJECTS: Array<Record<string, any>>;
export const DEVIZE: Array<Record<string, any>>;
export const INBOUND: Array<Record<string, any>>;
export const OUTBOUND: Array<Record<string, any>>;
export const ALERTS: Array<Record<string, any>>;
export const TASKS: Array<Record<string, any>>;
export const INVOICES: Array<Record<string, any>>;
