## What does this change?

<!-- One or two sentences. Which development/version is this? -->

## Type

<!--
- [ ] Feature (new behaviour)
- [ ] Fix (bug)
- [ ] Refactor (no behaviour change)
- [ ] Test only
- [ ] Docs only
- [ ] Chore (deps, config, tooling)
-->

## Spec and changelog

- [ ] A spec doc exists for this change, or an existing spec doc has been
      updated to match it. Path: `docs/v0.X/dev-N-*.md`
- [ ] `CHANGELOG.md` has an entry for this change, under the correct
      `<milestone>.<development>` version heading.
- [ ] Any deviation from the spec is recorded **in both** the spec doc and
      `CHANGELOG.md` (see below).

## Deviation from spec

<!--
Leave empty only if the implementation matches the spec exactly.

If it does not, state: what the spec said, what shipped, and why. This repo
records deviations rather than silently letting the docs drift — see the
"Deviations" tables in docs/roadmap.md. N/A is a valid answer, "none" is not
if you had to make a judgement call.

Spec said:
Shipped:
Why:
-->

## Testing

- [ ] Tests added or updated for the new behaviour
- [ ] `npm test -w backend` passes — **requires a working Docker daemon**
      (Testcontainers)
- [ ] `npm test -w frontend` passes — no Docker needed
- [ ] `npm run lint` is clean
- [ ] `npm run version:check` passes
- [ ] No regression against the verification baseline in
      [`docs/roadmap.md` §5](https://github.com/ricardoliveira5ro/foot-play/blob/main/docs/roadmap.md#5-verification-baseline).
      Baseline: backend 13 files / 181 tests at a 95% gate on all four metrics;
      frontend 10 files / 179 tests at a 95/90/95/95 gate, measuring
      `frontend/src/` only. If your numbers moved, say so and why.

## Review

- [ ] I have read my own diff top to bottom
- [ ] No secrets, credentials, tokens, or real `.env` values in the diff
- [ ] No unrelated changes bundled in (formatting, drive-by refactors)
