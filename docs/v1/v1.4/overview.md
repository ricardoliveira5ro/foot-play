# v1.4 — Shareable results grid (overview)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a finished Missing Eleven game into something a player can send to someone else — an emoji block with one slot per shirt in scope for that result, the mode and score that make it comparable, and a link that replays the same puzzle.

**Architecture:** One pure module, `frontend/src/lib/shareGrid.ts`, owns the entire share contract: scope, ordering, glyphs, the block text and the composed payload. It has no React and no DOM, so it is testable in the default `node` environment and importable from anywhere. `GameComplete.tsx` is a consumer and nothing more — it derives one boolean, builds the grid, and drops the text into a selectable `<pre>`. v1.4.1 ships that and stops. v1.4.2 adds a Copy button that reads the address bar at click time and hands the string to `navigator.clipboard`, leaving the pure module byte-for-byte untouched so the v1.4.1 rollback point still holds.

**Tech Stack:** TypeScript, Next.js 16 App Router, React 19, Tailwind 4, Vitest + jsdom + Testing Library (frontend only — no backend change in either patch).

---

> **Ratified decisions are not decided here.** Roadmap [§9.1](../roadmap-v1.md#91-ratified-decisions) is authoritative for every decision the owner has closed; a plan's preflight **verifies** the ratified answer and never re-decides it. Where a plan and that table disagree, the table wins and the plan is the defect. A question the table does not cover is still an escalation.

---

## The two patches

| Patch | What lands | Files it adds | Rollback to |
|---|---|---|---|
| **v1.4.1** — `plan-v1.4.1-share-grid.md` | The position table extracted to `frontend/src/lib/positionOrder.ts` so two consumers cannot drift; `buildShareGrid` (scope, order, outcome), `renderShareGrid` (block + tally), `renderShareText` (composed payload); the block rendered in the game-over dialog between the match summary and Play Again. **No clipboard, no button, no storage.** | `frontend/src/lib/positionOrder.ts`, `frontend/src/lib/shareGrid.ts`, 2 frontend test files | v1.3.x |
| **v1.4.2** — `plan-v1.4.2-clipboard-share.md` | A `Copy result` button and a `role="status"` confirmation, both inside the share block; the link read from `window.location.href.split('#')[0]` at click time; a persistent failure message and a transient `Copied`. **The pure module is not edited.** | none — 2 existing files | v1.4.1 |

**Rollback chain is strict and one-directional:** v1.4.2 → v1.4.1 → v1.3.x. All three reverts are pure code reverts — no migration, no seed change, no data repair, no stored state. Reverting v1.4.2 leaves the block on screen and selectable with no copy control, which is a complete feature on its own. Reverting v1.4.1 leaves the dialog exactly as v1.3 shipped it.

---

## Line counts

| File | Lines |
|---|---|
| `docs/v1/v1.4/plan-v1.4.1-share-grid.md` | 1307 |
| `docs/v1/v1.4/plan-v1.4.2-clipboard-share.md` | 819 |
| `docs/v1/v1.4/overview.md` | this file |

---

## The block's shape, and why it is not 11

Roadmap §7 fixes the rule: **one slot per shirt in scope for that result**, with 11 as a special case rather than the definition.

| Case | Slots | Why |
|---|---|---|
| Easy / Normal / Hard, opponent not attempted | 11 | The opponent half is out of scope for that result |
| Easy / Normal / Hard, opponent attempted | 22 | The opponent half is in scope and renders alongside the target half |
| Expert, finished | 22, always | Finish stays locked until all 22 resolve (§5.2), so a **Finish-locked** Expert result cannot end at 11 |
| Expert, surrendered, opponent untouched | 11 | Surrender ends the run without the gate passing (§5.2, RD2), so an untouched opponent half is out of scope exactly as in Easy |

All four rows fall out of the single condition `opponentAttempted` (§9.1, RD4) — which is
why the third and fourth rows cannot be distinguished by asking the mode. A surrendered
Expert game and a Normal game the player never opposed are the same case. Row 4's
qualifier is load-bearing: an Expert game surrendered *after* attempts went into the
opponent half is **22 slots**, by the same rule as row 2.

`buildShareGrid` counts the shirts it is handed. It does not pad to 11, truncate to 11, or special-case the length — the 11 and 22 above are what the real call sites produce, and a three-shirt half yields three slots. A test pins that, so a future "always pad to 11" change fails loudly instead of silently making a short lineup look complete.

**Un-resolved slots are rendered, never omitted.** A slot belongs to the grid once its shirt is in scope; what varies is whether that shirt was resolved. Omitting them would make a deliberately 11-slot Easy result indistinguishable from an Expert result that resolved only 11 shirts — the exact confusion the mode label exists to prevent. So a shirt in scope with no resolution still gets a slot, and a grid with no slots at all still renders its tally line.

**Score and mode ride along in all four cases.** The mode is what makes the score comparable (§6.2); a bare number across four multipliers is not a result anyone can argue about. Both are read from `DIFFICULTY_CONFIG` — the module never names a mode, so a future fifth mode is handled by the table rather than by a branch someone has to remember to add.

---

## Three decisions worth stating up front

**Two glyphs, not three.** `🟩` (`U+1F7E9`) is a correct shirt; `⬛` (`U+2B1B`) is everything else. There is no `🟨`, and that is a decision rather than an omission. `SlotOutcome` is frozen to `'correct' | 'failed'`, so a yellow slot would have to be a *failed* slot wearing a colour that claims "close" — a third look with no third meaning. `ShirtState` really does have four members (`'default' | 'in-progress' | 'correct' | 'failed'`), and the mapping is deliberately lossy: `correct` is the only claim the grid makes, and `'default'` and `'in-progress'` render as `failed`. Throwing would let a refactor that surfaced the grid mid-game take down the dialog; omitting would break the never-omitted rule above. `⬛` is the honest rendering of "did not get solved", and because the block is a fixed-emoji monospace grid, both rows align regardless of the glyph's ink coverage.

**`opponentAttempted` is derived, never stored.** `GameComplete` passes `opponentShirts.some((shirt) => shirt.attempts > 0)`. This flag is the whole reason the 11/22 split works, and getting it from anywhere else breaks a real case: a **surrendered** game in Normal has an opponent half sitting in state that was never played, and `state !== 'default'` would misclassify that as a 22-slot result the player never attempted. Deriving it from the shirts means it cannot go stale, needs no reducer change, and adds no `GameState` field. It is also the **only** scope input: `opponentRequired` is not read by the grid at all, because a surrendered Expert game has the flag set and nothing attempted (RD4).

**No `document.execCommand('copy')` fallback, on evidence.** The obvious fallback is dead code here, and shipping dead code as a safety net is how the next reader ends up maintaining two copy paths:

| Environment | Secure context? | Clipboard API |
|---|---|---|
| Production — `nginx/conf.d/default.conf` terminates 443 and redirects 80 → 443 | yes | present |
| `npm run dev` on `http://localhost` | yes — `localhost` is secure by spec | present |
| jsdom (the tests) | no | absent |

So the only environment where the API is missing is the test environment. The fallback that *is* worth having is the visible one: on failure the block stays on screen, stays `select-text`, and says `Copy failed — select and copy manually` in words. That covers every real case the legacy API would have — denied permission, a blocked write, a frame without `allow="clipboard-write"` — because the text is already on screen and already selectable. The v1.4.2 preflight re-checks the nginx config, and escalates rather than shipping a silently-failing control if the app is ever reachable over plain HTTP.

---

## Scope: any completed game, not only the daily

§7 requires the block to render for whatever result the player is looking at, and §11 rule 6 makes v1.3 a hard predecessor. Both are satisfied by the same decision: **v1.4.2 copies the address bar verbatim and never reconstructs a URL.** The path and query are read at click time, so a filtered game shares exactly as a daily one does, with no branch on `isDaily` and no second writer for the params. v1.3.1's `FilterUrlSync` remains the only component that writes them; a component that rebuilt a URL from filter objects would be a second source of truth, and it would re-emit `2023/24` without the browser's percent-encoding — which is why a test pins the copied string to the exact encoded form.

The fragment is dropped. It is never sent to the server and is not part of a replayable link, so a shared URL should not carry the recipient's own anchor.

---

## Ratified decisions applied

These were raised as escalations in the two plans' Task 1 preflights and have since
been **ratified by the owner**. The authoritative record is roadmap **§9.1**; this
table is a pointer, not a second source of truth. None was resolved by renaming
anything.

| # | Question raised | Ratified answer | Where it lands |
|---|---|---|---|
| **E1** | Does the share grid's scope condition read `opponentRequired`, `opponentAttempted`, or both? | **`opponentAttempted` alone.** `opponentRequired` is **dropped** from the grid condition. When the opponent is required it was necessarily attempted, so the derived flag is sufficient — one flag, one meaning. | `plan-v1.4.1-share-grid.md`, Task 3 |
| **E2** | Is `POSITION_ORDER` copied into a second file, or extracted? | **Extracted**, to `frontend/src/lib/positionOrder.ts`. The component's copy is deleted, so two consumers cannot drift. | `plan-v1.4.1-share-grid.md`, Task 2 |
| **E3** | Does `vitest.config.mts` shadow `vitest.config.ts`? | **No — it is dead, not shadowing.** `vitest.config.ts` wins on vitest 5.0.0's resolution order (`CONFIG_NAMES × CONFIG_EXTENSIONS`, first hit wins) and the `.mts` is never read. v1.1.1 deletes it, which is a cleanup. | `plan-v1.4.1` Task 1, `plan-v1.4.2` Task 1 — both **verify** only |
| **E4** | Does the copy control gate on v1.3's `hasPlayed(streak, todayKey)`? | **No.** No gating code, and the clipboard path reads no storage at all. | `plan-v1.4.2-clipboard-share.md`, Global Constraints |
| **E5** | Is `renderShareText` shipping in v1.4.1 with no caller acceptable? | **Yes, deliberately.** It is the rollback boundary: v1.4.2's whole job is to call it, so the module stays byte-for-byte unedited. | `plan-v1.4.1` Task 4, `plan-v1.4.2` Step 5.2 |

**The stale-alarm behind E3 is resolved.** The earlier framing here said v1.2.2's
Global Constraints "assert the opposite, that the `.mts` file is the effective config".
That argument was **wrong and has been removed from both places**: v1.2.2 already
states correctly that the `.mts` is dead and never read. There was never a
disagreement between v1.2.2 and v1.4 on this point — only this overview's
misreading of it.

**E1's resolution is a correction, not a clarification.** The earlier framing here
argued that `opponentRequired` carries two meanings but that the reuse is "correct
today", because for Expert the two flags coincide and for the other three modes both
are false. That reasoning missed the case that matters: a **surrendered** Expert game
has `opponentRequired: true` and `opponentAttempted: false`. Under the old condition
that game rendered 22 slots for a half the player never touched. Reading the mode
answered a question about the **mode** when the question is about the **play**.

**Streak scope is settled.** roadmap §9.1 RD3 ratified one streak per day, global
across difficulties. The tally line still carries the mode label out of
`DIFFICULTY_CONFIG` — not to disambiguate a streak, but because §6.2 makes a score
meaningless across four multipliers without it. O5 is inherited and irrelevant here:
the share block makes no claim about yellow cards, because it makes no claim about any
clue.

---

## Handoff

- **The pure module is the seam.** `shareGrid.ts` exports three functions and two data types, has no React and no DOM, and is the first thing a future format change touches. A per-slot shirt-number variant or a sparkline goes in there with a test, and both buttons keep working unchanged.
- **The button is disposable.** Copy behaviour is one helper and one handler in the component. Replacing the Clipboard API, or adding a Web Share button beside it, changes `GameComplete.tsx` and nothing else.
- **No analytics on copy, deliberately.** If it is ever wanted it is its own patch with its own decision about what a copy event means when the copy failed — and it would need a storage or beacon surface, which §11 rule 8 assigns to a single owner.
- **The mode label is the thing to watch.** Everything about the tally line's interpretability rests on `DIFFICULTY_CONFIG.label` and `.multiplier` being read rather than recomposed. When O1 settles, that label is what disambiguates a streak, and it is already in place.
