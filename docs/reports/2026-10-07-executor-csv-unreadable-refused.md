# P3-194: unreadable spreadsheet encodings are refused

Executor report, 2026-10-07. Branch `card/csv-unreadable-refused`.

## What changed
- `decodeCsvFile` in `lib/data/import-shared.ts` now reads UTF-16 (BOM `FF FE` or `FE FF`, or a third of the bytes 0x00 without a BOM) as UTF-16. A UTF-16 file that does not decode cleanly is refused.
- Before the windows-1250 / windows-1251 fallback the file is refused (existing Romanian message) when:
  - it contains a 0x00 byte, or
  - the decoded text has C0 control characters other than tab, CR, LF, or
  - it is nearly valid UTF-8: at least 2 valid non-ASCII UTF-8 characters and at least twice as many valid as invalid sequences.
- The refusal wording, normal UTF-8 and UTF-8 with BOM, and the P3-182 majority logic are unchanged.

## Tests
Six new cases in `tests/e2e/import-encoding.spec.ts`: UTF-16 LE with BOM, UTF-16 BE with BOM and LE without, truncated UTF-16, UTF-8 with one bad byte, 0x00 and control characters, windows-1250 with tab/CR/LF still accepted.

## What ran here
The Playwright run could not start locally (the web server needs Supabase variables, not available here). The same cases, plus the Würth and Cyrillic cases, were run against `decodeCsvFile` directly with tsx; all gave the expected result. The spec runs in CI.

No migration. No change to the extraction track.
