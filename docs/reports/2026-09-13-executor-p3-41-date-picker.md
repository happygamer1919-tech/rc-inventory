# EXECUTOR report: P3-41, the intake form date picker, stopped on a false premise

**Role:** EXECUTOR. **Date:** 2026-09-13 (UTC). **Branch:** `card/p3-41`, cut from
origin/main at 5080cdb.

**Cards:** `P3-41` moved from `todo` to `blocked`, on `ivan`. Nothing shipped.

## In plain words

The card asked for a calendar on the date boxes of the manual intake form. The form
already has one, on both date boxes, and has had it since 25 August 2026. So nothing
was built. What the check did find is a real version of the danger the card was
worried about: the order of day and month in those boxes follows the language of the
operator's web browser, not the app. On an English-language browser, typing the keys
for 1 December saved 12 January. The card is now marked blocked with a question
recommending a small, different fix: spell out the chosen date in Romanian under
each date box. Nothing on the live site or in the database changed.

## Boot

Phase 2 board at as_of 2026-09-12T22:55:06Z: todo 32, in_flight 0, blocked 2,
halted 0, shipped 68. Launch gate 6/9. Next eligible card on that board: AUT-3.
Phase 3 board (read too, per the RULE-05 defect): todo 38, shipped 55, and P3-41
eligible: todo, no dependencies, not blocked. Open pull requests at start: zero.

## What was checked, and the output

The card's own notes said the premise had not been verified and that whoever picked
it up must check first. The check:

    $ grep -n 'type="date"' components/orders/InboundOrderForm.tsx
    209:              type="date"
    217:              type="date"

    $ git log -S'type="date"' --format="%h %ad %s" --date=short -- components/orders/InboundOrderForm.tsx
    2536ead 2026-08-25 P2-04: real inbound orders, private document bucket, arrival creating batches

`Input` in `components/ui/primitives.tsx` passes `type` straight through, and neither
`app/globals.css` nor any component carries a rule on the calendar picker indicator or
on `appearance` for inputs. So both fields, "Data comenzii" and "Livrare estimată", are
native date pickers today, which is exactly the control the card's defaults say to
start with.

The stored value is not shifted. `createInboundOrder` in `lib/data/inbound-actions.ts`
passes the `YYYY-MM-DD` string to the database function unchanged, and `formatDate` in
`lib/data/format.ts` splits the string without constructing a `Date`, so no timezone
is involved on the way in or on the way out.

Then the risk the card's plain line names was tested directly. A throwaway script
(not committed) rendered the same control in Chromium, the suite's browser, with page
locale `ro-RO` and `lang="ro"`, launched once with the browser's own language left at
its default and once with `--lang=ro-RO`, and typed the keystrokes `01122026` after
focusing the field:

    {"run":"default-browser-language","type":"date","hasShowPicker":true,"keystrokes":"01122026","storedValue":"2026-01-12"}
    {"run":"browser-language-ro","type":"date","hasShowPicker":true,"keystrokes":"01122026","storedValue":"2026-12-01"}

Screenshots of the two runs showed `01/12/2026` with a calendar button and
`01.12.2026` with a calendar button. The page locale and the `lang` attribute did
not change the segment order; the browser language did.

## Why the card was stopped rather than worked

The phase 3 board doctrine, HALT ON AN ABSENT TOOL OR A FALSE PREMISE: when a card
asserts a fact the repository contradicts, the executor stops working that card, does
not reinterpret it until it fits, sets it blocked on the person who owes the
correction, and pastes the disproving output into its question. It also follows from
the acceptance itself: the new case must be proved to fail first, and a case asserting
that each date field opens a picker passes on today's code. Building it would have
produced a green test proving nothing.

The factory task brief said to build the card. The repository's rules win where the
two disagree, so the brief was not followed on that point, and a mailbox question was
written to the owner (`q005-p3-41-false-premise.md` in the factory).

## What blocked, on whom, since when

`P3-41`, blocked on `ivan` (the owner id on this board), since 2026-09-13. The ask,
copied from the card:

> DECISION NEEDED: what this card becomes, because its premise is false. Both date
> fields on the manual intake form already open a calendar picker.
>
> OPTIONS: (A) RE-SCOPE: keep the native picker and show the chosen date written out
> in Romanian beside every date field on the manual intake form, for example marți, 1
> decembrie 2026, so a day typed in the wrong order is visible before saving; no
> dependency, nothing stored changes, and a red-first case exists. (B) Replace the
> native control with a Romanian-only zi.lună.an entry plus a picker button; fixed
> order everywhere, but more code and the typed path is easier to break. (C) Close
> the card as not needed and accept the browser-language behaviour.
>
> RECOMMENDATION: (A).
>
> IMPACT IF UNANSWERED: this card stays blocked. Nothing depends on it and nothing on
> the live site changed.

The full question, with the pasted command output, is on the card.

## Defects found

One entry appended to `docs/LEARNINGS.md`: a native date field orders day and month by
the browser's language, not by the page locale, and a Playwright `locale` does not
prove what an operator sees. The same native control is on the client form, the leads
form, the project form and the extraction review panel. That is recorded as a finding
and deliberately not added to this card.

## Migration

None added. No application code changed. This pull request changes the phase 3 board
entry for P3-41 and its `as_of`, `docs/LEARNINGS.md`, and this report.

## State at the end

P3-41 waits on the owner's choice between A, B and C. The next eligible card on the
phase 2 board is AUT-3.
