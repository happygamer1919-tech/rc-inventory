// P3-320. Desenul de pe pozele ghidului: un chenar in jurul elementului, o sageata
// spre el si un cerc cu numarul pasului, toate in culoarea de accent a platformei.
//
// Functii pure, fara browser: scripts/guide/screenshots.mjs le cheama cu
// dreptunghiurile gasite pe pagina si pune SVG-ul rezultat peste ecran, inainte de
// poza. Testul tests/e2e/guide-screenshots.spec.ts le verifica fara browser.
//
// Culoarea se citeste din app/globals.css (--color-rc-orange) si din nicio alta
// parte: ghidul nu aduce culori noi. Albul din jurul liniilor si din numar este
// --color-rc-white, ca linia sa se vada si pe meniul negru si pe butonul portocaliu.

export const MARKER_RADIUS = 15;
export const BOX_PAD = 4;
const GAP = 3 * MARKER_RADIUS;
const EDGE = 4;
const WHITE = "#ffffff";

/** Culoarea de accent din textul lui app/globals.css. Arunca daca tokenul lipseste. */
export function readAccent(cssText) {
  const m = /--color-rc-orange:\s*(#[0-9a-fA-F]{3,8})\s*;/.exec(String(cssText));
  if (!m) throw new Error("app/globals.css: nu gasesc --color-rc-orange");
  return m[1].toLowerCase();
}

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function circleBox(cx, cy) {
  return { x: cx - MARKER_RADIUS, y: cy - MARKER_RADIUS, w: 2 * MARKER_RADIUS, h: 2 * MARKER_RADIUS };
}

function inside(cx, cy, vp) {
  return (
    cx - MARKER_RADIUS >= EDGE &&
    cy - MARKER_RADIUS >= EDGE &&
    cx + MARKER_RADIUS <= vp.width - EDGE &&
    cy + MARKER_RADIUS <= vp.height - EDGE
  );
}

/**
 * Asaza marcajele. `items` = [{ step, rect: { x, y, width, height } }] in coordonatele
 * ferestrei. Intoarce [{ step, box, marker: { cx, cy }, arrow: { x1, y1, x2, y2 } | null }].
 * Cercul se pune langa chenar (stanga, sus-stanga, sus, dreapta, jos), inauntrul
 * ferestrei, fara sa calce alt cerc si, daca se poate, fara sa acopere alt chenar.
 */
export function layoutMarks(items, viewport) {
  const boxes = items.map((it) => ({
    x: it.rect.x - BOX_PAD,
    y: it.rect.y - BOX_PAD,
    w: it.rect.width + 2 * BOX_PAD,
    h: it.rect.height + 2 * BOX_PAD,
  }));
  const placed = [];
  const out = [];
  items.forEach((it, i) => {
    const box = boxes[i];
    const midY = box.y + box.h / 2;
    const nearX = box.x + Math.min(box.w / 2, 40);
    const candidates = [
      [box.x - GAP, midY],
      [box.x - GAP * 0.75, box.y - GAP * 0.75],
      [nearX, box.y - GAP],
      [box.x + box.w + GAP, midY],
      [nearX, box.y + box.h + GAP],
      [box.x + box.w + GAP * 0.75, box.y - GAP * 0.75],
      // Chenar cat ecranul: cercul intra in coltul lui, fara sageata.
      [box.x + MARKER_RADIUS + 6, box.y + MARKER_RADIUS + 6],
    ];
    const freeOfMarkers = (cx, cy) => placed.every((p) => Math.hypot(p.cx - cx, p.cy - cy) >= 2 * MARKER_RADIUS + 6);
    const freeOfBoxes = (cx, cy) => boxes.every((b, j) => j === i || !overlaps(circleBox(cx, cy), b));
    let pick =
      candidates.find(([cx, cy]) => inside(cx, cy, viewport) && freeOfMarkers(cx, cy) && freeOfBoxes(cx, cy)) ??
      candidates.find(([cx, cy]) => inside(cx, cy, viewport) && freeOfMarkers(cx, cy));
    if (!pick) {
      // Nimic liber: primul loc, tras inauntrul ferestrei.
      const [cx, cy] = candidates[0];
      pick = [
        Math.min(Math.max(cx, MARKER_RADIUS + EDGE), viewport.width - MARKER_RADIUS - EDGE),
        Math.min(Math.max(cy, MARKER_RADIUS + EDGE), viewport.height - MARKER_RADIUS - EDGE),
      ];
    }
    const [cx, cy] = pick;
    placed.push({ cx, cy });
    // Sageata: de la marginea cercului pana la cel mai apropiat punct al chenarului.
    const px = Math.min(Math.max(cx, box.x), box.x + box.w);
    const py = Math.min(Math.max(cy, box.y), box.y + box.h);
    const dist = Math.hypot(px - cx, py - cy);
    let arrow = null;
    if (dist > MARKER_RADIUS + 8) {
      const ux = (px - cx) / dist;
      const uy = (py - cy) / dist;
      arrow = {
        x1: round(cx + ux * (MARKER_RADIUS + 2)),
        y1: round(cy + uy * (MARKER_RADIUS + 2)),
        x2: round(px - ux * 2),
        y2: round(py - uy * 2),
      };
    }
    out.push({ step: it.step, box: roundBox(box), marker: { cx: round(cx), cy: round(cy) }, arrow });
  });
  return out;
}

function round(n) {
  return Math.round(n * 10) / 10;
}

function roundBox(b) {
  return { x: round(b.x), y: round(b.y), w: round(b.w), h: round(b.h) };
}

/** SVG-ul care se pune peste ecran, cat fereastra. */
export function overlaySvg(layout, accent, viewport) {
  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${viewport.width}" height="${viewport.height}" viewBox="0 0 ${viewport.width} ${viewport.height}">`,
    `<defs><marker id="guide-arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L12,6 L0,12 z" fill="${accent}"/></marker></defs>`,
  );
  for (const m of layout) {
    const { x, y, w, h } = m.box;
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="none" stroke="${WHITE}" stroke-width="7"/>`,
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="none" stroke="${accent}" stroke-width="3"/>`,
    );
  }
  for (const m of layout) {
    if (!m.arrow) continue;
    const { x1, y1, x2, y2 } = m.arrow;
    parts.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${WHITE}" stroke-width="7" stroke-linecap="round"/>`,
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${accent}" stroke-width="3" stroke-linecap="round" marker-end="url(#guide-arrow)"/>`,
    );
  }
  for (const m of layout) {
    const { cx, cy } = m.marker;
    parts.push(
      `<circle cx="${cx}" cy="${cy}" r="${MARKER_RADIUS}" fill="${accent}" stroke="${WHITE}" stroke-width="2.5"/>`,
      `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="15" font-weight="700" fill="${WHITE}">${Number(m.step)}</text>`,
    );
  }
  parts.push("</svg>");
  return parts.join("");
}
