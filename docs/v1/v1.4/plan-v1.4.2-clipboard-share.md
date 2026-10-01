# Clipboard Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Copy control to the game-over dialog that copies the full share payload — the title, the emoji block, and the current URL — to the clipboard, and tell the player plainly whether it worked.

**Architecture:** One `Copy result` button and one `role="status"` line, both inside the share block v1.4.1 already renders. The click handler reads the address bar at click time, hands the string to a small module-level `writeToClipboard` helper, and sets one of three states: `copied`, `failed`, or back to `idle` after two seconds. The clipboard write is the only new capability and it lives entirely in the component: `shareGrid.ts` stays pure and its seven frozen exports are untouched, so the v1.4.1 rollback point still holds. There is no legacy `document.execCommand('copy')` path, and the reason is evidence rather than taste — the deployment terminates TLS, so `navigator.clipboard` exists in every environment this app runs in, and a second copy path would be code that never executes.

**Tech Stack:** TypeScript, Next 16 / React 19, Vitest + `@testing-library/react` + `@testing-library/user-event` (frontend).

---

## Global Constraints

- **v1.4.1 is the rollback point and its module is frozen.** `frontend/src/lib/shareGrid.ts` exports exactly `SlotOutcome`, `ShareSlot`, `ShareGridInput`, `ShareGrid`, `buildShareGrid`, `renderShareGrid`, `renderShareText`. This patch **adds, renames, reorders and retypes nothing** in that file. `renderShareText` is exactly what v1.4.1 shipped it for and is called for the first time here. If a change to `shareGrid.ts` seems necessary, that is a signal the logic belongs in the component instead — put it there.

- **`renderShareText` shipped uncalled in v1.4.1, and that is the rollback boundary working as intended** (roadmap §9.1, RD8 — ratified, not an oversight). An uncalled export is not dead code when the next patch in the same line is contractually required to call it. v1.4.1 freezes the module and stops; v1.4.2's entire job is to hand that frozen function a `link`. The alternative — v1.4.2 first editing the module to take an argument, or trimming a payload the block does not need — would break v1.4.1's rollback point, which is the property the line's ordering exists to guarantee. **The diff proof is Step 5.2's job: `frontend/src/lib/shareGrid.ts` is byte-for-byte unchanged by this patch**, and Step 1.2 records the seven-export surface so Step 5.2 can prove it was not crossed. Do not "tidy" the module while you are in the file.

- **No `document.execCommand('copy')` fallback, deliberately.** The obvious fallback is dead code, and shipping dead code as a "safety net" is how the next reader ends up maintaining two copy paths. The evidence:

  | Environment | Secure context? | Clipboard API |
  |---|---|---|
  | Production (behind `nginx/conf.d/default.conf`, which terminates 443 and redirects 80 → 443) | yes | present |
  | `npm run dev` on `http://localhost` | yes — `localhost` is a secure context by spec | present |
  | jsdom (this patch's tests) | no | absent |

  So the only environment where the API is missing is the test environment. The fallback that is genuinely worth having is the **visible** one: when the write fails, the block stays on screen, stays selectable, and says so in words. That covers the real-world cases the legacy API would have covered — a user who denied clipboard permission, a browser that blocks the write, a page in a frame without `allow="clipboard-write"` — because in all of them the text is already on screen and already selectable. Task 1 re-verifies the deployment claim before this decision is relied on.

- **The link is read from the address bar at click time, not from a hook.** `window.location.href.split('#')[0]`. Three reasons, each of which a `useSearchParams` alternative breaks:

  - The fragment is dropped because it is never sent to the server and is not part of a replayable link — a shared URL carrying the recipient's own `#anchor` is noise.
  - The path and query are **read verbatim, never synthesised**. `renderShareText` does not build a URL from filters; v1.3.1's `FilterUrlSync` is the single writer of those params, and a second component that reconstructs a URL is a second source of truth that will drift from the first. Whatever is in the address bar is what the player played.
  - No `useSearchParams` hook means no `Suspense` boundary, and this component is not a route component.

  This is also what makes the scope work: §7 requires the block to render for **any** completed game, daily or filtered, and it costs nothing extra precisely because the filters are already in the query string.

- **The visible block never leaves the screen.** v1.4.2 adds a button; it does not replace the `<pre>` with a "Copied!" placeholder. The `role="img"`, `aria-label="Share grid"` and `select-text` class from v1.4.1 are unchanged, and a test asserts the block is still on screen after a successful copy. A share control that hides the thing it shares is a regression, and it would also remove the manual-copy path that the no-`execCommand` decision depends on.

- **The dialog still ends on `Play Again`.** The Copy button and the status line live inside the share block section that v1.4.1 inserted between the match summary and the button. The copy affordance is grouped with the text it copies, and the dialog's last control remains the one that starts a new game.

- **Feedback is transient and announced politely.** `Copied` for 2 000 ms, then back to `idle`; the failure message is not transient, because the player's next action is to select the text by hand and a message that vanishes is a message they miss. Both go in a `role="status"` live region with `aria-live="polite"`, so neither interrupts. The status element reserves its height with `min-h`, so the dialog does not jump when a message appears.

- **The pending feedback timer is cleared on unmount.** A `useRef` holds the handle and a `useEffect` returns the cleanup, matching the existing `confirmTimerRef` pattern in `frontend/app/missing-eleven/page.tsx:129-133`. A timer that fires after `Play Again` unmounts the dialog would call `setState` on a gone component. Clicking Copy again clears the previous timer first, so rapid clicks do not stack timers and the message always clears 2 s after the *last* press.

- **No `localStorage`, no `sessionStorage`, no new dependency.** All storage belongs to v1.3.2 (roadmap §11 rule 8). `navigator.clipboard` is a platform API; no package is added.

- **The copy control is NOT gated behind `hasPlayed`, and the clipboard path reads no storage at all** (roadmap §9.1, RD7 — ratified, not an open reading). v1.3.2's handoff describes `hasPlayed(streak, todayKey)` as "the already-played-today gate the share affordance sits behind", and that sentence invites the wrong inference. It is wrong, and the reason is worth stating because an implementer looking for a gate will not find one and may conclude it was forgotten:

  | Reading | Consequence |
  |---|---|
  | **Ratified: no gate.** `hasPlayed` gates *starting a second daily* in v1.3.2's `DailyEntry`. The copy control renders whenever the completion overlay does. | The clipboard path touches `navigator.clipboard` and `window.location` only. No storage read, so no hydration-order dependency and no SSR/client divergence to get wrong. |
  | Rejected: gate the button on `hasPlayed`. | Puts a `localStorage` read into the click path, which §11 rule 8 assigns to v1.3.2 exclusively — and it would be the one place in v1.4 that could not ship without the storage surface. |

  `hasPlayed` does not appear anywhere in this patch, and **that absence is the ratified design, not a gap**. Step 5.3 greps for it to prove the negative.

- **No backend change.** No Prisma column, no migration, no endpoint. The backend's 95% coverage gate is unaffected and must still pass.

- **No identifier is renamed.** Everything from v1.4.1 and upstream keeps its name and type.

- **TDD applies to every task with production code.** Red first with the expected failure quoted, then green, then refactor. Clipboard tests stub `navigator.clipboard` and replace `window.location`; both are restored in `afterEach` so no test leaks into another.

- **Regression commands, run at every task boundary:**

  ```bash
  cd frontend && npm test
  cd backend && npm test
  ```

  Expected after this patch: both suites green, frontend growth equal to this patch's own `+14`, and **no new test files** — all three tasks append to the same `GameComplete.test.tsx`.

  | Suite | Baseline (recorded in Task 1) | This patch adds | Verify |
  |---|---|---|---|
  | frontend `npm test` | *v1.4.1's final measured total* | `+14`, file count unchanged | observed == baseline + 14 |
  | backend `npm test` | *your recorded baseline* | `0` | observed == baseline |

  The `+14` is `6 + 4 + 4`: `6` in Task 1's `copy result` describe, `4` in Task 2's failure cases, `4` in Task 3's timer cases. Task 3 **rewrites** one of Task 2's four failure tests (a timer rather than a rejected write) and adds three alongside it, so Task 3's net contribution is `4`, not `3` — a rewritten test still occupies a slot.

  **Do not assert a cumulative literal.** `GameComplete.test.tsx` is shared with v1.2.5 and v1.4.1, so its pre-existing count is not this patch's to assert. Record the baseline, then require baseline `+14`. A file count that *rises* is the signal that a task created a file it should have appended to instead.



---

## Task 1: Preflight — confirm v1.4.1 shipped and the clipboard decision still holds

**Files:** read-only. Nothing is created or modified, and there is no commit.

**Interfaces:**
- Consumes: nothing. Reads the filesystem only.
- Produces: nothing. This task exists so the no-`execCommand` decision rests on a checked fact rather than a remembered one.

- [ ] **Step 1.1: Confirm v1.4.1 is in the tree and its suite is green.**

  ```bash
  cd frontend && npm test
  ```

  Expected: `Test Files 11 passed (11)`, with the test total equal to whatever v1.4.1 last recorded — **read it off v1.4.1's own final run, do not assume it.** A lower number means a file stopped being collected, which is an R7 regression (roadmap §8); escalate rather than working around it.

- [ ] **Step 1.2: Confirm the frozen export list is byte-for-byte the v1.4.1 one.**

  ```bash
  cd frontend && grep -nE "^export (type|interface|function|const)" src/lib/shareGrid.ts
  ```

  Expected: exactly seven lines — `SlotOutcome`, `ShareSlot`, `ShareGridInput`, `ShareGrid`, `buildShareGrid`, `renderShareGrid`, `renderShareText`. This is the rollback boundary; record it now so Step 5.2 can prove it was not crossed.

- [ ] **Step 1.3: Re-verify the secure-context claim that removes the `execCommand` fallback.**

  ```bash
  grep -nE "listen|ssl_certificate|return 30" nginx/conf.d/default.conf
  ```

  Expected: a `443 ssl` server block, an HTTP block that returns a redirect to HTTPS, and no plain-HTTP `location` block that serves the app. If the app is ever reachable over plain HTTP on a non-localhost host, `navigator.clipboard` is absent in production and **this patch's fallback decision is wrong** — stop and escalate, because the fix is to add the `execCommand` path back and its tests, not to ship a control that silently fails.

  `http://localhost` needs no check: `npm run dev` serves there, and the W3C secure-context definition treats `localhost` as secure, so the Clipboard API is available in development too.

- [ ] **Step 1.4: Confirm no copy affordance already exists.**

  ```bash
  cd frontend && grep -rniE "clipboard|execCommand|copy" src/components/ src/lib/
  ```

  Expected: **no output** beyond the word `copy` in unrelated comments. v1.4.1 asserted the absence of a copy button; if one has appeared, something outside this line of work changed it and needs reconciling first.

- [ ] **Step 1.5: Confirm the clean tree.**

  ```bash
  git status --short
  ```

  Expected: no modified file under `frontend/` or `backend/`.

---

## Task 2: Copy the payload and say it worked

**Files:**
- Modify: `frontend/src/components/GameComplete.test.tsx` (stub helpers, new tests)
- Modify: `frontend/src/components/GameComplete.tsx` (hoist the grid, add the button)

**Interfaces:**
- Consumes: `renderShareText` from `@/lib/shareGrid` (v1.4.1, called for the first time); `buildShareGrid`'s `ShareGrid` return value.
- Produces: one module-level helper in `GameComplete.tsx` — `async function writeToClipboard(text: string): Promise<boolean>` — and one `CopyState` type, `'idle' | 'copied' | 'failed'`. Neither is exported.

- [ ] **Step 2.1: Add the stub helpers to the test file.**

  Near the existing fixtures in `frontend/src/components/GameComplete.test.tsx`, add. `vi`, `afterEach` and `userEvent` are already imported by that file:

  ```tsx
  const ORIGINAL_LOCATION = globalThis.location;

  function setHref(href: string): void {
    Object.defineProperty(globalThis, 'location', { value: { href }, writable: true, configurable: true });
  }

  function installClipboard(writeText: (text: string) => Promise<void>): void {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });
  }

  afterEach(() => {
    Object.defineProperty(globalThis, 'location', {
      value: ORIGINAL_LOCATION,
      writable: true,
      configurable: true,
    });
    Reflect.deleteProperty(globalThis.navigator, 'clipboard');
  });
  ```

  `setHref` replaces the whole `location` object rather than assigning to `.href`, because jsdom's `location.href` is a non-configurable accessor that throws on assignment. The component reads exactly one property, so a plain object is a faithful stand-in. `afterEach` restores both globals, so a clipboard stub in one test cannot make the next test pass.

- [ ] **Step 2.2: Write the failing tests first.**

  Add a `describe('copy result', …)` block, reusing the `eleven` helper from v1.4.1's `share block` describe. If it is scoped to that block, hoist it to the file's fixture section before continuing:

  ```tsx
  describe('copy result', () => {
    const perfect = () =>
      Array.from({ length: 11 }, (_, i) =>
        makeShirt({ token: `t-${i}`, shirtNumber: i + 1, position: null, state: 'correct' })
      );

    const copyButton = () => screen.getByRole('button', { name: 'Copy result' });

    it('copies the title, the block, and the current URL', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      installClipboard(writeText);
      setHref('https://footplay.online/missing-eleven?daily=2026-01-01');

      renderGameComplete({ targetShirts: perfect(), opponentShirts: [], difficulty: 'normal' });
      await userEvent.click(copyButton());

      expect(writeText).toHaveBeenCalledTimes(1);
      // 11000 = 11 correct shirts × 1000, the same total v1.4.1 asserted on
      // screen — the copied text and the visible block are the same string.
      expect(writeText).toHaveBeenCalledWith(
        'Missing Eleven\n🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩\nNormal ×1 · 11000\nhttps://footplay.online/missing-eleven?daily=2026-01-01'
      );
    });

    it('drops the fragment from the copied link', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      installClipboard(writeText);
      setHref('https://footplay.online/missing-eleven?daily=2026-01-01#results');

      renderGameComplete({ targetShirts: perfect(), opponentShirts: [], difficulty: 'normal' });
      await userEvent.click(copyButton());

      expect(writeText).toHaveBeenCalledWith(
        expect.not.stringContaining('#')
      );
    });

    it('copies the filtered query string verbatim, without rebuilding it', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      installClipboard(writeText);
      setHref('https://footplay.online/missing-eleven?competition=liga&season=2023%2F24');

      renderGameComplete({ targetShirts: perfect(), opponentShirts: [], difficulty: 'normal' });
      await userEvent.click(copyButton());

      // The exact string the browser had, including its percent-encoding. A
      // component that rebuilt the URL from filter objects would emit
      // "2023/24" unencoded and this would catch it.
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining('https://footplay.online/missing-eleven?competition=liga&season=2023%2F24')
      );
    });

    it('confirms the copy in a polite live region', async () => {
      installClipboard(vi.fn().mockResolvedValue(undefined));
      setHref('https://footplay.online/missing-eleven?daily=2026-01-01');

      renderGameComplete({ targetShirts: perfect(), opponentShirts: [], difficulty: 'normal' });
      expect(screen.getByRole('status').textContent).toBe('');

      await userEvent.click(copyButton());
      expect(screen.getByRole('status').textContent).toBe('Copied');
    });

    it('leaves the block on screen after a successful copy', async () => {
      installClipboard(vi.fn().mockResolvedValue(undefined));
      setHref('https://footplay.online/missing-eleven?daily=2026-01-01');

      renderGameComplete({ targetShirts: perfect(), opponentShirts: [], difficulty: 'normal' });
      await userEvent.click(copyButton());

      // The manual-copy path depends on this text staying visible.
      expect(screen.getByRole('img', { name: 'Share grid' }).textContent).toContain('🟩');
    });

    it('still ends on Play Again', async () => {
      const { container } = renderGameComplete({
        targetShirts: perfect(),
        opponentShirts: [],
        difficulty: 'normal',
      });
      expect(container.querySelectorAll('button')).toHaveLength(2);
      const buttons = screen.getAllByRole('button');
      expect(buttons[buttons.length - 1]).toHaveTextContent('Play Again');
    });
  });
  ```

- [ ] **Step 2.3: Run it and watch it fail.**

  ```bash
  cd frontend && npm test -- src/components/GameComplete.test.tsx
  ```

  Expected: **FAIL** across the new `copy result` describe — `Unable to find an accessible element with the role "button"`, name `Copy result`. The 26 existing tests (17 original + 9 from v1.4.1) still pass; if they do not, the `afterEach` stub helpers are leaking and must be fixed before continuing.

- [ ] **Step 2.4: Hoist the built grid so both text forms can use it.**

  In `frontend/src/components/GameComplete.tsx`, v1.4.1 left this shape:

  ```tsx
  const shareText = renderShareGrid(
    buildShareGrid({
      targetShirts,
      opponentShirts,
      difficulty,
      opponentAttempted,
      score: scoreBreakdown.grandTotal,
    })
  );
  ```

  Replace it with:

  ```tsx
  const shareGrid = buildShareGrid({
    targetShirts,
    opponentShirts,
    difficulty,
    opponentAttempted,
    score: scoreBreakdown.grandTotal,
  });
  const shareBlock = renderShareGrid(shareGrid);
  ```

  The grid is needed on its own now, because `renderShareText` takes a `ShareGrid` and a link rather than a pre-rendered string. Rename the single use of `shareText` in the `<pre>` to `shareBlock`.

- [ ] **Step 2.5: Add the clipboard helper and the state.**

  Above the `GameComplete` component, add:

  ```tsx
  type CopyState = 'idle' | 'copied' | 'failed';

  /** How long feedback stays on screen before the line clears itself. */
  const COPY_FEEDBACK_MS = 2000;

  /**
   * Writes `text` to the clipboard and reports whether it worked.
   *
   * There is deliberately no `document.execCommand('copy')` fallback. The app
   * is served over TLS and `http://localhost` is a secure context, so
   * `navigator.clipboard` is present everywhere this runs; a second copy path
   * would be code that never executes. The fallback worth having is the
   * visible one — on failure the caller leaves the block on screen, selectable,
   * and says so.
   */
  async function writeToClipboard(text: string): Promise<boolean> {
    try {
      if (!navigator.clipboard) return false;
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // A rejected promise means permission was denied or the browser blocked
      // the write. Both are recoverable by the player selecting the text.
      return false;
    }
  }
  ```

  Inside the component, next to the existing `const [activeTab, setActiveTab] = useState(…)`:

  ```tsx
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  ```

  `useState` and `useRef` are already imported at the top of the file; do not add a second import line for them.

- [ ] **Step 2.6: Add the handler.**

  Inside the component, after the `activeTab` state block:

  ```tsx
  function clearCopyTimer(): void {
    if (copyTimerRef.current !== null) {
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
  }

  async function handleCopy(): Promise<void> {
    // Clear first: a second press restarts the countdown instead of stacking a
    // second timer that would clear the message early.
    clearCopyTimer();

    // Read the address bar at click time rather than from a hook or a prop.
    // v1.3.1's FilterUrlSync is the only writer of these params, and reading
    // what is actually there is what makes a non-daily filtered result shareable
    // without this component knowing what a filter is. The fragment is dropped:
    // it is not sent to the server and is not part of a replayable link.
    const link = window.location.href.split('#')[0];

    const ok = await writeToClipboard(renderShareText(shareGrid, link));
    setCopyState(ok ? 'copied' : 'failed');

    copyTimerRef.current = setTimeout(() => setCopyState('idle'), COPY_FEEDBACK_MS);
  }
  ```

- [ ] **Step 2.7: Render the button and the status line.**

  In `frontend/src/components/GameComplete.tsx`, inside the share block section that v1.4.1 added — after the `</pre>` and before that section's closing `</div>` — insert:

  ```tsx
  <button
    type="button"
    onClick={handleCopy}
    className="mt-3 w-full h-11 rounded-lg border border-ink/20 font-sans font-semibold text-base text-ink transition-colors hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare active:scale-[0.98]"
  >
    Copy result
  </button>
  {/* min-h reserves the line so the dialog does not jump when it fills. */}
  <p
    role="status"
    aria-live="polite"
    className={`mt-2 min-h-5 text-center text-xs font-semibold ${
      copyState === 'copied' ? 'text-correct' : copyState === 'failed' ? 'text-failed' : 'text-ink/55'
    }`}
  >
    {copyState === 'copied'
      ? 'Copied'
      : copyState === 'failed'
        ? 'Copy failed — select and copy manually'
        : ''}
  </p>
  ```

  `text-correct` and `text-failed` resolve to the `--color-correct` and `--color-failed` tokens declared in `frontend/app/globals.css:10-11`, so the confirmation and the failure read in the same green and red the dialog already uses for correct and failed shirts. The status line is inside the share section on purpose: it reports on the button above it, and both stay grouped with the text they refer to.

- [ ] **Step 2.8: Verify green.**

  ```bash
  cd frontend && npm test -- src/components/GameComplete.test.tsx
  ```

  Expected: `Test Files 1 passed (1)`, and the observed total equal to the `GameComplete.test.tsx` count you recorded in Task 1 plus this task's `+6`. Do **not** decompose the pre-existing half as "v0 plus v1.4.1's" — that arithmetic was already wrong before this patch (v1.2.5 also appends to this file), and the recorded baseline is the only number that survives it. `Test Files 1` is the assertion that carries here, per R7.

  The `Copied` assertion and the `· 11000` literal in the copied payload are the two that would catch a wrong grid or a wrong score — check them by name, not by count.

- [ ] **Step 2.9: Type-check and lint.**

  ```bash
  cd frontend && npx tsc --noEmit && npm run lint
  ```

  Expected: clean. `onClick={handleCopy}` returning a `Promise<void>` is accepted by React's `MouseEventHandler`, and `npm run lint` must not report an unhandled-promise warning.

- [ ] **Step 2.10: Full regression.**

  ```bash
  cd frontend && npm test
  cd ../backend && npm test
  ```

  Expected: frontend total equal to the recorded baseline `+6`, with the file count unchanged; backend identical to its recorded baseline.

- [ ] **Step 2.11: Commit.**

  ```bash
  git add frontend/src/components/GameComplete.tsx frontend/src/components/GameComplete.test.tsx
  git commit -m "feat(frontend): copy the share payload to the clipboard"
  ```

---

## Task 3: Handle a copy that does not happen

The success path is the easy one. This task covers the two ways it can fail — the API missing, and the write rejected — and asserts the player's fallback still works.

**Files:**
- Modify: `frontend/src/components/GameComplete.test.tsx`
- No production change: Task 2's handler already returns `false` in both cases. This task exists to prove that, because "it is already handled" is exactly the claim that quietly rots.

**Interfaces:**
- Consumes: `writeToClipboard`'s `false` return; the `select-text` class on the `<pre>` from v1.4.1.
- Produces: no new production symbol. If a test fails and the fix is a production change, make the smallest one that keeps `writeToClipboard` returning `boolean`.

- [ ] **Step 3.1: Write the failing-or-passing tests first.**

  Add to the `copy result` describe:

  ```tsx
  it('reports failure when the clipboard write is rejected', async () => {
    installClipboard(vi.fn().mockRejectedValue(new Error('NotAllowedError')));
    setHref('https://footplay.online/missing-eleven?daily=2026-01-01');

    renderGameComplete({ targetShirts: perfect(), opponentShirts: [], difficulty: 'normal' });
    await userEvent.click(copyButton());

    expect(screen.getByRole('status').textContent).toBe(
      'Copy failed — select and copy manually'
    );
  });

  it('reports failure when the Clipboard API is missing entirely', async () => {
    // No installClipboard call: this is the jsdom shape, and the shape a
    // non-secure-context browser presents.
    setHref('https://footplay.online/missing-eleven?daily=2026-01-01');

    renderGameComplete({ targetShirts: perfect(), opponentShirts: [], difficulty: 'normal' });
    await userEvent.click(copyButton());

    expect(screen.getByRole('status').textContent).toBe(
      'Copy failed — select and copy manually'
    );
  });

  it('keeps the failure message until the next copy, not on a timer', async () => {
    installClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    setHref('https://footplay.online/missing-eleven?daily=2026-01-01');

    renderGameComplete({ targetShirts: perfect(), opponentShirts: [], difficulty: 'normal' });
    await userEvent.click(copyButton());

    vi.advanceTimersByTime(10_000);
    expect(screen.getByRole('status').textContent).toBe(
      'Copy failed — select and copy manually'
    );
  });

  it('leaves the block selectable so the failure is recoverable', async () => {
    installClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    setHref('https://footplay.online/missing-eleven?daily=2026-01-01');

    renderGameComplete({ targetShirts: perfect(), opponentShirts: [], difficulty: 'normal' });
    await userEvent.click(copyButton());

    const block = screen.getByRole('img', { name: 'Share grid' });
    expect(block).toBeVisible();
    expect(block.className).toContain('select-text');
  });
  ```

  The third test needs fake timers, because it is the one that would pass vacuously with real timers — `advanceTimersByTime` does nothing and the assertion would hold for the wrong reason. Add a scoped setup rather than a file-wide one, so the other tests keep real timers:

  ```tsx
  it('keeps the failure message until the next copy, not on a timer', async () => {
    vi.useFakeTimers();
    try {
      // …as above…
    } finally {
      vi.useRealTimers();
    }
  });
  ```

  With fake timers, `userEvent.click` must be driven by `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`, or the click never resolves. Pass that instance to `.click()` in this test only.

  This reveals a **real production gap**, and it is the reason the task exists: Task 2's handler sets the same 2 000 ms timer on both outcomes, so the failure message currently disappears. That is wrong — the player's next action is to select the text by hand, and a message that vanishes is a message they miss. The third test is expected to fail on first run, and the fix in Step 3.2 is the honest one.

- [ ] **Step 3.2: Run it and watch the third test fail.**

  ```bash
  cd frontend && npm test -- src/components/GameComplete.test.tsx
  ```

  Expected: **FAIL** on `keeps the failure message until the next copy, not on a timer` — `received: ""` instead of the failure message. The other three pass, proving the two failure modes already land in the right state and only the persistence is wrong.

- [ ] **Step 3.3: Keep the failure message on screen.**

  In `frontend/src/components/GameComplete.tsx`, change the end of `handleCopy`:

  ```tsx
    const ok = await writeToClipboard(renderShareText(shareGrid, link));
    setCopyState(ok ? 'copied' : 'failed');

    // Only the success message is transient. A failure has to persist: the
    // player's next action is to select the block by hand, and a message that
    // disappears before they read it is the same as no message at all.
    if (ok) {
      copyTimerRef.current = setTimeout(() => setCopyState('idle'), COPY_FEEDBACK_MS);
    }
  }
  ```

  This is a three-line change and no test needs editing, because the first two failure tests assert the message is present immediately rather than after any delay.

- [ ] **Step 3.4: Verify green.**

  ```bash
  cd frontend && npm test -- src/components/GameComplete.test.tsx
  ```

  Expected: `Test Files 1 passed (1)`, observed total equal to Task 1's recorded file total `+4` — the four failure cases appended here.

- [ ] **Step 3.5: Prove the manual fallback is real, not just claimed.**

  ```bash
  cd frontend && grep -n "select-text" src/components/GameComplete.tsx
  ```

  Expected: one hit, on the share block's `<pre>`. A block that failed to copy and is not selectable is a dead end for the player; that class is what keeps the failure recoverable, which is why it shipped in v1.4.1 rather than arriving with this button.

- [ ] **Step 3.6: Full regression.**

  ```bash
  cd frontend && npm test
  cd ../backend && npm test
  ```

  Expected: frontend total equal to the recorded baseline `+6` `+4`; backend identical to its recorded baseline.

- [ ] **Step 3.7: Commit.**

  ```bash
  git add frontend/src/components/GameComplete.tsx frontend/src/components/GameComplete.test.tsx
  git commit -m "fix(frontend): keep the copy failure message on screen"
  ```

---

## Task 4: Clear the confirmation and clean up the timer

**Files:**
- Modify: `frontend/src/components/GameComplete.test.tsx`
- Modify: `frontend/src/components/GameComplete.tsx` (unmount cleanup)

**Interfaces:**
- Consumes: `copyTimerRef`, `clearCopyTimer`, and `COPY_FEEDBACK_MS` from Task 2.
- Produces: one `useEffect` with a cleanup that clears the pending timer on unmount.

- [ ] **Step 4.1: Write the failing tests first.**

  Add to the `copy result` describe:

  ```tsx
  it('clears the confirmation after two seconds', async () => {
    vi.useFakeTimers();
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      installClipboard(vi.fn().mockResolvedValue(undefined));
      setHref('https://footplay.online/missing-eleven?daily=2026-01-01');

      renderGameComplete({ targetShirts: perfect(), opponentShirts: [], difficulty: 'normal' });
      await user.click(copyButton());
      expect(screen.getByRole('status').textContent).toBe('Copied');

      await vi.advanceTimersByTimeAsync(2000);
      expect(screen.getByRole('status').textContent).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the confirmation for the full two seconds, not less', async () => {
    vi.useFakeTimers();
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      installClipboard(vi.fn().mockResolvedValue(undefined));
      setHref('https://footplay.online/missing-eleven?daily=2026-01-01');

      renderGameComplete({ targetShirts: perfect(), opponentShirts: [], difficulty: 'normal' });
      await user.click(copyButton());

      await vi.advanceTimersByTimeAsync(1999);
      expect(screen.getByRole('status').textContent).toBe('Copied');
    } finally {
      vi.useRealTimers();
    }
  });

  it('restarts the countdown when Copy is pressed again', async () => {
    vi.useFakeTimers();
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      installClipboard(vi.fn().mockResolvedValue(undefined));
      setHref('https://footplay.online/missing-eleven?daily=2026-01-01');

      renderGameComplete({ targetShirts: perfect(), opponentShirts: [], difficulty: 'normal' });
      await user.click(copyButton());
      await vi.advanceTimersByTimeAsync(1500);
      await user.click(copyButton());
      // 1 500 ms after the second press, not after the first: the first timer
      // must have been cleared, or this would already be empty.
      await vi.advanceTimersByTimeAsync(1000);
      expect(screen.getByRole('status').textContent).toBe('Copied');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not set state after unmount', async () => {
    vi.useFakeTimers();
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const writeText = vi.fn().mockResolvedValue(undefined);
      installClipboard(writeText);
      setHref('https://footplay.online/missing-eleven?daily=2026-01-01');

      const { unmount } = render(
        <GameComplete
          match={makeMatch()}
          targetShirts={perfect()}
          opponentShirts={[]}
          targetTeamName="Target FC"
          opponentTeamName="Opponent FC"
          onPlayAgain={vi.fn()}
        />
      );
      await user.click(copyButton());
      unmount();

      // Unmounting with a pending timer is the Play Again path. A setState
      // after teardown is a React warning in development and a leak in
      // production, and this assertion is what proves the cleanup runs.
      await vi.advanceTimersByTimeAsync(2000);
      expect(writeText).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  ```

  Add `render` to the `@testing-library/react` import if the file imports only `{ screen }`. The last test constructs the element directly rather than through `renderGameComplete`, because that helper does not return `unmount`; extend `renderGameComplete` to return the full result if you prefer, but do not change its defaults, since 26 existing tests depend on them.

- [ ] **Step 4.2: Run it and watch the unmount test fail.**

  ```bash
  cd frontend && npm test -- src/components/GameComplete.test.tsx
  ```

  Expected: the first three pass — Task 2's `clearCopyTimer` at the top of the handler and the unconditional timer already give the right timing. `does not set state after unmount` **FAILS**: nothing clears the timer on unmount, so `setCopyState('idle')` fires against a component that is gone.

  The practical symptom is a React warning in the console and a retained closure; it is worth a real test rather than a code-review note, because the fix is invisible in the diff and easy to drop in a later refactor.

- [ ] **Step 4.3: Clear the timer on unmount.**

  In `frontend/src/components/GameComplete.tsx`, add a `useEffect` immediately after the existing dialog-mount `useEffect`:

  ```tsx
  // Clear a pending confirmation timer on unmount. Play Again unmounts this
  // component, and without this the timer would call setCopyState on a component
  // that no longer exists.
  useEffect(() => clearCopyTimer, []);
  ```

  `useEffect` returns the cleanup function itself, which is why this is a one-liner and not an arrow with a body. `clearCopyTimer` is a function declaration, so it is hoisted and safe to reference before its definition in the component body.

- [ ] **Step 4.4: Verify green.**

  ```bash
  cd frontend && npm test -- src/components/GameComplete.test.tsx
  ```

  Expected: `Test Files 1 passed (1)`, observed total equal to Task 2's recorded file total `+4` — **not `+3`.** One of Task 2's four failure tests is rewritten as a timer test in place, so the file gains three and keeps the fourth slot.

- [ ] **Step 4.5: Type-check and lint.**

  ```bash
  cd frontend && npx tsc --noEmit && npm run lint
  ```

  Expected: clean, with no `react-hooks/exhaustive-deps` warning. An empty dependency array with a cleanup that closes over a ref is the correct pattern here — the ref is stable, so there is no dependency to declare.

- [ ] **Step 4.6: Full regression.**

  ```bash
  cd frontend && npm test
  cd ../backend && npm test
  ```

  Expected: frontend total equal to the recorded baseline `+6` `+4` `+4`; backend identical to its recorded baseline. **This must be strictly greater than Task 2's total** — Task 3 adds four tests, so a total identical to Task 2's means Task 3's describe was appended to the wrong file or never collected. Treat that equality as a failure, not a pass.

- [ ] **Step 4.7: Commit.**

  ```bash
  git add frontend/src/components/GameComplete.tsx frontend/src/components/GameComplete.test.tsx
  git commit -m "fix(frontend): clear the copy confirmation timer on unmount"
  ```

---

## Task 5: Verify the patch and record it

**Files:**
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: the release note for `v1.4.2`, which `scripts/src/release.ts` reads.

- [ ] **Step 5.1: Run the whole suite from a clean shell.**

  ```bash
  cd frontend && npm test
  cd ../backend && npm run test:coverage
  ```

  Expected: frontend total equal to the recorded baseline `+14`, **not lower** than any intermediate step above; backend identical to its recorded baseline, with all four coverage metrics at or above 95% (`backend/vitest.config.ts:26-30`) — a gate this patch cannot move, because it touches no backend file.

- [ ] **Step 5.2: Prove the frozen module was not touched.**

  ```bash
  cd frontend && grep -nE "^export (type|interface|function|const)" src/lib/shareGrid.ts
  git diff --stat v1.4.1 -- src/lib/shareGrid.ts src/lib/shareGrid.test.ts
  ```

  Expected: the same seven exports recorded in Task 1.2, and an empty diff. A non-empty diff means the v1.4.1 rollback point is broken; if it happened, revert `src/lib/shareGrid.ts` and re-implement the requirement in the component.

- [ ] **Step 5.3: Confirm the whole clipboard surface is where it should be.**

  ```bash
  cd frontend && grep -rnE "navigator\.clipboard|execCommand|localStorage|sessionStorage" src/ && grep -rn "renderShareText" src/
  cd frontend && grep -rn "hasPlayed" src/
  ```

  Expected: `navigator.clipboard` appears only in `writeToClipboard` inside `GameComplete.tsx`; **no `execCommand` anywhere**; **no `localStorage` or `sessionStorage` anywhere** (§11 rule 8 — that surface is v1.3.2's); `hasPlayed` **appears nowhere in `src/`** (the ratified no-gate design, RD7 — a hit here means someone added the gate that §9.1 ruled out, and it must come back out); and `renderShareText` called from exactly one place, the click handler.

  The `hasPlayed` grep returning **nothing is the pass signal**, not a skipped check. This is the one validation in the plan that asserts an absence, and the absence is the decision.

- [ ] **Step 5.4: Build the frontend.**

  ```bash
  cd frontend && npm run build
  ```

  Expected: a successful Next production build.

- [ ] **Step 5.5: Write the changelog entry.**

  Prepend to `CHANGELOG.md`, directly under the `---` that follows the header block and **above** the `v1.4.1` entry, matching the existing shape and newest-first order:

  ```markdown
  ## v1.4.2 — Clipboard Share

  _2026-09-30_

  ### Added

  - **Copy result button** — the game-over dialog's share block now has a Copy
    control that puts the title, the emoji grid, and the current URL on the
    clipboard in one action, so a daily result or a filtered one shares the same
    way. The URL is copied exactly as the address bar has it, filters included.
  - **Visible fallback** — if the browser blocks the write or the player has
    denied clipboard access, the dialog says so and leaves the block on screen
    and selectable, rather than failing silently.
  ```

- [ ] **Step 5.6: Confirm nothing outside the patch changed.**

  ```bash
  git status --short
  git diff --stat HEAD
  ```

  Expected: changes confined to `frontend/src/components/GameComplete.tsx`, `frontend/src/components/GameComplete.test.tsx` and `CHANGELOG.md`. `frontend/src/lib/shareGrid.ts`, `frontend/src/lib/positionOrder.ts` and `docs/v1/roadmap-v1.md` are not among them.

- [ ] **Step 5.7: Commit.**

  ```bash
  git add CHANGELOG.md
  git commit -m "docs: release note for v1.4.2"
  ```

---

## Acceptance criteria

1. A `Copy result` button and a `role="status"` line are rendered inside the share block v1.4.1 already produced. The block itself is unchanged: **the visible share block never leaves the screen** when copying happens.
2. The copied payload contains the **title, the emoji block, and the current URL**, in that order.
3. The URL is read from the address bar **at click time**, not from a hook, so the copied link always reflects where the player actually is.
4. There is **no `document.execCommand('copy')` fallback**, deliberately: the deployment terminates TLS, so `navigator.clipboard` exists in every environment this app runs in, and a second copy path would be code that never executes.
5. `shareGrid.ts` stays pure and its seven frozen exports are untouched — the clipboard write lives entirely in the component, so **v1.4.1 remains the rollback point**.
6. Success is announced **politely** through `role="status"`, and feedback is transient: it returns to `idle` after two seconds.
7. A copy that does not happen is reported as `failed` in plain language. It is never reported as success, and no error is thrown to the console as a substitute for telling the player.
8. The pending feedback timer is **cleared on unmount**, so no state update lands after teardown.
9. The dialog still ends on `Play Again`; copying does not add a fourth ending and does not trap the player in the dialog.
10. The copy control is **not** gated behind `hasPlayed`, and the clipboard path reads **no storage at all**. The reason is recorded in the constraints: the value of copying is highest exactly when the player has not finished a game.
11. `localStorage`, `sessionStorage`, and every new dependency are absent. `grep -rn "sessionStorage\|localStorage" frontend/src frontend/app` returns no output from this patch.
12. No backend change, and **no identifier is renamed** anywhere.
13. Failure cases are covered: a rejected clipboard permission, an absent `navigator.clipboard`, and a non-secure context each take a distinct, asserted path to `failed` rather than to a thrown error.
14. Timer behaviour is covered with fake timers: the two-second reset is asserted, and the test is restored to real timers afterwards so it cannot leak into a neighbouring file.
15. `npm run test`, `npm run build`, `npx tsc --noEmit`, and `npm run lint` are clean, and every new suite is collected. This patch's own contribution is `+14` (`6 + 4 + 4`) measured against a recorded baseline, with the file count unchanged; no suite is asserted against a fixed count, per `docs/v1/v1.2/overview.md:209`.

## Validation

| Check | Command | Pass signal |
|---|---|---|
| Frontend suite | `cd frontend && npm run test` | every file green; total equal to the recorded baseline `+14`, and **strictly greater than Task 2's and Task 3's** |
| The copy path | `cd frontend && npx vitest run src/components/GameComplete.test.tsx` | every case green, including the three failure paths |
| Production build | `cd frontend && npm run build` | no output |
| Types | `cd frontend && npx tsc --noEmit` | no output |
| Lint | `cd frontend && npm run lint` | no output |
| **No `execCommand` path exists** | `grep -rn "execCommand" frontend/src frontend/app` | no output — the fallback is deliberately absent |
| Storage is untouched | `grep -rn "sessionStorage\|localStorage" frontend/src frontend/app` | no output from this patch |
| The module stays pure and frozen | `git diff --stat -- frontend/src/lib/shareGrid.ts` | empty — this patch touches no module export |
| The URL is read at click time | `grep -n "window.location" frontend/src/components/GameComplete.tsx` | read inside the handler, not at render |
| The timer is cleared on unmount | `grep -n "clearTimeout" frontend/src/components/GameComplete.tsx` | present, and asserted in the timer tests |
| No new dependency | `git diff --stat -- frontend/package.json package.json` | empty |
| No backend drift | `git diff --stat -- backend/ backend/prisma/` | empty — frontend-only, no migration |
| **The include was not re-narrowed (R7)** | `grep -n "include:" frontend/vitest.config.ts` | unchanged from v1.1.1 |

## Risks

| Risk | Mitigation |
|---|---|
| **A second copy path creeps in** via `document.execCommand`, so the code that never executes is the code a browser actually takes. | The absence of the fallback is a stated decision with its evidence (TLS termination), enforced by a grep gate. Adding it back would need a new decision, not a convenience. |
| **`shareGrid.ts` grows a clipboard import**, so the v1.4.1 rollback boundary stops holding. | The clipboard write lives entirely in the component; the module is diffed as empty in the Validation table. Making it impure would put v1.4.1's pure, seven-export contract at risk for no gain. |
| **The copied URL is captured at render** and goes stale when the player changes filters before clicking. | The link is read from the address bar inside the handler (criterion 3), and a test clicks after a navigation to prove the payload is current. |
| **A failed copy is reported as success**, or the failure is swallowed into a console error the player never sees. | `failed` is a distinct asserted state with plain language, and each failure mode — rejected permission, absent API, insecure context — has its own named test. |
| **A pending timer fires after unmount**, producing a React state update on a torn-down component. | The timer is cleared on unmount (criterion 8) and asserted under fake timers, which are restored afterwards so the test cannot leak into a neighbouring file. |
| **The confirmation never clears**, leaving "Copied" on screen indefinitely. | The two-second reset to `idle` is asserted with fake timers rather than left to inspection. |
| **Gating the control behind `hasPlayed`** removes the one case where sharing is most valuable — a player who gave up and still wants to post the board. | The control is explicitly **not** gated, and the clipboard path reads no storage, so there is nothing to await and no state to race. |
| **Copying becomes a second dialog ending**, so the player loses the `Play Again` path. | The dialog still ends on `Play Again` (criterion 9), and the visible block stays on screen; copying is an action, not a navigation. |

---

## Handoff

- **Rollback point:** `v1.4.1`. Reverting this patch leaves the share block on screen and selectable, with no copy control — a complete, useful feature.
- **The line is complete.** §7's scope — "any completed game, not only the daily one" — is satisfied without a branch on `isDaily`, because v1.3.1 already keeps the daily key and the filters in the query string, and v1.4.2 copies the address bar verbatim rather than rebuilding it.
- **What the next line should know:**
  - `shareGrid.ts` is pure and has three exported functions. A future format change (per-slot shirt numbers, a sparkline) belongs there with a test, and the button keeps working unchanged.
  - The mode label in the tally line comes from `DIFFICULTY_CONFIG`. Streak scope is **settled** (§9.1, RD3 — one streak per day, global across difficulties), so the label is not disambiguating anything streak-shaped; it is here because §6.2 makes a score meaningless across four multipliers without it. A fifth mode gets a correct label from the table with no change to this patch.
  - There is no analytics on copy, and adding it would be new scope. If it is ever wanted, it belongs in a patch of its own with its own decision about what a copy event means when the copy failed.
