// card-order.mjs
// Card BOARD-03. CARD IDS SORT ON A TUPLE, NOT ON THE RAW STRING.
//
// THE DEFECT, AND IT IS NOT HYPOTHETICAL. `localeCompare` on the raw id puts
// AUT-16 before AUT-8, because it is comparing the characters "1" and "8". The
// next-card pick takes the head of that list, so AUT-8 and AUT-9 queued behind
// every AUT-1x card authored days later and would have stayed there for ever: a
// lane only ever grows, so nothing removes the newer ids from in front of them.
//
// On 2026-09-05 the eligible list on the phase 2 board began
// AUT-21,AUT-22,AUT-23,AUT-8,AUT-9 and the session that read it worked AUT-21,
// AUT-22 and AUT-23 first, in that order, exactly as the defect dictated.
//
// NOTHING IS RENUMBERED. CLAUDE.md 8b forbids it and AUT-8 and AUT-9 are cited in
// reports, rulings and pull requests. The sort changes; the ids do not.
//
// A TUPLE, NOT A PADDED STRING. Padding at compare time works until a lane
// reaches three digits and it hides the intent, which is that the number is a
// NUMBER. The key is (prefix, number, suffix), compared in that order.
//
// AN ID THE KEY CANNOT PARSE FALLS BACK TO THE RAW STRING. It is never dropped
// and never throws. A selector that silently omits a card is worse than one that
// orders it oddly, and docs/LEARNINGS.md already names the class where an empty
// result reads as nothing to do.
//
// ONE SORT, ONE PLACE. scripts/poc/eligible.mjs and scripts/poc/boards.mjs both
// import this. A second comparator anywhere is the defect this file removes.

/**
 * (prefix, number, suffix) for an id like `P3-04b`, or null when it does not
 * have that shape.
 *
 * THE SUFFIX IS PART OF THE KEY AND NOT AN AFTERTHOUGHT. P3-04, P3-04b and P3-05
 * must come out in that order, and a key of (prefix, number) alone would leave
 * P3-04 and P3-04b tied, so their order would depend on the sort's stability
 * rather than on anything anyone chose.
 */
export function cardIdKey(id) {
  const m = /^([A-Za-z][A-Za-z0-9]*)-(\d+)([A-Za-z]*)$/.exec(String(id));
  if (!m) return null;
  return { prefix: m[1].toUpperCase(), number: Number(m[2]), suffix: m[3].toLowerCase() };
}

/**
 * The comparator. Total, deterministic, and never throws.
 *
 * An id that parses always sorts before one that does not, and two that do not
 * are ordered against each other by the raw string, so the result is stable and
 * every id appears exactly once however odd it looks.
 */
export function compareCardIds(a, b) {
  const rawA = String(a);
  const rawB = String(b);
  const ka = cardIdKey(rawA);
  const kb = cardIdKey(rawB);

  if (!ka && !kb) return rawA.localeCompare(rawB);
  if (!ka) return 1;
  if (!kb) return -1;

  if (ka.prefix !== kb.prefix) return ka.prefix.localeCompare(kb.prefix);
  if (ka.number !== kb.number) return ka.number - kb.number;
  if (ka.suffix !== kb.suffix) return ka.suffix.localeCompare(kb.suffix);
  return 0;
}

/** The same order, for a list of card objects carrying an `id`. */
export function byCardId(a, b) {
  return compareCardIds(a && a.id, b && b.id);
}
