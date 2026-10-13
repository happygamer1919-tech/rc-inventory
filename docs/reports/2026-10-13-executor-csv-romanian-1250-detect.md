# P3-269: Romanian windows-1250 CSV no longer read as Cyrillic

Cause: `decodeCsvFile` (lib/data/import-shared.ts) picked windows-1251 on any run of 3 Cyrillic letters. Ten Romanian diacritic bytes are Cyrillic letters in 1251, so three diacritics in a row (Țâșnitor) flipped the file.

Fix: `hasRussianWord` counts a Cyrillic word as Russian only with at least 2 letters outside those ten letters. UTF-8, BOM, UTF-16 and the plausibility checks are untouched.

Tests: five 'codare csv P3-269' cases in tests/e2e/import-encoding.spec.ts (Romanian reproduction, diacritics in a note, genuine Russian 1251, ASCII, UTF-8). The spec runs in CI; locally the decoder was checked with a script on the same inputs.

Known limit: a file whose only Cyrillic is made of the ten shared letters (for example ООО alone) reads as Romanian.
