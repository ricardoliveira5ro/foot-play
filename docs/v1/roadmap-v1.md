# FootPlay v1.x — Roadmap

**Status**: `ready for specification`
**Date**: 2026-09-29
**Source**: Brainstorming session with project owner
**Baseline**: v0.2.5 (current working tree)

---

## 1. Overview

v1.x takes Missing Eleven from a single-mode, random-pick trivia loop into a
filterable, multi-difficulty game with a daily puzzle and a shareable result.

Five patch lines, in order: event data foundation → filters → difficulty modes →
daily puzzle → shareable grid.

**Guiding principle:** every patch release is independently shippable and
independently rollback-able. No patch is allowed to leave the deployed app in a
broken state. If a patch has to be reverted in production, reverting that patch
alone must return the app to a working previous version, with no data repair and
no paired rollback.

**What this document is.** It fixes the version map, the boundaries between
releases, and the decisions already taken in the brainstorming session.

**What this document is not.** It contains no per-task specs, no acceptance
criteria, no effort estimates. Detailed specs are authored separately by the
`specifier` agent, one document per patch release, against the boundaries set
here. Where this document says "ships", it means *what the patch is responsible
for* — not *how it is built*.

**Source of truth for current state: the codebase, not the prose.** Where this
document and the code disagree, the code is right and this document is stale.
In particular, **`docs/Project.md` is a pre-implementation design document and
its Database Schema and REST API sections describe a system that does not
exist.** It advertises `POST /api/games`, `PUT /api/games/:id/guess`,
`POST /api/auth/register` and `POST /api/auth/login`, while the backend mounts
only `/api/matches`, `/api/players` and `/api/guess` (`backend/src/app.ts:28-30`).
Its five-filter set (Team / League / Era-Decade / Nation / No Filter) shares
only Team with §4.1, and its difficulty table describes `Hard` as "fewer
attempts" where §5.1 keeps Hard at 6 attempts and gives 3 to Expert.

This roadmap cites `docs/Project.md` three times, and in each case only for
deployment facts or strategy statements (§3.2, §10) — never for the API,
schema, filter or difficulty definitions, all of which are restated here from
the code. A specifier asked "what exists today?" must answer by reading the
code, not by reading either document.

### 1.1 Verified data facts

These were measured against the live database. They are the ground truth this
roadmap is built on; no later spec should re-derive them or contradict them.

| Metric | Value |
|---|---|
| Games | 10,219 |
| Appearances | 218,988 |
| Players | 11,465 |
| Clubs | 479 |
| Competitions | 28 |
| Date range | 2013-07-27 → 2026-06-28 |
| Seasons | 2013–2025 (13 distinct), ~750–870 games/season |
| Games with ≥1 captain row | 9,992 of 10,219 (97.8%) — 19,156 captain rows |
| Games with zero captain rows | 227 |
| `Appearance.goals` / `assists` / `redCards` | **100% zero in the DB** |
| Games with an empty opponent lineup | 530 (5.2%) |
| `Appearance.type` | `starting_lineup` for 100% of rows — zero substitute rows |

On the event columns: the Prisma columns exist with `@default(0)`
(`backend/prisma/schema.prisma:74-76`) but the seed never writes them. Summing
per-player goals for a side reproduces the real team score in only 454 of 10,219
games, and those 454 are exactly the genuine 0-0 draws. The columns are not
partially correct — they are empty.

Empty opponent lineups concentrate in knockout competitions: Champions League
128, FA Cup 110, Europa League 85, Copa del Rey 67, Club World Cup 29.

Games per competition, top 7: Premier League 2,574 · Serie A 1,404 · LaLiga
1,390 · Champions League 1,277 · Liga Portugal 1,209 · Ligue 1 471 · Bundesliga
442. Thirteen of 28 competitions have ≤35 games; four competitions have exactly
one season.

Season field tops out at 2025 while `Game.date` runs into 2026-06-28 — a partial
final season. Whatever the reason, season-based and date-based filters will not
select the same set of games.

## 2. Version map

| Line | Theme | Patches |
|---|---|---|
| v1.0.x | Event data foundation | v1.0.1, v1.0.2, v1.0.3 |
| v1.1.x | Filters | v1.1.1, v1.1.2, v1.1.3, v1.1.4 |
| v1.2.x | Difficulty modes | v1.2.1, v1.2.2, v1.2.3, v1.2.4, v1.2.5 |
| v1.3.x | Daily puzzle | v1.3.1, v1.3.2 |
| v1.4.x | Shareable results grid | v1.4.1, v1.4.2 |

**Reading this map.** The ordering listed is the recommended path: each line
consumes what the previous line established. The owner may run lines in
parallel where they touch different layers — v1.0 is backend/data, v1.4 is
mostly frontend presentation — but the ordering above is the path with the
fewest surprises.

## 3. v1.0.x — Event data foundation

v1.0 turns three columns that exist but are empty into real data, and puts them
on screen. Nothing else in v1.x depends on v1.0 being *complete*; see §3.1.

| Patch | Ships | Rollback point |
|---|---|---|
| v1.0.1 | `game_events.csv` downloaded, parsed and written into `Appearance.goals` / `assists` / `redCards` by the seed. Includes measuring the real dismissal, own-goal and shootout label vocabulary before the mapping is frozen. | v0.2.5 — columns stay at their `@default(0)`, app behaves exactly as it does today |
| v1.0.2 | Event columns exposed on the match/lineup API response; indexes added on `Game.season`, `Game.date`, `Game.targetTeamId` | v1.0.1 |
| v1.0.3 | One football badge per goal and a red-card badge rendered on shirts, with graceful degradation. Event badges align at the left/start of one row; correct/wrong marks align at the right/end after guessing. Hover uses a pointer cursor without lifting the shirt. The **scorers icon is a scored clue** in Easy and Normal (§5.1); the **red-card icon is decoration only, in every mode** (§3.1) | v1.0.2 |

`game_events.csv` is not currently downloaded and is not on disk. It is estimated
at ~1.27M rows / ~170 MB decompressed. Its join key is `game_id` + `player_id`,
which exactly matches the existing `@@unique([gameId, playerId])`
(`backend/prisma/schema.prisma:82`) — **no Prisma migration is needed for the
data itself**; the columns and types already exist.

Note the join is *only* against starting lineups. `Appearance.type` is
`starting_lineup` for 100% of rows, so there are zero substitute rows. A goal
scored by a substitute has no row to join to and is unjoinable. This is a data
limitation, not an implementation gap — see §8.

`Game.season`, `Game.date` and `Game.targetTeamId` are currently unindexed; the
only index on `Game` is `@@index([competitionId])`
(`backend/prisma/schema.prisma:62`, versus `:44`, `:46`, `:49`). v1.0.2 adds
the three missing ones.

### 3.1 Graceful degradation

**The principle:** missing event data renders *no icon*. Never an error, never a
zero-valued icon, never a broken tile.

This is forced by the schema, not chosen for taste. The columns default to `0`,
and `0` is *indistinguishable* from "this player did not score". There is no
`null`, no `unknown`, no provenance flag. So the UI cannot ask "is this data
missing?" — the honest answer is always no.

The consequence is that the icon set degrades **per game**, uniformly across all
22 shirts, not per shirt. If a game was seeded before the re-seed, no scorers
icon appears for anyone. A player who does not score looks identical to a game
with no event data.

**The red-card icon follows the same rule, and carries one extra constraint:
it is decoration, never a clue.** It is not a scored clue in any difficulty
mode and it never affects scoring or the multiplier (§5.1, O5 in §9). That is a
deliberate containment decision, not an accident. The dismissal data behind the
icon is the riskiest thing v1.0 produces — R2, where a literal `Red card` match
silently misses ~2,300 second-yellow dismissals (§3.3) — and a *wrong-looking*
icon is unacceptable in a way that is distinct from, and worse when it stands in
for, a wrong-looking *scoring clue*. So the icon degrades exactly like the
scorers icon: **absent rather than wrong**, and no mode ever keys on it.

This is also what makes v1.0 a *soft* dependency for everything downstream.
v1.2 Easy and Normal use the scorers icon as a clue; on an unseeded game that
clue silently disappears. The modes must therefore render and score correctly
with any subset of clues absent, which is why v1.0.x is **not** a gate on v1.2
(see §11).

### 3.2 Memory constraint

The box is a 4 GB ARM Oracle instance (`docs/Project.md`, deployment section),
shared between the Next.js frontend, the Express backend and PostgreSQL.

**Rule: index the ~219k filtered appearances. Never accumulate a map over the
~1.27M event rows.**

A naive implementation — load every event row for a season, build a
`Map<playerId, events>`, then resolve shirts — runs 130–200 MB of resident
memory for the join alone. Combined with the app, the database and the seed
running on the same instance, that is an OOM, not a slowdown.

The correct shape is to let the database do the join and index the result. The
scaling number to design against is **~219k appearances**, which is what already
fits.

**That rule is written for the request path. v1.0.1's actual exposure is the
seed, and the correct shape there is different.** The seed already streams the
CSVs and holds ~219k appearance rows, so the work it does is
`events ⋈ appearances` on `game_id + player_id` — the same join key the
`@@unique([gameId, playerId])` index already serves. That must be a **streaming**
join: read one event row, match it against the appearances for that game, write
the three columns, move on. It must **never** build a `Map` over all ~1.27M
event rows and hold it in memory waiting to be intersected with the appearance
set. The two paths share a scaling number (~219k) but not a shape, and the
v1.0.1 spec must not inherit the request-path shape by copy-paste (R4, §8).

### 3.3 The dismissal encoding trap

`redCards` is populated from a `description` string field in the source CSV, and
that string is not a clean enum.

Matching on the literal `Red card` catches **3,097 sendings** and silently misses
**~2,300 second-yellow dismissals**. The second-yellow descriptions have
inconsistent double-spacing and roughly a dozen distinct reason variants. Every
one of those is a real sending that the naive matcher drops.

This is the single most dangerous item in v1.0 because it fails **quietly**: the
game still runs, the icons still render, the number is just wrong, and nothing
in the app errors.

Requirements this places on v1.0.1:

- The matcher must be whitespace-tolerant (collapse runs of whitespace before
  comparing). The observed variants differ in spacing, not in substance.
- The variant list must be measured from the actual data, not assumed.
- The matcher must be unit-tested against **every observed variant**, not a
  representative sample. A sample test would pass while ~2,300 rows stayed
  wrong.

### 3.4 Re-seed is an operational gate

v1.0.1 is code-complete when the seed is merged. It is *effective* when the
database has been re-seeded, and that is a separate, manual, operator-triggered
step.

The existing deploy workflow already carries the gate: the `run_seed` input
(`.github/workflows/deploy.yml:33-37`) defaults to `false`, and the seed only
executes under `if: ${{ inputs.run_seed }}` (`.github/workflows/deploy.yml:213`).
`prisma migrate deploy` runs on merge independently
(`.github/workflows/deploy.yml:208`).

So merging v1.0.1 is safe and non-blocking. Until the owner ticks the box, the
app runs unchanged on empty columns, degrading per §3.1.

## 4. v1.1.x — Filters

### 4.1 The four filters

| Filter | Control | Options | Meaning |
|---|---|---|---|
| Team | Multi-select, searchable | Clubs + National teams, grouped | The team you guess |
| Opponent | Multi-select, searchable | Same list | The team they face |
| Competition | Multi-select | 28 competitions | The competition |
| Season | Range (from / to) | 2013–2025 | Inclusive season bounds |

**Team and Opponent are separate dimensions.** Team is the team whose lineup you
are guessing; Opponent is who they are playing against. They are not two views of
the same thing, and selecting a team does not imply an opponent.

### 4.2 Semantics

**OR within a filter, AND across filters.** Selecting three competitions means
"any of these three". Selecting a competition *and* a season range means "any of
these competitions *and* within this range".

**Zero results is a legitimate outcome**, not an error. It gets an explicit
empty state. This matters more than it looks: thirteen of 28 competitions have
≤35 games, so narrow combinations will routinely produce nothing.

**Options are read from the database at runtime.** Season, competition and team
option lists are never hardcoded, so the owner's dataset expansion flows through
automatically with no frontend or backend release.

### 4.3 Deliberately rejected

These were considered and rejected. Recording the rejection so they are not
re-litigated:

| Rejected | Why |
|---|---|
| Greying out options with 0 results | It destroys the whole point of the empty state — it hides the problem rather than explaining it. **Not a cost argument:** v1.1.1 pays the query cost anyway for the post-filter counts (§4.4, §4.5), so the rejection is on UX grounds alone. |
| Home / away filter | Needs a fourth dimension and a new concept in the UI for a distinction most players do not care about. |
| Result filter (e.g. "only games I won") | Meaningless without a user — there is no "I". |
| Minimum-goals filter | Depends on event data that is currently 100% empty (§1.1), and adds a numeric input for a marginal gain. |

### 4.4 Patches

| Patch | Ships | Rollback point |
|---|---|---|
| v1.1.1 | `hasCompleteLineups` predicate; filter-options endpoint returning runtime option lists **and POST-filter counts** (§4.4, §4.5) + autocomplete `name`/`displayName` fix + **widen the frontend vitest include and delete the dead `frontend/vitest.config.mts`** (R7, §8) | v1.0.x |
| v1.1.2 | Filter state encoded in URL query params | v1.1.1 |
| v1.1.3 | Team + Opponent multi-selects, searchable, grouped | v1.1.2 |
| v1.1.4 | Competition multi-select + Season range + empty state | v1.1.3 |

Two constraints carry real weight here:

**`hasCompleteLineups` lands in v1.1.1**, before any filter UI. 530 of 10,219
games (5.2%) have an empty opponent lineup, and the opponent toggle shipped in
v0.2.2. Without the predicate in place first, any filter can select a game that
cannot be completed. v1.1.1 exists to make that structurally impossible rather
than to add a feature.

**The filter-options endpoint must report POST-filter counts**, not raw per-row
counts. The number it reports is the number the empty state has to reconcile
against.

v1.1.2's URL query-param mechanism is built here and reused by the v1.3 shareable
daily link (§6).

### 4.5 Counts: one is required, one is rejected

These are two different things that an earlier draft of this document conflated.
Only one of them is rejected.

**Required — per-option POST-filter counts for every option in the response,
plus a total for the currently-applied filter set.** The filter-options endpoint
returns **a POST-filter count for every option it returns, plus a total count
for the currently-applied filter set**. Both are computed in a **single grouped
query**, at the moment the filter set is applied, and served alongside the
runtime option lists (§4.4). **None of them is recomputed on checkbox toggle** —
the endpoint is re-read when a new filter set is applied, and the counts do not
change while the panel is open in between. The total is what lets the empty
state say "no matches for this filter" as an *explained* outcome rather than a
blank board with no explanation. The per-option counts are static values for the
current filter set, not live probe results, and they are what makes the 0-count
rule below renderable at all. This is what R8 (§8) means by "counts are
POST-filter".

**Rejected — per-option live counts that recompute on every checkbox toggle.**
One count per option, re-queried each time the selection changes. That implies a
second live query on every toggle, and it leaves every number on screen stale
between clicks — a wrong count is worse than no count. This is why
`Live result counts per option` is **not** in the §4.3 rejected table: what was
rejected was never the post-filter count itself, only the per-option recompute.

**A 0-count option IS rendered with its count visible, and is NOT disabled.**
The user can still select it and land in the empty state — that is the intended
feedback, and it is the reason the §4.3 `Greying out` row is rejected on UX
grounds rather than on cost. This case is reachable on day one, not
hypothetical: one of the 25 curated teams currently has zero qualifying games
(R9, §8).

## 5. v1.2.x — Difficulty modes

### 5.1 The four modes

| Mode | Clues | Attempts | Shirt number | Opponent | Multiplier |
|---|---|---|---|---|---|
| Easy | First letter + scorers icon + captain | 6 | Shown | Optional bonus | ×0.5 |
| Normal | Scorers icon + captain | 6 | Shown | Optional bonus | ×1 |
| Hard | None | 6 | Masked `?` | Optional bonus | ×2 |
| Expert | None | **3** | Masked `?` | **Required** | ×3 |

Expert drops to 3 attempts; the other three modes keep the Wordle-standard 6.

**No mode uses the send-off icon as a clue.** The red-card icon rendered from
v1.0.3 is decoration in every mode — shown when present, never scored, never
part of the multiplier (§3.1, O5 in §9). The four clue sets in the table above
are the complete clue inventory; nothing derived from `redCards` is ever scored.

### 5.2 The opponent bonus

The opponent is an **optional scorable bonus** in Easy, Normal and Hard, and a
**hard requirement** in Expert.

**The completion gate is one condition, and the mode table is its only input.** A
game completes when the target half is fully resolved *and* either the mode does
not require the opponent, or the opponent half is resolved too:

```
all.length > 0
  && every target-half shirt is resolved
  && (!DIFFICULTY_CONFIG[difficulty].opponentRequired
      || every opponent-half shirt is resolved)
```

`opponentRequired` is **read from the mode table, never from a comparison against
a mode name**, so a future mode that requires the opponent inherits the gate with
no code change and a new mode that does not inherits its absence. In Easy, Normal
and Hard the condition is already satisfied the moment the last target-half shirt
resolves, so those three modes auto-complete at 11/22 and the flag is load-bearing
rather than decorative. In Expert the Finish action stays **locked until all 22
shirts are resolved**; finishing at 11/22 is not available, because the opponent
lineup is not optional decoration, it is half the puzzle.

The Finish affordance is a **control plus a confirmation**, not a screen: it
appears on the board, states its own unresolved count, and asks the player to
confirm. It is introduced in **v1.2.2** with the mode table that drives it,
confirmed in **v1.2.3** where the third non-Expert mode proves the flag is read
rather than hardcoded, and **asserted absent in v1.2.4** — Expert is the only mode
that renders it, and the assertion is a test, not a comment.

**Surrender is the one way out of the gate, and it costs the bonus, not the run.**
A surrender ends the game with whatever is resolved. In Expert that yields an
11-slot result whenever the opponent half was never touched, and in the other
three modes it means the optional bonus is simply not collected. An untouched
opponent half is therefore **tolerated on every result path** — the surrender
overlay, the GameComplete breakdown, and the §7 share grid. §7's "22, always" for
Expert is a statement about **Finish-locked** results only; a surrendered Expert
result is 11 slots, because surrender does not claim the opponent was played.

The bonus must be **visually labelled as optional** wherever it is optional —
otherwise the UI implies a requirement that does not exist in three of the four
modes. The label reads `opponentRequired` from the mode table, which is **the
same field the completion gate reads** (RD1, §9.1), so the label and the gate are
incapable of disagreeing: one flag, one truth, two consumers. That labelling lands
in **v1.2.5, not earlier**, because "optional" is only a meaningful word once a
mode exists where it is not. Labelling it in v1.2.4, in the same patch that
introduces the mode making it required, buys nothing.

### 5.3 Scoring under a multiplier

The multiplier applies **per shirt**. The GameComplete breakdown therefore still
sums to the displayed total, because the total is derived from the scaled line
items rather than computed separately.

Both sides of the per-shirt calculation are scaled. The two expressions being
scaled are, verbatim from `frontend/src/lib/scoring.ts`:

- **Correct-guess credit** — the attempt-based decay, multiplied:
  `max(1000 − 200 × (attempts − 1), 100)` (`scoring.ts:45`; constants
  `BASE_CORRECT_SCORE = 1000`, `ATTEMPT_PENALTY = 200`, `MIN_CORRECT_SCORE =
  100` at `scoring.ts:22-24`).
- **Failed-guess partial credit** — the letter-based credit, multiplied:
  `round((uniqueCorrectLetters / totalLetters) × 150)` (`scoring.ts:49`;
  `LETTER_SCORE_MAX = 150` at `scoring.ts:25`). The numerator counts **unique**
  correct letters, not the raw correct-letter count across guesses — a repeated
  letter is not counted twice.

A specifier scaling these should scale the two expressions above as-is.
Re-deriving them from the GameComplete UI invites two specific errors: dropping
the `100` floor, and substituting a non-unique letter count for the numerator.
Either would silently change the per-shirt total that the breakdown is supposed
to sum to.

Scaling only the correct branch would mean a failed guess contributes
unscaled points and a lucky hard-mode failure could out-earn a clean easy-mode
win.

### 5.4 Multiplier rationale

**Hard is ×2** because it removes *every* clue *and* the shirt number. The
player has strictly less information than Normal in two independent ways.

**Expert is ×3** because it removes the same clues *and* adds two constraints:
fewer attempts (3 vs 6) and a mandatory opponent. ×2 plus the attempt and
opponent difficulty is worth one more increment; going beyond ×3 would make the
score unreadable next to the other modes.

**Easy is ×0.5** as the symmetric floor — it is strictly more information than
Normal, so it cannot be worth as much.

### 5.5 The captain clue is already paid for

`isCaptain` is populated in the existing data — 19,156 captain rows across 9,992
of 10,219 games (97.8%). **The captain clue needs no new work in v1.0.**

The only captain-related concern is coverage, and it is handled by the
degradation rule in §3.1: the 227 games with zero captain rows render no captain
icon and no error.

### 5.6 Patches

| Patch | Ships | Rollback point |
|---|---|---|
| v1.2.1 | **Token-based reveal migration** — revealed players are matched back to shirts by the opaque `token`, not by `shirtNumber` | v1.1.x |
| v1.2.2 | Easy + Normal modes — Easy: first letter + scorers icon + captain; Normal: scorers icon + captain | v1.2.1 |
| v1.2.3 | Hard mode (clues removed, shirt number masked `?`) | v1.2.2 |
| v1.2.4 | Expert mode (3 attempts, opponent required, Finish locked to 22/22) | v1.2.3 |
| v1.2.5 | Per-shirt multiplier across the scoring breakdown; optional-bonus labelling | v1.2.4 |

**v1.2.1 is a hard prerequisite for v1.2.3.** Hard mode masks the shirt number,
which is impossible while reveal matching keys on the number:
`frontend/app/missing-eleven/page.tsx:45` matches revealed players with
`shirts.find(s => s.shirtNumber === player.shirtNumber && s.state !== 'correct')`.
Once the number is masked, two shirts can carry the same number and that lookup
becomes ambiguous. The migration is to the opaque `token` — the same identifier
already used correctly elsewhere in the same file (`:149`, `:164`, `:170`).

This migration is deliberately first and on its own, so that a regression in
reveal matching is attributable to v1.2.1 rather than to whichever mode shipped
with it.

**Where Hard mode's mask is applied — and that is what makes Rule 4 true.** The
mask is **render-only**, and "render-only" has a specific meaning here: the API
still returns the real `shirtNumber` for every shirt, and the mask never
propagates into stored data or into the payload. That is a requirement, not an
implementation detail — if masking ever reached the payload, the real number
would stop being available to the reveal flow.

The mask is applied **inside the shirt component** and is never written into the
shirt array `page.tsx:45` searches. The component already knows how to hide the
number *by absence*: `Shirt.tsx:225` renders the number only when
`shirtNumber !== null`, and the `?` glyph is an accessible-name convention
(`shirtAriaLabel`, `shirtNumber ?? '?'` at `Shirt.tsx:38`) rather than a stored
or displayed substitute. So `shirtNumber` stays `number | null` in state and the
literal `'?'` is never written into it — an implementer who writes `'?'` into
that field makes `===` in the reveal lookup stop matching at all, silently
breaking the reveal flow.

**Hard mode therefore adds no new ambiguity to the reveal lookup.** The
ambiguity Rule 4 (§11) addresses is **R1(a): the live nullable-`number`
collision**, which is already present in v0.2.5 — two null-numbered players in
the same game collide on `===` today, because `page.tsx:45` keys on
`s.shirtNumber === player.shirtNumber` and `null === null` is true. That is why
v1.2.1 remains a prerequisite: because R1(a) is live in v0.2.5, **not** because
masking would cause it. Until reveal matching moves to the opaque `token`, the
number is still the join key on **both** sides of that comparison, which is why
the rule is a defect rather than a preference.

One consequence an implementer will hit: because the only "mask" available in a
`number | null` field is `null`, implementing Hard mode by nulling the value
would collapse the existing distinction at `Shirt.tsx:225/249/254` between
"hidden by Hard mode" and "no number in the DB". The component-level mask, not
a null write, is the intended design.

## 6. v1.3.x — Daily puzzle

### 6.1 Rules

Strict Wordle-style, no concessions:

- **Today's puzzle only.** You can play the current day's game.
- **Miss a day and the streak resets.** No catch-up, no playing yesterday, no
  partial completion counting retroactively.

### 6.2 Daily is a mode, not a filter variant

Daily is a **button / section alongside the difficulty modes**. It is not another
option inside the filter panel, and it **ignores filters entirely**.

This matters structurally: if daily were a filter variant, "daily" would compose
with every filter and the selection question becomes "daily *under my current
filter settings*", which is a different puzzle for different people and cannot
be shared or compared.

Because daily and difficulty are **orthogonal axes** — daily or not, and which
difficulty — a daily result is only meaningful alongside its difficulty. That is
why the v1.4 share text carries the mode (§7).

The shareable link **reuses the URL query-param mechanism already built in
v1.1.2** (§4.4). No new link format is introduced.

### 6.3 Patches

| Patch | Ships | Rollback point |
|---|---|---|
| v1.3.1 | Deterministic daily game selection + daily entry point + `?daily=` shareable link. Pure logic, **no persistence**. | v1.2.x |
| v1.3.2 | Streak tracking (current + longest) + already-played-today state. **First write to localStorage in the project.** | v1.3.1 |

**The hydration constraint applies to every storage read.** localStorage was
explicitly removed from this codebase to fix a hydration mismatch. Any v1.3.2
read must not render differently between server and client on first paint, or
that regression comes straight back.

This is also why v1.3.1 is split from v1.3.2: v1.3.1 is deterministic pure logic
that can be shipped and verified with zero storage concerns, so the storage
surface enters the codebase in exactly one patch.

## 7. v1.4.x — Shareable results grid

| Patch | Ships | Rollback point |
|---|---|---|
| v1.4.1 | Result rendered as a text / emoji block: **one slot per shirt in scope for that result**, plus score and mode | v1.3.x |
| v1.4.2 | Copy-to-clipboard + the composed share text | v1.4.1 |

**The block's shape is "one slot per shirt in scope for that result", not a
fixed 11.** The four cases are:

| Case | Slots | Why |
|---|---|---|
| Easy / Normal / Hard, opponent not attempted | 11 | The opponent half is out of scope for that result |
| Easy / Normal / Hard, opponent attempted | 22 | The opponent half is in scope and renders alongside the target half |
| Expert, finished | 22, always | Finish stays locked until all 22 are resolved (§5.2), so a **Finish-locked** Expert result cannot end at 11 |
| Expert, surrendered, opponent untouched | 11 | Surrender ends the run without the gate ever passing (§5.2), so an untouched opponent half is out of scope exactly as it is in Easy |

Row 4 is about a **surrendered game whose opponent half was never touched**, and
that qualifier is load-bearing rather than decorative: an Expert game surrendered
*after* putting attempts into the opponent half has `opponentAttempted === true`
and renders **22 slots**, by the same rule as row 2. Nothing about the mode
decides it, and nothing about the surrender either. What makes row 4 true is
solely that the player never opposed anyone.

The single condition behind all four rows is `opponentAttempted` — the opponent
half is in scope when the player put at least one attempt into it (ratified
decision, §9.1, RD4). A surrendered Expert game and a Normal game the player never
opposed are the same case, and the grid treats them identically; that is the
point of deriving the flag from the shirts instead of the mode.

11 is therefore a **special case** of the rule, not the definition of the block.
The score and the mode are carried in **all four** cases — the mode is what
makes the score comparable (§6.2).

**Un-resolved slots are rendered empty or greyed, never omitted.** A slot
belongs to the grid once its shirt is in scope; what varies is whether that
shirt was resolved, not whether the grid has a place for it. Omitting slots
would make a deliberately 11-slot Easy result indistinguishable from an Expert
result that resolved only 11 shirts — which is exactly the confusion the mode
label exists to prevent.

**Shareable scope: any completed game, not only the daily one.** The block
renders for whatever result the player is looking at, whether it came from the
daily puzzle or from an ordinary filtered game. The daily puzzle is the
**primary use case** — it is the result people have an incentive to broadcast,
and the only one whose link is stable enough for a recipient to play (§6.2) —
but restricting the block to it would be an arbitrary limit on a renderer that
works on any completed game. The scope is a superset and costs nothing extra:
the same component and text format serve both, because filters already live in
the URL query params (§4.4) and a non-daily result carries them exactly the way
the daily link carries `?daily=`.

**Ordering rationale.** v1.3 ships something coherent on its own — a daily
puzzle with a streak is a complete feature, and v1.3.1 and v1.3.2 are both
independently useful. v1.4 is the **viral amplifier**, not a prerequisite. If
v1.4 slipped, the daily puzzle would still be a finished product; the reverse is
not true, because a share text without a shareable link and a mode has nothing
to describe.

## 8. Cross-cutting risks

| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | **Token reveal dependency.** Reveal matching keys on `shirtNumber` (`frontend/app/missing-eleven/page.tsx:45`), and that key is **not** unique — for two independent reasons | A revealed player can be applied to the wrong shirt. **(a) Nullable `number`, live today:** `Appearance.number` is `Int?` (`backend/prisma/schema.prisma:70`) and `matchService.ts:118` sorts with `nulls: 'last'`, so null numbers are an expected state, not an edge case — two null-numbered players in one game collide in **v0.2.5, already**. **(b) Masked `?`, prospective:** Hard and Expert render unresolved numbers as the same literal, so the same collision returns across many shirts | v1.2.1's migration to `token` resolves **both** causes at once, because `token` is unique by construction and is independent of `number`. v1.2.1 lands first, as an isolated patch (§5.6) |
| R2 | **Second-yellow dismissal trap.** Literal `Red card` matching misses ~2,300 sendings | Wrong data, **no error** — the most dangerous failure mode in v1.0 | Whitespace-tolerant matcher, unit-tested against every measured variant (§3.3) |
| R3 | **Unjoinable substitute goals.** `Appearance.type` is `starting_lineup` for 100% of rows; zero substitute rows | Goals by substitutes cannot be joined to a shirt. Permanent, not fixable in v1.x | Documented as a known limitation; scorer counts are best-effort |
| R4 | **4 GB ARM memory.** Accumulating a map over ~1.27M event rows costs 130–200 MB | OOM on the shared instance | **Owned by v1.0.1**, which is where the exposure actually is — the seed streams the CSVs and writes ~219k appearance rows, so it needs a streaming join, never a map over the raw event set (§3.2). **This authorises no `Appearance` indexes:** those are v1.0.2's budget, and its index list is closed at `Game.season`, `Game.date`, `Game.targetTeamId`. A specifier must not read this mitigation as licence to add indexes beyond that list |
| R5 | **227 games with no captain row** (2.2%) | Captain clue absent for those games | **No work required — owned by nobody, deliberately.** Fully covered by the degradation rule (no icon, no error, §3.1), and §5.5 states the captain clue needs no v1.0 work. Recorded for completeness, not as a defect risk |
| R6 | **Autocomplete `name` / `displayName` mismatch.** Search queries `Player.name` (`backend/src/services/playerService.ts:6-9`) and returns `p.name` (`:16`), while the Wordle answer is evaluated against `displayName` — in production via `displayName ?? name` (`backend/src/services/matchService.ts:111`); the `USE_MOCK` branch shows the same asymmetry at `frontend/lib/api.ts:92`. 92% of players mismatch; for 19% the display name is not even a substring of the name | Autocomplete can suggest a name that is not the answer | Owned by v1.1.1, which ships the `name`/`displayName` fix (§4.4) — in place before difficulty modes, where wrong suggestions are costlier |
| R7 | **Frontend vitest include is `src/**` only** (`frontend/vitest.config.ts:16`) | **Tests are silently not collected** — not a missing directory, a missing *suite*. A test file outside the include is never run and never reported: it can be broken, or not exist at all, and the suite still reports green. Today that is `frontend/components/**` (v1.1.1's `Shirt.colors.test.tsx` is the proof) and, from v1.1.2 onward, it would also be `frontend/app/**` — three test files live there (`FilterUrlSync.test.tsx`, `page.test.tsx`, `page.hydration.test.tsx`) and **none** of `src/**`, `components/**` or `tests/**` matches them | **Owned by v1.1.1** (§4.4), which already ships the `name`/`displayName` harness-accuracy fix. The remedy is to **enumerate** the roots, not to "widen past `src/**`": the include must list `src/**`, `components/**`, `tests/**` **and `app/**`**, because the last one is a Next.js App Router convention, not something a reader infers from the others. v1.1.1 also deletes the dead `frontend/vitest.config.mts`, which is never read because the `.ts` one resolves first (`CONFIG_NAMES × CONFIG_EXTENSIONS` resolve in order and the first hit wins, so `vitest.config.ts` is the effective config), so there is only one source of truth. This lands *before* the UI-heavy patches that would rely on component coverage — v1.1.2, v1.2.2–v1.2.5 and v1.4.1–v1.4.2 |
| R8 | **Empty filter results are common.** 13 of 28 competitions have ≤35 games; 4 have exactly one season | Narrow filter combinations legitimately produce nothing, and will look like a bug | Explicit empty state is in scope for v1.1.4; the counts shown — the per-option POST-filter counts and the total for the applied filter set — are POST-filter and computed once per applied filter set, never recomputed on toggle (§4.4, §4.5). Per-option counts that recompute on every toggle are rejected (§4.3) |
| R9 | **Option lists shift with the dataset.** The seed is gated by a 25-team curated whitelist (`scripts/curated-teams.json`, duplicated in `frontend/lib/curatedTeams.ts:8`) and the owner is actively expanding it — 24 of the 25 currently have qualifying games (17 clubs at ~550–660 games each; the 8 national teams at 3–9 each) | Hardcoded option lists go stale silently and ship filters that select nothing | All option lists read from the DB at runtime (§4.2). The whitelist is assumed to grow |

Coverage context for R7: the backend has a real gate — 95% on all four metrics
(`backend/vitest.config.ts:26-30`). The frontend has no coverage gate at all
(`frontend/vitest.config.ts` defines no `thresholds`), so nothing forces the
include to be widened.

**Budget for a pre-existing failure when widening the include.**
`frontend/components/Shirt.colors.test.tsx` has **never been executed**,
because it was never collected. The first run after widening the include may
therefore surface a failure in it. That is a pre-existing defect being made
visible, not a regression introduced by the widening, and v1.1.1 should fix or
deliberately quarantine it — re-narrowing the include to keep the suite green
is not an acceptable outcome.

## 9. Open decisions (defaulted)

Five items are not closed. Each has a working default so that specification can
proceed, and each is **revisable** without unwinding the roadmap — none of them
change the version boundaries. **O1 has since been ratified** and is now carried
in §9.1 as a closed decision; the remaining four are still open.

| # | Open question | Default | Revisable because |
|---|---|---|---|
| O1 | **Streak scope.** One streak per day, or one per (day, difficulty)? | **Ratified — closed as "one result per day, global across difficulties."** See §9.1, row RD3. The rationale below is retained as the record of why the alternative was not chosen | The alternative was defensible. It is **mostly** contained inside v1.3.2 — the streak key is one field — but the per-(day, difficulty) key also changes v1.3.2's already-played-today state, which is owned by the same patch, and it changes the v1.4 share text, which carries the mode in order to disambiguate a result (§6.2). The **boundaries** are unaffected: every touchpoint already sits inside v1.3.2 or v1.4, so the headline claim holds. What changes is the amount of work, not which patches are involved |
| O2 | **Re-seed vs daily history.** A re-seed changes the dataset and therefore the daily selection | **Accepted as documented known behavior, not as a caveat to resolve.** A re-seed can change or remove the daily puzzle for a given day, so a day a player cannot reach is a day that gets missed and the streak breaks on their next completion. The streak arithmetic is pure day-key arithmetic and is itself unchanged; the shift is in which puzzle a day resolves to. Owned by v1.3.2's Risks table and pinned by its tests | Operational, not architectural |
| O3 | **Shootout goals.** Do penalty-shootout goals count? | **Do not count** | Depends on what the measured labels actually say — v1.0.1 measures the dismissal, own-goal and shootout label vocabulary before the mapping is frozen (v1.0.1 patch row, §3) |
| O4 | **Own goals.** Attribute to the scoring player or to the team? | Attribute to the scoring player (the `player_id` on the event row) | **Provisional, and revisable.** Revisit in v1.0.1 if the measured event label indicates own goals are recorded against a different player or not at all; the columns are empty today (§1.1), so the default cannot be confirmed from the data until v1.0.1 measures it |
| O5 | **Yellow cards as a clue.** | **Yellow cards are not a clue in any mode.** The send-off icon is a visual decoration only and is not a scored clue in any mode — see §3.1 | Yellow cards are near-universal at the top level and would make Easy trivially solvable. The send-off icon is deliberately excluded from scoring because the dismissal data behind it is the known-risky part of v1.0 (R2, §3.3): a wrong-looking icon is tolerable, a wrong-looking scoring clue is not |

### 9.1 Ratified decisions

**This table is authoritative.** Every line's plans and overviews link here, and a
plan **verifies** the ratified answer — it never re-decides it. Where a plan and
this table disagree, the table wins and the plan is a defect to be corrected, not
an escalation to be resolved locally. A genuinely new question that this table
does not cover is still an escalation; a question this table *does* cover is not.

**Row IDs are prefixed `RD`, and the prefix is load-bearing.** §8's cross-cutting
risks are `R1`–`R9`; this table's decisions are `RD1`–`RD12`. The two namespaces
never share an ID, because both §8 and §9.1 are cited by ID throughout v1.0–v1.4
and a bare `R7` that resolved to the wrong table would produce a wrong verdict —
not a wording problem, but a wrong answer about whether a risk is owned or a
decision is settled. Cite a decision as `RD#` and a risk as `R#`.

**Escalation IDs `E1`–`E5` are a third namespace, and they restart per line.**
Each version line's specifier handoff numbers its own escalations from `E1`
independently, so one `E#` names different questions in different lines:
**v1.3's `E1`** is the `GameFilters` / `GameFilterParams` naming question
(`v1.3/overview.md:78`), while **v1.4's `E1`** is the share-grid scope condition
ratified below as RD4. RD4–RD8 are the v1.4 series and each row says so; v1.3's
series appears nowhere in this table, so a v1.3 `E#` never resolves here. Cite an
escalation with its line — `v1.4 escalation E1` — and keep citing a decision as
`RD#` and a risk as `R#`.

**How a plan may use this table.** A Task 0 (or Task 1, where the preflight is
numbered that way) preflight **verifies** that a row has been honoured by the
patch that owns it — it checks the artifact and records what it found. It may not
re-decide, re-interpret, or "improve upon" a row: a plan that finds itself
disagreeing with this table has found a **defect in the plan**, and correcting the
plan is the fix. Treating a row here as an open question is itself the error this
section exists to prevent, because a preflight has no authority to settle it and a
local "sensible" answer propagates into shipped behaviour.

| # | Ratified decision | Answer | Owning patch |
|---|---|---|---|
| RD1 | **Opponent completion gate.** Is the opponent half required to complete a game? | One condition for all four modes: `all.length > 0 && all target-half shirts resolved && (!DIFFICULTY_CONFIG[difficulty].opponentRequired \|\| all opponent-half shirts resolved)`. `opponentRequired` is read from the mode table, never compared against a mode name. Easy/Normal/Hard auto-complete at 11/22; Expert is Finish-locked at 22/22 (§5.2). The Finish affordance is a control plus a confirmation, introduced in v1.2.2 with the table that drives it, confirmed in v1.2.3, and asserted absent in v1.2.4 | v1.2.2, v1.2.3, v1.2.4; the `optional bonus` label that reads the same flag lands in v1.2.5 |
| RD2 | **Surrendered Expert result.** Does the §7 grid hold 11 or 22 slots after an Expert surrender? | **11.** Surrender never passes the gate, so an untouched opponent half is out of scope exactly as in Easy. "22, always" in §7 is scoped to **Finish-locked** results. Skipping the opponent forfeits the §5.3 optional bonus, never the run | v1.2.4, v1.4.1 |
| RD3 | **Streak scope** (was O1). One streak per day, or one per (day, difficulty)? | **One result per day, global across difficulties.** `playedKeys` gates by day, not by (day, difficulty); `STORAGE_KEY = 'footplay.daily.v1'` is the containment seam. §6.2 treats daily and difficulty as **orthogonal axes**, so a daily streak answers only "did you play today"; a per-difficulty streak would penalise a player for choosing Easy. A re-seed may shift or break a streak, and that is **accepted, documented known behavior** (O2), not a defect | v1.3.1 (the orthogonality it rests on), v1.3.2 |
| RD4 | **E1 (v1.4 escalation) — share-grid scope condition.** Does the grid use `opponentRequired`, `opponentAttempted`, or both? | **`opponentAttempted` alone**, derived as `opponentShirts.some((shirt) => shirt.attempts > 0)` and never stored. Deriving it from the shirts is what makes RD2 fall out for free and what keeps the flag from going stale. The mode-table property test over `opponentRequired` is **retained** as a guard on the table, not as the grid's condition | v1.4.1 |
| RD5 | **E2 (v1.4 escalation) — position-order source of truth.** Is a shared `positionOrder.ts` module created, and is the anchor name-based or index-based? | **Yes.** Extract `POSITION_ORDER` and `getPositionLabel` to `frontend/src/lib/positionOrder.ts`. Retain the **name-based** anchor with the **grep fallback** (L-3) — no positional lookup | v1.4.1 |
| RD6 | **E3 (v1.4 escalation) — `vitest.config.mts`.** Does it shadow `vitest.config.ts`? | **No.** `frontend/vitest.config.ts` is the config that runs; the `.mts` file is **dead, not shadowing**, which is a cleanup, not a fix for a shadowing bug | v1.1.1; v1.4.1 and v1.4.2 verify only |
| RD7 | **E4 (v1.4 escalation) — `hasPlayed` gating the clipboard action.** Does the share button read `hasPlayed`? | **No.** There is **no `hasPlayed` gating**; the share control appears on the completion overlay whenever one is shown. The clipboard path performs **no `localStorage` read at all**, so there is no hydration-order dependency to get wrong | v1.4.2 |
| RD8 | **E5 (v1.4 escalation) — `renderShareText` ships uncalled.** Is an uncalled export acceptable? | **Yes, deliberately.** v1.4.1 ships `renderShareText` uncalled as its **rollback boundary**; the first use is v1.4.2 Task 5.2. Until then `frontend/src/lib/shareGrid.ts` is **byte-for-byte unchanged** by v1.4.2 | v1.4.1, v1.4.2 |
| RD9 | **`LineupPlayer` shape.** Which fields does the frontend lineup type carry? | `goals`, `assists`, `redCards`, `isCaptain` — all **required**, added in v1.0.2 on both halves in one commit. Backend and frontend never disagree; v1.2 builds on these names and does not rename them | v1.0.2 adds them; v1.2.2 is the first consumer in v1.2 |
| RD10 | **`completeLineupsWhere` return type.** `Prisma.GameWhereInput` or `Prisma.Sql`? | **`Prisma.Sql`**, in `backend/src/lib/lineupCompleteness.ts`. The frozen `GameWhereInput` signature is unimplementable in Prisma 7 and shipping a weaker predicate would be a silent correctness hole. The **name is preserved**; only the return type is corrected | v1.1.1 defines it; v1.3.1 is the next consumer |
| RD11 | **`ParsedEventType.assist`.** Does the union carry an `assist` member? | **Yes, and the API never sends it.** That is why `ParsedEventRow` carries a separate `isAssist: boolean` and the seed maps the literal `'assist'` marker onto it. `classifyEvent` does **not** emit `'assist'`; reading the union as if the API populated it is the trap | v1.0.1 |
| RD12 | **Dataset download timeout.** `axios.get` `timeout` for the data zip. | **`600000` ms**, raised from the current `120000` in `scripts/src/download-data.ts:18`. The single response grows by ~170 MB decompressed, so 120 s is a coin flip on a cold origin, not headroom | v1.0.1 |

## 10. Out of scope for v1.x

| Excluded | Note |
|---|---|
| New games | Guess the Formation, Transfer Links, Career Path and Kit Quiz all remain **unplanned**. `docs/Project.md` lists them as future games; v1.x does not schedule any of them |
| User accounts, auth, sessions | There are **no users, sessions, or auth** in the codebase today. Nothing in v1.x introduces them |
| Server-side persistence | **None.** All game state stays client-side in the existing `useReducer`. The only client-side storage added in v1.x is the v1.3.2 streak and already-played-today state |
| Ad implementation | Monetization is "ad-supported" in `docs/Project.md`; that is a strategy statement, not scheduled work |
| Monetization work | Same |
| Multiplayer, leaderboards | Requires persistence and identity — both excluded above |
| Curated team whitelist | **No change.** The owner is expanding the dataset themselves, separately |
| Own-goal attribution | **Not a separate work item.** Follows the O4 default — attribute to the `player_id` on the event row — and is revisited in v1.0.1 if the measured event label disagrees (§9, O4) |
| `/missing-eleven` player naming and player rating | **Decided out of v1.x, not merely absent.** No patch table in this roadmap assigns it: §3 (v1.0.x), §4.4 (v1.1.x), §5.6 (v1.2.x), §6.3 (v1.3.x) and §7 (v1.4.x) each ship something else, and none of them mentions naming or rating. An earlier draft routed it to "v1.1.3", which is wrong twice over — §4.4 defines v1.1.3 as the Team/Opponent multi-selects, and no patch assigns this work at all. **The reason it is decided out is that it is unowned and outside v1.x scope — not that it was assessed and rejected on merit.** Adopting it later requires **a new patch with its own plan**, not a slot added to an existing patch: an existing patch does not do this work, so a task assigned to one would enter an implementer's queue with no plan behind it |

## 11. Sequencing constraints

Hard ordering rules. Violating any of these is a defect, not a preference.

| # | Rule |
|---|---|
| 1 | **v1.0.1 before v1.0.2.** No data, no columns to expose. |
| 2 | **v1.1.1 before any filter UI.** `hasCompleteLineups` must exist first, so no filter can select an unplayable game (530 games have an empty opponent lineup). |
| 3 | **v1.1.2 before v1.1.3/v1.1.4.** Filter state is URL-encoded before controls are built. |
| 4 | **v1.2.1 before v1.2.3.** The token reveal migration must land before Hard mode can mask shirt numbers. |
| 5 | **v1.2.5 after v1.2.4.** Optional-bonus labelling only means something once a mode exists where the bonus is mandatory. |
| 6 | **v1.3 before v1.4.** The share text has no mode and no **daily link** to describe without the daily puzzle. |
| 7 | **v1.0.x is NOT a gate on v1.2.** Because of graceful degradation (§3.1), an unseeded database renders a smaller clue set rather than a broken one. Modes must ship and score correctly with clues absent. |
| 8 | **v1.3.2 owns all localStorage access.** v1.3.1 is pure logic. One patch introduces the storage surface so the hydration constraint has exactly one blast radius. |

**How to read the `Rollback point` column.** Every patch table in this document
carries one. It names the last-known-good state to restore if that patch is
reverted in production, computed from the §2 recommended order. It is
**relative, not absolute**: within a line it points at the previous patch; at a
line's first patch it points at the previous *line*'s last patch, and a
line-valued target like `v1.0.x` resolves to the **highest shipped** patch in
that line — `v1.1.1` → `v1.0.x`, `v1.2.1` → `v1.1.x`, `v1.3.1` → `v1.2.x`,
`v1.4.1` → `v1.3.x`.

It is a **rollback target, not a dependency claim**. Rule 7 is the standing
exception that proves the distinction: v1.2 may begin before v1.0 is complete,
and its rollback target still reads `v1.1.x`.

---

## Notes on this document

- Release tooling already accepts full semver: `VERSION_PATTERN =
  /^v\d+\.\d+\.\d+$/` at `scripts/src/release.ts:8`. No tooling change is needed
  to cut any patch in this roadmap.
- No effort estimates appear here by design. They belong in the per-patch specs,
  where they can be based on an actual scope rather than a roadmap summary.
- All quantitative claims trace to the measured facts in §1.1. Claims about the
  dismissal reason variants ("roughly a dozen") come from the brainstorming
  session and are **not independently verified**; v1.0.1 is expected to produce
  the real list.
