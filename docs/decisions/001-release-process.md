# ADR-001: Release and deploy gating

## Status

Accepted

## Date

2026-09-27

## Context

Until 2026-09-27 this project had **no tags, no releases, and no version field
that meant anything**. A single `.github/workflows/deploy.yml` ran four
lint/build/test jobs and then a `deploy` job wired to them with
`needs: [frontend-lint, backend-lint, backend-build, backend-test]`. Three
things were wrong with that, and they compound:

1. **The deployed code was not provably the tested code.** The deploy job
   checked out the default branch and the host ran `git pull origin main`. Both
   resolve to whatever `main` points at *at that moment*, which can already be
   newer than the commit CI passed. There was a window in which the thing on the
   server was never validated by anything.
2. **A release did not exist as a concept.** Versions were recorded only in
   `CHANGELOG.md` prose and on development docs. There was no artifact
   corresponding to "this is v0.2.3", no immutable pointer to a commit, and
   nothing that a user, a package manager, or a rollback could refer to.
3. **The manifest could not be trusted as a version source.** All four
   `package.json` files read `0.1.0` at commit `ebd7b88`, while the delivery map
   was at v0.2.3. The `version` field had never been maintained, so *any* check
   comparing a tag against the code would have failed — correctly.

The project also runs on a **single** production host (Oracle Cloud Free Tier,
Ampere A1). There is no staging environment, no blue/green, and no second
region. A bad deploy is a full outage, and the rollback story is "redeploy an
older SHA" — which only works if old SHAs are identified, immutable, and
provably good. That constraint is what drives most of the decisions below.

The stake is asymmetric. A failed lint wastes minutes. A release is the one
artifact that **cannot be quietly retracted** — it is a published, timestamped
claim about what a version contains. So the design bias throughout is
*fail closed*: where a check cannot prove a thing, it refuses rather than
assumes.

## Decision

Split the pipeline into three workflows with distinct triggers, and gate each
one on an independently verifiable fact about the commit.

```
push/PR to main  →  ci.yml   →  success  →  cd.yml   →  production
git push vX.Y.Z                  release.yml            →  GitHub Release
```

### D1 — CI and CD are separate workflow files, not jobs in one file

`.github/workflows/ci.yml` holds five jobs with **no** `needs:` between them, so
nothing is sequenced and every check reports independently.
`.github/workflows/cd.yml` holds the single `deploy` job and triggers on
`workflow_run` of a completed `CI` run.

- **Rejected: keep one file with `needs:` on the deploy job.** This is the
  status quo and it is the thing being fixed. `needs:` orders jobs *within* one
  run; it cannot express "this deploy is gated on a check that ran against
  exactly this SHA" in a way that survives a re-run, a skipped job, or a manual
  dispatch. It also cannot be re-run independently — a redeploy would have to
  re-run lint and tests.
- **Rejected: branch protection with required status checks.** This is the
  industry-default answer and it is the right long-term one, but it gates
  *merges*, not *deploys*. It does nothing for the manual-redeploy path, where
  the risk is an operator shipping an untested commit. Both are wanted; the
  check-runs assertion (D3) is the one that covers both paths.
- **Consequence:** two files to maintain, and a cross-workflow dependency that
  is invisible in either file alone. Mitigated by an explicit header comment in
  each file naming the other, and by the fact that `cd.yml` re-verifies rather
  than trusts the trigger.

### D2 — A version has one source of truth: root `package.json`

`scripts/set-version.mjs` owns the version. `npm run version:set X.Y.Z` writes
the root manifest and mirrors it into `frontend/`, `backend/` and `scripts/`.
`npm run version:check` exits non-zero on drift and is a CI job in its own right.

- **Rejected: a bare `VERSION` file.** A conventional choice, but it creates a
  third thing that can disagree with four manifests, and nothing enforces
  agreement. `package.json` is already read by every tool in the repo; a
  parallel file is one more source of truth, not fewer.
- **Rejected: let each workspace version independently.** Genuine monorepo
  practice, and the right answer for a published library. Wrong here: nothing is
  published, and a release guard that has to query three manifests to learn the
  version is three chances to be wrong instead of one.
- **Consequence:** the mirror is duplicated state, so it needs a gate. That is
  what the `version-check` job is; it also runs inside the release guard and as
  a cheap pre-flight in `cd.yml`.

### D3 — The deploy gate is `workflow_run` **plus** a fail-closed `check-runs` assertion

The `if:` on the deploy job accepts the automatic path only when the triggering
CI run succeeded, was a push, was on `main`, and came from this repository. Then
a **second, independent step** asks the `check-runs` API what actually ran
against the target SHA, and fails if any run is not `completed`/`success` **or
if there are zero runs at all**.

- The zero-runs case is the whole point: an empty response must not be read as
  "nothing objected". Failing closed is the difference between "we have evidence
  this is good" and "we have no evidence".
- On the **manual** `workflow_dispatch` path this assertion is the *only* CI
  gate, and it is what stops an operator deploying a commit that never passed.
  That is the case a `needs:` chain or branch protection would miss entirely.
- The `head_repository.full_name == github.repository` check exists so that a
  fork's identically named `CI` workflow cannot trigger a production deploy of
  this repository's host. A fork is the one party that can run a workflow named
  `CI` and have it land in this repo's `workflow_run` stream.
- **Rejected: trust the `workflow_run` conclusion alone.** It is a single
  unverified statement that the thing we care about is true. It says a run
  concluded `success`; it does not say *which commit* that run was for. D4 exists
  precisely because of that gap.

### D4 — Deploy the triggering run's `head_sha`, and assert the host is on it

A `workflow_run` run's own `github.sha` is the default-branch tip **as of that
run**, which may already be newer than the commit CI passed. The workflow
therefore resolves `head_sha` from the event, validates it is a 40-hex SHA,
checks out that exact ref, and passes it to the host. The host runs
`git fetch && git checkout --force "$GIT_SHA"`, then asserts
`git rev-parse HEAD` equals it, and refuses to continue otherwise.

- **Rejected: `git pull origin main` on the host.** This is the bug being fixed.
- **Consequence:** the deploy host's `main` goes stale, which is fine — nothing
  on it relies on being up to date, and detached HEAD is harmless because the
  deploy creates no commits. The old behaviour also meant a rollback was
  "whatever was in `main` five minutes ago", which is not a rollback.

### D5 — Post-deploy verification polls, and asserts the commit it deployed

Containers accept connections before the app can answer, so a fixed `sleep` is
both too slow when healthy and too short when slow. The deploy polls
`http://localhost/api/health` up to 30 times at 5s intervals and only reports
success when the response contains the exact `GIT_SHA` being deployed.

This is why `/api/health` reports `{ status, version, commit }` at all: a health
endpoint that cannot identify which build answered cannot be used to verify
which build answered. The same value reaches the browser via
`NEXT_PUBLIC_APP_VERSION` as a **build arg** (not a runtime env var — it is
inlined into the bundle by `next build`, so setting it at runtime would change
nothing) and renders in the footer.

The two consumers degrade differently, and the difference is deliberate.
`docker-compose.prod.yml` **always** supplies a value, defaulting to the literal
string `unknown` when the environment does not. The backend's `readEnv` treats
that string as a real value and reports it verbatim; the Footer treats it as a
**sentinel** and renders a bare `unknown`, with no `v` prefix. Prefixing it
would put `vunknown` in front of users and make a broken injection
indistinguishable from a real version — which is the specific lie this
mechanism exists to prevent. The deploy asserts against the real version, not
the sentinel: the health poll requires `version` to equal the `APP_VERSION` it
resolved from `package.json` (a SemVer string, so it cannot be the sentinel),
and a mismatch is a failed deploy rather than a warning.

### D6 — A release is cut by a human pushing a tag; the workflow never creates one

`release.yml` triggers on `tags: ['v*']` and publishes with
`gh release create --verify-tag`, which makes the CLI fail rather than create a
missing tag. Tagging is therefore structurally a separate, human act — the
workflow cannot tag on your behalf even if someone edits it to try.

- **Rejected: `softprops/action-gh-release`.** The most common action for this.
  The `gh` CLI is preinstalled on `ubuntu-latest`, so it adds no dependency to
  install, no third-party action to pin, audit, or trust, and it has
  first-class flags for exactly what is needed. Fewer moving parts for a
  one-shot operation.
- **Rejected: a raw `gh api` call.** Requires hand-built JSON, where a single
  quoting mistake silently corrupts the release notes.
- **Rejected: cut a tag automatically on every merge, or on version change.**
  Auto-tagging makes "released" mean "merged", which destroys the signal. A tag
  must be a decision someone took.

### D7 — Four guards, all of which fail the job

| # | Guard | Blocks |
| - | ----- | ------ |
| 1 | Tag is exactly `v<MAJOR.MINOR.PATCH>` | `v0.2.3.4`, `v01.2.3`, `v0.2.3-rc.1` |
| 2 | `version:check` passes and the tag matches the manifest at the tagged commit | a release labelled v0.2.4 published from code saying 0.2.3 |
| 3 | `CHANGELOG.md` has a non-empty, unique section for the version | a tag with no entry, or a truncated body |
| 4 | The tagged commit is reachable from `origin/main`, and `HEAD` is what the tag points at | releasing a side-branch commit |

There is deliberately **no** "warn and continue" path. Each guard is chosen so
that it can only be wrong in the direction of refusing. Guard 1's regex is a
*second, independent implementation* of the same rule that
`release-notes.mjs` enforces: a single shared parser that was subtly wrong would
otherwise let a malformed tag through the very check meant to catch it.

**Prereleases are rejected.** A prerelease GitHub Release is a different product
decision — it needs `--prerelease` and it changes what "latest" means.
`set-version.mjs` accepts `-rc.1` in the manifest (so a version can be prepared),
while the tag guard and `RELEASABLE` do not. Shipping a prerelease later is a
deliberate edit to three named places.

### D8 — Release notes are extracted from the changelog, never generated

`scripts/release-notes.mjs` pulls the `## v<semver> — <title>` section verbatim.
`--generate-notes` is **not** passed to `gh release create`, and that omission is
the mechanism: `gh` only calls the Release Notes API when given the flag.

- **Why not generated notes:** they are derived from the commit log, so they
  duplicate the curated changelog — and worse, they can *contradict* it. This
  repository's changelog records decisions that read as changes in the log but
  shipped as non-changes ("cut the match-level bonuses"). A generated body would
  list the removal of a feature that was never present.
- **Why strict heading matching:** `v0.2.4` appears in this repo's prose with no
  heading, and `v0.1.5` appears in prose well before its own heading. A
  substring or first-mention search returns the wrong section in both cases.
  Whole-version equality against a heading is the only rule that survives this
  file.
- Two lines are dropped from the extracted body: the heading (the release page
  already renders the title above it) and the `_Spec: …_` provenance line (on a
  release URL a repo-relative path is monospace text that resolves nowhere).
  The title is reused for the release title via `--print-title`, so title and
  body cannot disagree.

### D9 — Deploys and releases are serialized, not cancelled

`concurrency: { group: production-deploy, cancel-in-progress: false }` and
`group: release-<tag>` likewise. Two concurrent `up -d --build` runs on one host
race on the same containers and the same database; a cancelled deploy can leave
exactly that state behind. CI, by contrast, *does* cancel superseded PR runs —
superseded work is pure waste there, and no shared state is at risk.

### D10 — The destructive seed is guarded by the database, not by a flag

`backend/prisma/seed.ts` `deleteMany()`s all five tables before reinserting, so
running it against a populated database discards live data for nothing. It now
runs only when `SELECT COUNT(*) FROM "Game"` returns exactly `0`, executed inside
the `postgres` container. A psql failure aborts the deploy; so does any
non-integer result. The previous behaviour — seed on every deploy — was only
safe because the database had never been populated by anything else.

- **Rejected: a `--allow-destructive-seed` input or an env var.** A flag
  records intent, but intent is exactly what is unavailable and unreliable in an
  automated deploy. The database knows whether it is empty; asking it is more
  trustworthy than trusting a flag that was set once and copied.
- **Consequence:** seeding is a first-deploy-only operation. A deploy that
  genuinely needs a reseed now requires a deliberate, visible, out-of-band step.

## Consequences

### Accepted trade-offs

- **Two CI mechanisms now coexist**: `workflow_run` plus a check-runs assertion,
  *and* branch protection if it is ever enabled. Deliberate redundancy, not
  duplication — they gate different events (automatic vs manual deploy) and
  neither covers the other's blind spot.
- **The manual redeploy path is strictly safer than the automatic one in one
  respect and weaker in another.** It is the only path that can deploy a commit
  CI never saw, and the check-runs assertion is what makes that safe. It is also
  the only path with no `workflow_run` evidence to lean on, so the assertion is
  doing all the work.
- **`version` is duplicated into four manifests.** A mirror needs a gate; the
  `version-check` job is that gate, and it runs in three places (CI, release
  guard, deploy pre-flight) precisely because a missed mirror is silent.
- **Sequential deploys are slower under contention.** Deliberate: correctness on
  a single host outranks deploy latency for a project with no staging tier.
- **`environment: production` is declared but not yet fully exploited.** It gives
  deploys a history entry and a scope for deploy secrets; required reviewers and
  protection rules are available later without restructuring.

### Known gaps, recorded rather than papered over

- **Nothing here has run end-to-end.** No tag has ever been pushed, so no
  release run has been observed. The scripts the guards call are verified
  locally — `version:check` passes, `release-notes.mjs v0.2.3` returns a 21-line
  body with title `Precision XI Scoring System`, `v0.2.3-rc.1` / `v01.2.3` /
  `v0.2.3.4` are rejected, and `v0.2.4` correctly fails for having no heading.
  What is unproven is the workflow YAML around them. **Use `dry_run: true` before
  the first real tag.**
- **A tag not starting with `v` triggers nothing.** The `tags: ['v*']` pattern
  means a tag named `0.2.3` produces no run, no failure, and no log line. The
  mistyped tag is invisible. This is inherent to tag-pattern triggers and cannot
  be fixed inside the workflow.
- **The release workflow does not verify that CI passed on the tagged commit.**
  Guard 4 proves *reachability*, not *greenness*. The `check-runs` API needs
  `checks: read`, and `release.yml` is scoped to the minimum `contents: write`.
  A commit merged to `main` whose CI failed or was skipped could still be
  released. The fix is to widen the permission and copy D3's assertion; it is
  left open deliberately, because the residual risk is a merge-process question
  as much as a workflow one.
- **No staging environment.** Every gate here protects a single production host.
  A green pipeline proves the commit is *sound*, never that the deploy is
  *correct in context*.
- **The Node 24 production runtime is unverified.** The `cd.yml` deploy and the
  images it builds run on `node:24-alpine`, which is a runtime major bump over
  the `node:20-alpine` in the v0.1.6 spec and in `docs/v0.1/dev-6-docker-deploy.md`.
  Nothing in this repository builds either Dockerfile, so CI cannot vouch for
  that combination (`setup-node` on `ubuntu-latest` is not a Docker build), and
  the bump carries no development, spec doc, or release note of its own. Recorded
  as a deviation from plan in `docs/roadmap.md` §2 (v0.1.6), together with the
  rollback and the fact that no application code depends on a Node 24 feature.
  D5's `version` assertion protects against *deploying the wrong artifact*; it
  says nothing about whether that artifact starts.

### What would change these decisions

- **Adopting a staging tier** would make branch protection the primary gate and
  D3's assertion a backstop, rather than D3 being the primary gate.
- **Shipping a prerelease** (`v0.3.0-rc.1`) requires editing three places
  together — the tag regex in `release.yml`, `RELEASABLE` in
  `release-notes.mjs`, the SemVer check in `cd.yml` — plus passing
  `--prerelease`. If prereleases become routine, the two-implementation
  property in D7 is a maintenance cost worth paying deliberately rather than
  quietly.
- **Publishing packages** would make per-workspace versions correct (reversing
  D2) and would make `--generate-notes` worth reconsidering, since a registry
  release carries its own generated provenance.
- **A second host or region** would invalidate the single-host assumptions
  throughout D9 and D10.

## Related

- `docs/roadmap.md` [§5](../roadmap.md#5-verification-baseline) — the measured
  verification baseline the guards depend on
- `docs/roadmap.md` [§6](../roadmap.md#6-release-process) — the process as
  operated, and the dev-doc status backfill
- `CHANGELOG.md` — the source of truth for release bodies (D8). Its
  `## v<semver> — <title>` heading structure is a **load-bearing interface** for
  `scripts/release-notes.mjs`; changing the separator, the level, or the `v`
  prefix breaks the release workflow.
