// board-config.mjs - the per-board display configuration, in one place.
//
// Both boards render through the SAME client runtime (board-app.js) and the
// SAME renderer (render-board.mjs). Everything that differs between them lives
// here and nowhere else: people sets, display labels, brandmark, paths, and the
// terminal defaults. Forking the 1243-line app would guarantee drift, because
// the first bug fixed in one copy and not the other is a board that lies.
//
// TWO KINDS OF FIELD, and the difference is the whole design:
//
//   JSON-SOURCED, computed by deriveConfig() from the board file, because the
//   JSON already carries the fact in a usable form: `people`, `denominator`,
//   `boardName`.
//
//   PINNED per board, because the JSON does NOT carry it usably. Lane titles in
//   the JSON are shouty ("RODICA BATCH", "IN FLIGHT") while the app's labels are
//   sentence case ("Rodica inbox", "In flight"); sourcing labels from the titles
//   would rewrite visible platform copy in three places. And deriving a display
//   name from an id turns `jp` into "Jp".
//
// Every pre-launch value below is pinned to the literal that shipped in
// board-app.js, byte for byte, so the platform board cannot move. That equality
// is machine-checked, not eyeballed: the parity script deep-equals
// deriveConfig(prelaunch-board.json) against the values transcribed out of
// board-app.js lines 38-75 and 541/555-557/706/714/725/951/981/1041/1053, and
// out of render-board.mjs:79.
//
// Zero dependencies, zero side effects: a test can import this without
// rendering anything.

/** The historical people set, used when a board's lane omits `columns`. */
export const DEFAULT_PEOPLE = ["ivan", "jp", "rodica"];

/** Fixed on both boards by BOARD-SPEC.md: nine go/no-go conditions. */
export const DEFAULT_DENOMINATOR = 9;

// Prose spells the denominator out ("Nine go/no-go conditions", "All nine
// cleared."). Derived from the number so the two can never disagree, and so the
// platform board's sentences stay byte-identical.
export const NUMBER_WORD = {
  1: "One", 2: "Two", 3: "Three", 4: "Four", 5: "Five",
  6: "Six", 7: "Seven", 8: "Eight", 9: "Nine", 10: "Ten",
};

/**
 * Per-board pinned blocks, keyed on the JSON's own `board` value.
 *
 * The lane IDs are identical on both boards, `rodica_batch` included. Only the
 * display strings differ: the id is structure, the title is display text.
 */
export const BOARD_CONFIGS = {
  "OsteoJP - Pre-Launch Board": {
    owner: "ivan",
    whoLabels: { ivan: "Ivan", jp: "JP", rodica: "Rodica", infra: "Infra" },
    laneLabels: {
      blocked_on_people: "Blocked on people",
      in_flight: "In flight",
      rodica_batch: "Rodica inbox",
      incidents: "Incidents",
      loose_ends: "Loose ends",
      shipped: "Shipped",
    },
    laneHints: {
      blocked_on_people: "someone owes an answer",
      in_flight: "being executed now",
      rodica_batch: "fresh reports land here",
      incidents: "live problems",
      loose_ends: "tracked, not batched",
      shipped: "done, with proof",
    },
    kindLabels: {
      in_flight: "Work item",
      rodica_batch: "Rodica inbox",
      incidents: "Incident",
      loose_ends: "Loose end",
    },
    brandmark: "OsteoJP · Pre-Launch",
    footerLabel: "osteojp · pre-launch portal",
    briefTitle: "Made in the Pre-Launch Portal",
    pageTitle: "OsteoJP · Pre-Launch Portal",
    sourcePath: "docs/board/prelaunch-board.json",
    outputPath: "prelaunch-board.rendered.html",
    exportFilename: "prelaunch-board.json",
    validateCommand: "node docs/board/validate-board.mjs",
    ownerTerminalDefault: "green",
    ownerTerminalPlaceholder: "green / cyan / ivan",
    newIdPrefix: "NEW-",
  },

  "OsteoJP - Portal Board": {
    owner: "ivan",
    whoLabels: { ivan: "Ivan", jp: "JP", lawyer: "Lawyer", infra: "Infra" },
    laneLabels: {
      blocked_on_people: "Blocked on people",
      in_flight: "In flight",
      rodica_batch: "Stakeholder feedback",
      incidents: "Incidents",
      loose_ends: "Loose ends",
      shipped: "Shipped",
    },
    laneHints: {
      blocked_on_people: "someone owes an answer",
      in_flight: "being executed now",
      rodica_batch: "stakeholder answers land here",
      incidents: "live problems",
      loose_ends: "tracked, not batched",
      shipped: "done, with proof",
    },
    kindLabels: {
      in_flight: "Work item",
      rodica_batch: "Stakeholder note",
      incidents: "Incident",
      loose_ends: "Loose end",
    },
    brandmark: "OsteoJP · Portal",
    footerLabel: "osteojp · portal board",
    briefTitle: "Made in the Portal Board",
    pageTitle: "OsteoJP · Portal Board",
    sourcePath: "docs/board/portal-board.json",
    outputPath: "portal-board.rendered.html",
    exportFilename: "portal-board.json",
    // The export hint and the change brief both name the validate command. On
    // this board it needs the path argument, or it validates the wrong file.
    validateCommand: "node docs/board/validate-board.mjs docs/board/portal-board.json",
    ownerTerminalDefault: "purple",
    ownerTerminalPlaceholder: "purple / ivan",
    newIdPrefix: "NEW-",
  },

  // Added for the Rapid Construct phase 1 preview board. The OsteoJP blocks
  // above are untouched: this is a third pinned entry, not an edit to theirs.
  // People are ivan, andre and client, read from this board's own
  // blocked_on_people columns by deriveConfig; the labels below only supply
  // their display casing.
  "RC-INVENTORY - Phase 1 Preview": {
    owner: "ivan",
    whoLabels: { ivan: "Ivan", andre: "Andre", client: "Client", infra: "Infra" },
    laneLabels: {
      blocked_on_people: "Blocked on people",
      in_flight: "In flight",
      rodica_batch: "Review batch (Ivan)",
      incidents: "Incidents",
      loose_ends: "Loose ends",
      shipped: "Shipped",
    },
    laneHints: {
      blocked_on_people: "someone owes an answer",
      in_flight: "being executed now",
      rodica_batch: "owner change-wave inbox",
      incidents: "live problems",
      loose_ends: "tracked, not batched",
      shipped: "done, with proof",
    },
    kindLabels: {
      in_flight: "Work item",
      rodica_batch: "Review note",
      incidents: "Incident",
      loose_ends: "Loose end",
    },
    brandmark: "Rapid Construct / Inventar",
    footerLabel: "rapid construct / inventar faza 1",
    briefTitle: "Made in the RC Inventory Board",
    pageTitle: "Rapid Construct / Inventar / Board faza 1",
    sourcePath: "docs/board/rc-board.json",
    outputPath: "rc-board.rendered.html",
    exportFilename: "rc-board.json",
    // Needs the path argument or it validates the wrong file.
    validateCommand: "node docs/board/validate-board.mjs docs/board/rc-board.json",
    ownerTerminalDefault: "orange",
    ownerTerminalPlaceholder: "orange / ivan",
    newIdPrefix: "NEW-",
  },

  // Added for the Rapid Construct phase 2 build board. Phase 1's block above is
  // untouched: this is a fourth pinned entry, not an edit to any other. The two
  // RC boards render through the same runtime into two different files and two
  // different artifact URLs, so closing phase 1 never disturbs phase 2 and vice
  // versa.
  //
  // People are ivan, andre and client again, read from this board's own
  // blocked_on_people columns by deriveConfig; the labels below only supply
  // their display casing. The rodica_batch lane keeps its fixed id and carries
  // the phase 1 title, "Review batch (Ivan)": the validator and the board app
  // both pin the lane-id set, so the id can never be renamed, only the label.
  //
  // ownerTerminalDefault is "executor" rather than a colour, because phase 2
  // names its terminals by role (AUTHOR, EXECUTOR, CRITIC, POC) per CLAUDE.md
  // section 1, and every phase 2 card is authored with owner_terminal
  // "executor".
  "RC-INVENTORY - Phase 2 Build": {
    owner: "ivan",
    whoLabels: { ivan: "Ivan", andre: "Andre", client: "Client", infra: "Infra" },
    laneLabels: {
      blocked_on_people: "Blocked on people",
      in_flight: "In flight",
      rodica_batch: "Review batch (Ivan)",
      incidents: "Incidents",
      loose_ends: "Loose ends",
      shipped: "Shipped",
    },
    laneHints: {
      blocked_on_people: "someone owes an answer",
      in_flight: "being executed now",
      rodica_batch: "owner change-wave inbox",
      incidents: "live problems",
      loose_ends: "tracked, not batched",
      shipped: "done, with proof",
    },
    kindLabels: {
      in_flight: "Work item",
      rodica_batch: "Review note",
      incidents: "Incident",
      loose_ends: "Loose end",
    },
    brandmark: "Rapid Construct / Inventar",
    footerLabel: "rapid construct / inventar faza 2",
    briefTitle: "Made in the RC Inventory Board",
    pageTitle: "Rapid Construct / Inventar / Board faza 2",
    sourcePath: "docs/board/rc-board-phase2.json",
    outputPath: "rc-board-phase2.rendered.html",
    exportFilename: "rc-board-phase2.json",
    // Needs the path argument or it validates the wrong file.
    validateCommand: "node docs/board/validate-board.mjs docs/board/rc-board-phase2.json",
    ownerTerminalDefault: "executor",
    ownerTerminalPlaceholder: "executor / ivan",
    newIdPrefix: "NEW-",
  },
};

/**
 * Merge the JSON-sourced fields over a board's pinned block.
 *
 * `people` comes from the BLOCKED ON PEOPLE lane's own `columns`, the same read
 * validate-board.mjs does, with the same fallback discipline: a board that omits
 * `columns` keeps the historical trio, which is what makes this change
 * behaviour-preserving for any board that predates the field.
 *
 * An unknown board name is a hard error. Falling back to the pre-launch block
 * would silently brand a third board as the Pre-Launch Portal and point its
 * Export at the wrong file.
 */
export function deriveConfig(board) {
  const name = board && board.board;
  const pinned = BOARD_CONFIGS[name];
  if (!pinned) {
    throw new Error(
      `board-config: no configuration for board "${name}". ` +
        `Known boards: ${Object.keys(BOARD_CONFIGS).map((b) => `"${b}"`).join(", ")}. ` +
        `Add a block to BOARD_CONFIGS rather than falling back, or the board renders under another board's identity.`,
    );
  }

  const lanes = Array.isArray(board.lanes) ? board.lanes : [];
  const peopleLane = lanes.find((l) => l && l.id === "blocked_on_people");
  const people =
    Array.isArray(peopleLane?.columns) && peopleLane.columns.length > 0
      ? peopleLane.columns.slice()
      : (pinned.people ?? DEFAULT_PEOPLE).slice();

  const denominator = board.launch_gate?.denominator ?? DEFAULT_DENOMINATOR;

  return {
    ...pinned,
    boardName: name || "board",
    people,
    // `blocked_on`'s full domain: nobody, this board's people, or infra.
    whoOrder: [null, ...people, "infra"],
    denominator,
    denominatorWord: NUMBER_WORD[denominator] || String(denominator),
  };
}
