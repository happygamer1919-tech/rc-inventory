export function sha256Of(buffer: Uint8Array): string;
export function nameLikeWords(text: string): string[];
export function globalAllowedWords(root: string): Set<string>;
export function judgePicture(args: {
  ocrText: string;
  denyNames: string[];
  allowedWords: Set<string>;
  screenText?: string;
}): { denied: string[]; unknown: string[] };
