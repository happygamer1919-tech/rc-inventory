# P3-333: the guide picture check cannot be skipped

Source: Fable bug check 2026-10-21 19:18Z, finding 4.

## What changed
- `lib/guide/privacy.mjs`: new `manifestProblems`, run by `checkPrivacy`. It fails when docs/guide/screenshots.json is missing or not valid JSON, when a PNG under content/guide-images/ has no entry, when a PNG's sha256 differs from its entry (the picture changed after its text was read), when an entry has no text or no file, and when an entry points to a missing file. Every entry text is still scanned against docs/guide/real-names.txt.
- `scripts/guide/screenshots.mjs`: the manifest is always written. A partial run (GUIDE_ONLY) replaces only the entries of its lessons. The captured text now also holds input values, placeholders, titles, aria labels and image alt texts, not only the body text.
- `tests/e2e/guide-privacy.spec.ts`: six new cases, one per failure, and the control repository now carries a picture and its entry.

## Not done here
- The manifest was not regenerated: it needs the local database and a browser, which this machine does not have. The committed manifest already lists all 87 pictures with matching sha256 and non-empty text (checked), so the new check passes on it. The next guide-screenshots run writes the richer text.
- "Newer than its entry" is a sha256 comparison, not a file date, because git sets file dates at checkout.

## Commands run locally
- `npm run check:guide-privacy`: ok (64 files, 3 names).
- guide-privacy spec through a temporary config, 16 of 16 passed.
- Board validator: exit 0.
