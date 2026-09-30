# v1.4 — Shareable results grid (overview)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a finished Missing Eleven game into something a player can send to someone else — an emoji block with one slot per shirt in scope for that result, the mode and score that make it comparable, and a link that replays the same puzzle.

**Architecture:** One pure module, `frontend/src/lib/shareGrid.ts`, owns the entire share contract: scope, ordering, glyphs, the block text and the composed payload. It has no React and no DOM, so it is testable in the default `node` environment and importable from anywhere. `GameComplete.tsx` is a consumer and nothing more — it derives one boolean, builds the grid, and drops the text into a selectable `<pre>`. v1.4.1 ships that and stops. v1.4.2 adds a Copy button that reads the address bar at click time and hands the string to `navigator.clipboard`, leaving the pure module byte-for-byte untouched so the v1.4.1 rollback point still holds.

**Tech Stack:** TypeScript, Next.js 16 App Router, React 19, Tailwind 4, Vitest + jsdom + Testing Library (frontend only — no backend change in either patch).

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
| Expert | 22, always | Finish stays locked until all 22 resolve (§5.2), so an Expert result cannot end at 11 |

`buildShareGrid` counts the shirts it is handed. It does not pad to 11, truncate to 11, or special-case the length — the 11 and 22 above are what the real call sites produce, and a three-shirt half yields three slots. A test pins that, so a future "always pad to 11" change fails loudly instead of silently making a short lineup look complete.

**Un-resolved slots are rendered, never omitted.** A slot belongs to the grid once its shirt is in scope; what varies is whether that shirt was resolved. Omitting them would make a deliberately 11-slot Easy result indistinguishable from an Expert result that resolved only 11 shirts — the exact confusion the mode label exists to prevent. So a shirt in scope with no resolution still gets a slot, and a grid with no slots at all still renders its tally line.

**Score and mode ride along in all three cases.** The mode is what makes the score comparable (§6.2); a bare number across four multipliers is not a result anyone can argue about. Both are read from `DIFFICULTY_CONFIG` — the module never names a mode, so a future fifth mode is handled by the table rather than by a branch someone has to remember to add.

---

## Three decisions worth stating up front

**Two glyphs, not three.** `🟩` (`U+1F7E9`) is a correct shirt; `⬛` (`U+2B1B`) is everything else. There is no `🟨`, and that is a decision rather than an omission. `SlotOutcome` is frozen to `'correct' | 'failed'`, so a yellow slot would have to be a *failed* slot wearing a colour that claims "close" — a third look with no third meaning. `ShirtState` really does have four members (`'default' | 'in-progress' | 'correct' | 'failed'`), and the mapping is deliberately lossy: `correct` is the only claim the grid makes, and `'default'` and `'in-progress'` render as `failed`. Throwing would let a refactor that surfaced the grid mid-game take down the dialog; omitting would break the never-omitted rule above. `⬛` is the honest rendering of "did not get solved", and because the block is a fixed-emoji monospace grid, both rows align regardless of the glyph's ink coverage.

**`opponentAttempted` is derived, never stored.** `GameComplete` passes `opponentShirts.some((shirt) => shirt.attempts > 0)`. This flag is the whole reason the 11/22 split works, and getting it from anywhere else breaks a real case: a **surrendered** game in Normal has an opponent half sitting in state that was never played, and `state !== 'default'` would misclassify that as a 22-slot result the player never attempted. Deriving it from the shirts means it cannot go stale, needs no reducer change, and adds no `GameState` field. `opponentRequired` supplies the other half of the condition, read from the config table rather than by naming Expert.

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

## Cross-line contract escalation

Raised in the two plans' Task 1 preflights; none was resolved by renaming anything.

| # | Discrepancy | What v1.4 does |
|---|---|---|
| **E1** | `DIFFICULTY_CONFIG.opponentRequired` currently means *"Expert needs an explicit Finish to complete"* (v1.2.4). v1.4.1 reuses it to mean *"the opponent half is always in scope for the share grid"*. For Expert the two coincide, and for the other three modes both are false, so the reuse is correct today — but one flag now carries two meanings. | Consumes the field as-is and documents both meanings. **This is the one thing to revisit if a future mode wants "required to complete" and "opponent not in the share grid" to differ**; a second flag would be the fix, and it belongs to that patch, not this one. |
| **E2** | `POSITION_ORDER` and `getPositionLabel` live inside `GameComplete.tsx:50-93` today. The frozen v1.4 contract does not mention them, but the block and the dialog must order shirts identically. | v1.4.1 Task 2 extracts them, with the comparator, to `frontend/src/lib/positionOrder.ts` and deletes the component's copy. One table, two importers, and an existing dialog test that fails if the extraction is wrong. |
| **E3** | R7 (roadmap §8) assigns widening the vitest include past `src/**` — and deleting the shadowing `frontend/vitest.config.mts` — to **v1.1.1**, deliberately ahead of the UI-heavy patches. v1.2.2's own Global Constraints nonetheless assert the opposite, that the `.mts` file is the effective config. | v1.4 touches neither file. Both plans' preflights **verify** the include was widened and the `.mts` deleted, and escalate if not. A failure in the never-before-collected `frontend/components/Shirt.colors.test.tsx` belongs to v1.1.1 and must not be absorbed here. |
| **E4** | v1.3's handoff says `hasPlayed(streak, todayKey)` is "the already-played-today gate the share affordance sits behind", which reads as though v1.4 must gate the copy control. | Read as: the gate blocks *starting* a second daily, and the share affordance sits behind it in the only sense that matters — the game-over dialog is reachable only by playing. **No gating code in v1.4**, and the v1.4.2 preflight checks the copy control is reachable from the dialog. Stated here because the alternative reading would put a storage read in the clipboard path, and §11 rule 8 makes all storage v1.3.2's. |
| **E5** | `renderShareText` ships in v1.4.1 with no caller, which reads as dead code. | Deliberate, and it is the mechanism that protects the rollback point: v1.4.2's entire job is to call it, and shipping it earlier means v1.4.2 needs no change to a module v1.4.1 froze. An export that the next patch in the same line is contractually required to call is not dead code. |

**Open decisions applied (roadmap §9 defaults):** O1 (streak scope) is still open and *does not block v1.4* — the tally line already carries the mode label out of `DIFFICULTY_CONFIG`, so if O1 flips to per-(day, difficulty) the label goes from decorative to load-bearing and no v1.4 code changes. O5 is inherited and irrelevant here: the share block makes no claim about yellow cards, because it makes no claim about any clue.

---

## Handoff

- **The pure module is the seam.** `shareGrid.ts` exports three functions and two data types, has no React and no DOM, and is the first thing a future format change touches. A per-slot shirt-number variant or a sparkline goes in there with a test, and both buttons keep working unchanged.
- **The button is disposable.** Copy behaviour is one helper and one handler in the component. Replacing the Clipboard API, or adding a Web Share button beside it, changes `GameComplete.tsx` and nothing else.
- **No analytics on copy, deliberately.** If it is ever wanted it is its own patch with its own decision about what a copy event means when the copy failed — and it would need a storage or beacon surface, which §11 rule 8 assigns to a single owner.
- **The mode label is the thing to watch.** Everything about the tally line's interpretability rests on `DIFFICULTY_CONFIG.label` and `.multiplier` being read rather than recomposed. When O1 settles, that label is what disambiguates a streak, and it is already in place.
