# LEARNINGS

Every defect discovered while working a card, written down once so it is not
paid for twice.

**The rule (CLAUDE.md section 9):** before reporting any card done, append every
ERROR/SOLUTION pair discovered while working it. A card that hit no defects
appends nothing and says so in its notes. A card that hit three appends three.

**Format:**

```
### <short title>
**Tag:** frontend | backend | data | infra | auth | ci
**ERROR:** what broke, concretely, including what it looked like on screen or
in the output.
**SOLUTION:** what fixed it, and the rule that prevents the next instance.
```

Append at the bottom, under the phase heading. Never edit or delete an existing
entry: a learning that turned out to be wrong gets a new entry correcting it,
because the wrong belief is itself the thing worth recording.

---

## Phase 1 (preview, closed 2026-08-19)

Six defects, all found by driving the screen rather than by reading the code.
That is the pattern worth carrying into phase 2: every one of these typechecked
and built clean.

### Invisible white-on-white table columns
**Tag:** frontend
**ERROR:** The product drill-down side panel rendered white text on a white
surface, so the LOT and CANTITATE columns were completely invisible. The rows
were present in the DOM with correct data and the page looked like it had a
rendering bug or missing data. `body` carries the white foreground colour, and
the panel set only `bg-rc-white` without setting a foreground, so the text
inherited white onto white.
**SOLUTION:** Set an explicit foreground colour on the panel container, then
audit every other white-surface element in the app; all of them now carry an
explicit colour. RULE: a component that sets a background must set a foreground
in the same rule. Inheriting one half of a colour pair from `body` works until
someone puts the component on a different surface.

### Diacritics-sensitive search finds nothing
**Tag:** frontend
**ERROR:** Typing `tigla` in the inventory search returned zero results while
the catalogue plainly showed `Tigla` spelled with its diacritics. The search
looked broken, and to an operator a search that returns nothing for a product
they can see is worse than no search. Operators type fast and without
diacritics; the comparison was byte-exact against text that carries them.
**SOLUTION:** Normalise BOTH sides with NFD and strip combining marks before
comparing. Verified that `tigla`, `Tigla`, `sindrila` and `vata` all match their
diacritic spellings. RULE: in a Romanian UI, every text comparison a human types
into is diacritics-insensitive by default. This applies to phase 2 database
queries too, not only client-side filters.

### Combobox clipped to a sliver by an overflow ancestor
**Tag:** frontend
**ERROR:** The searchable product dropdown was absolutely positioned inside the
outbound line table, whose `overflow-x-auto` clipped the open list to a sliver a
few pixels tall. The control looked broken rather than misplaced, and no console
error appeared: an ancestor's overflow silently clips an absolutely positioned
descendant.
**SOLUTION:** Render the list through a portal to `document.body` with fixed
positioning, reposition on scroll and resize, and teach the outside-click
handler to recognise the portalled list as inside the component. RULE: any
floating layer (dropdown, popover, tooltip, menu) portals to the body. An
absolutely positioned overlay inside a scroll container is a clipping bug
waiting for a narrower viewport.

### PDF column collision from guessed character widths
**Tag:** data
**ERROR:** In the generated supplier confirmation PDFs, right-aligned numeric
columns collided with the text to their left. The width helper estimated
character width with a single average value, so a row of narrow digits and a row
of wide capitals computed the same width and only one of them was right.
**SOLUTION:** Use the real Helvetica and Helvetica-Bold advance-width metrics
per character instead of an average. RULE: never estimate text width when the
font's own metric table is available. An estimate that is right on the sample
row is wrong on the row nobody looked at.

### Hardcoded dashboard count
**Tag:** data
**ERROR:** The dashboard product count was written as the literal `26`, which
happened to be correct at that moment and is exactly what the card forbade. Any
change to the catalogue would have left the dashboard confidently reporting a
stale number, with no error and nothing to notice.
**SOLUTION:** Replaced with `PRODUCTS.length`. RULE: a number displayed to a
user is derived from the data at render time, never transcribed from it. In
phase 2 this hardens further: every dashboard number is computed from the
database at request time, and P2-06's acceptance greps the repository to prove
the mock module is gone rather than merely unused.

### Stat card wrap breaking the row rhythm
**Tag:** frontend
**ERROR:** The total stock value wrapped to two lines because the currency
label did not fit, which made one stat card taller than its neighbours and broke
the alignment of the whole dashboard row. References, dates and money in the two
narrow bottom tables wrapped mid-value for the same reason.
**SOLUTION:** Render the currency as a smaller suffix so the value fits on one
line, and stop mid-value wrapping in the narrow tables. RULE: a fixed-height row
of cards needs its longest realistic value tested, not its sample value. Check
the widest case (largest number, longest reference, longest supplier name)
before calling a layout done.

---

## Phase 2 (build, opened 2026-08-25)

### P2-01: an RLS policy that reads the role table recurses forever
**Tag:** auth
**ERROR:** Not hit, avoided by design, and recorded because the next person to
add a table will hit it. The obvious way to write a role-gated policy is
`using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'))`.
On every table but `profiles` that works. On `profiles` itself the policy has to
read `profiles` to decide whether the caller may read `profiles`, which
re-enters the same policy, and PostgreSQL aborts the query with an infinite
recursion error. On Supabase it surfaces as a login that hangs or a role that
reads back null, not as an obvious database error.
**SOLUTION:** One `security definer` function, `public.current_app_role()`, that
reads `profiles` as its owner and therefore bypasses RLS, plus a thin
`public.is_owner()` on top of it. Every policy calls the function instead of
querying the table, so no policy ever re-enters itself. `search_path` is pinned
on both functions so a caller cannot redirect them. RULE: a role-gated policy
never queries the role table inline. It calls the definer function. On
`profiles` the self-read is `id = auth.uid()`, which needs no lookup at all.

### P2-01: a CREATE EXTENSION line that buys nothing and can fail
**Tag:** data
**ERROR:** The migration opened with
`create extension if not exists pgcrypto with schema extensions;`, written out
of habit to guarantee `gen_random_uuid()`. It guarantees nothing that was not
already true and introduces two ways to fail an apply: a project without an
`extensions` schema, and a role without privilege to create extensions.
**SOLUTION:** Deleted. `gen_random_uuid()` has been a core function since
PostgreSQL 13 and every Supabase project runs 15 or later. RULE: every statement
in a migration is a statement that can fail during Ivan's apply. A line that
does not change the outcome is not neutral, it is added risk, and the migration
rule means each failure costs a round trip through a person.

### P2-01: a migration nothing in this repo is allowed to execute
**Tag:** infra
**ERROR:** CLAUDE.md section 8 forbids any terminal here from connecting to a
database, and this machine has no local PostgreSQL. So a 30KB hand-written SQL
file was about to be handed to a person to paste into a production SQL editor
having never been parsed by anything.
**SOLUTION:** Two mitigations, and neither is a substitute for the other. First,
a structural linter that parses the text and executes nothing
(`scratchpad/lint-migration.mjs`): it counts tables against
`ENABLE ROW LEVEL SECURITY` lines, and checks that every policy, index, trigger
and foreign key names a table created in the same file, that every enum column
names an enum created in the same file, and that every `public.fn()` call
resolves. It caught nothing this time and would have caught a renamed table
instantly. Second, the file is wrapped in one explicit `begin` / `commit`, so a
syntax error rolls the whole apply back rather than leaving half a schema
behind. RULE: state the verification limit in the PR rather than letting a green
acceptance line imply the SQL was run. The acceptance here proves the file
exists and the repository typechecks. It does not prove the SQL parses, and
saying so is the difference between a checked file and a trusted one.
