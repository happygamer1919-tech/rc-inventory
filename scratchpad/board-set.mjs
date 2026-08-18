#!/usr/bin/env node
// Helper local pentru ORANGE. Actualizeaza un card in rc-board.json.
// Nu face parte din livrabil, traieste in scratchpad.
// Utilizare:
//   node scratchpad/board-set.mjs <cardId> ship <sha>
//   node scratchpad/board-set.mjs <cardId> inflight <sha> "<open_on_purpose>"
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'docs/board/rc-board.json';
const [cardId, mode, sha, oop] = process.argv.slice(2);
const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const today = now.slice(0, 10);

const b = JSON.parse(readFileSync(FILE, 'utf8'));
const card = b.cards.find((c) => c.id === cardId);
if (!card) { console.error(`no such card: ${cardId}`); process.exit(1); }

card.evidence = { kind: 'journal', ref: sha, at: now };
card.last_checkpoint = today;

if (mode === 'ship') {
  card.status = 'shipped';
  card.lane = 'shipped';
  delete card.open_on_purpose;
} else if (mode === 'inflight') {
  card.status = 'in_flight';
  card.lane = card.home_lane;
  card.open_on_purpose = oop;
} else {
  console.error(`unknown mode: ${mode}`); process.exit(1);
}

b.as_of = now;
writeFileSync(FILE, JSON.stringify(b, null, 2) + '\n');
console.log(`${cardId}: status=${card.status} lane=${card.lane} evidence.ref=${sha.slice(0, 12)} as_of=${now}`);
