export const MARKER_RADIUS: number;
export const BOX_PAD: number;
export type Rect = { x: number; y: number; width: number; height: number };
export type Placed = {
  step: number;
  box: { x: number; y: number; w: number; h: number };
  marker: { cx: number; cy: number };
  arrow: { x1: number; y1: number; x2: number; y2: number } | null;
};
export function readAccent(cssText: string): string;
export function layoutMarks(items: Array<{ step: number; rect: Rect }>, viewport: { width: number; height: number }): Placed[];
export function overlaySvg(layout: Placed[], accent: string, viewport: { width: number; height: number }): string;
