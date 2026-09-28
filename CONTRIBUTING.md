# Contributing to FootPlay

FootPlay is a small solo-maintained project, so the rules here are short. They
exist because this repo has a strong documentation habit, not because of
process overhead: the docs are how the next change gets scoped, and a code
change that quietly contradicts its spec is the thing that actually costs time
here.

## Prerequisites

- **Node.js 24** — required, not merely recommended. The root `engines.node`
  field says `>=24.0.0`, `.nvmrc` pins `24`, CI installs Node 24 in every job,
  and both Dockerfiles build on `node:24-alpine`. Node 18 or 20 will not
  reproduce CI, and the production images do not run on them either.
- **Docker** — a working daemon is required for the local PostgreSQL container
  and for the backend test suite, which uses Testcontainers to start a real
  PostgreSQL 16.

```bash
nvm use      # reads .nvmrc
npm install
```

## Ground rules

- Read [`docs/roadmap.md`](docs/roadmap.md) first. It is the reality source —
  what shipped, what is open, and every recorded deviation. Do not trust a plan
  doc over the roadmap; the roadmap wins.
- Work on a branch, never directly on `main`.
- One development per branch. Match the branch to a `dev-N` spec where one
  exists.

## Branch naming

Lower-case, hyphenated, descriptive. Name it after the development when there is
one:

```
v02-4-integration-polish
scoring-system
release-gate
fix-wordle-duplicate-letters
```

Merge to `main` with a PR. Merging to `main` is what triggers the pipeline and
the deploy — see [Release Process](docs/roadmap.md#6-release-process).

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>(<optional scope>): <imperative summary in lowercase>
```

**Types**: `feat`, `fix`, `test`, `chore`, `ci`, `refactor`, `docs`, `perf`.
This history also uses `bug` as a type in places; prefer `fix`.

**Scopes** in use here: `frontend`, `backend`, `sonar`, `ci`, `deploy`, `seed`,
`db`, `missing-eleven`, `docs`, and the milestone (`v0.2`, `v0.2.3`) when a
commit belongs to a specific shipped version.

Real examples from `git log`:

```
feat(v0.2.3): add precision scoring system to Missing Eleven
feat(v0.2): add opponent lineup toggle for dual-team gameplay
fix(frontend): align Vitest aliases and GameComplete tests
test(backend): add full test suite with 95% coverage gate
ci(sonar): wire frontend coverage into SonarCloud
chore(frontend): add test:coverage script and @vitest/coverage-v8 devDep
refactor(backend): reduce cognitive complexity in formation and wordle services
feat(deploy): automate database seeding on every deploy
```

Some older commits predate the convention (`Improve Missing Eleven match panel
layout`, `Wire colors through TacticBoard`). New commits should not.

## Before you open a PR

```bash
npm run version:check                   # manifests agree with root; no deps needed
npm run lint                            # must be clean
npm test -w frontend                    # no Docker needed
npm test -w backend                     # needs a working Docker daemon
npm run test:coverage -w backend        # enforces the 95% gate
npm run test:coverage -w frontend       # enforces the frontend gate (src/ only)
```

- **New behaviour needs a test.** Both suites enforce coverage thresholds, so an
  untested branch can fail the build outright. The backend gate is 95% on all
  four metrics; the frontend gate is 95/90/95/95 — but note it measures
  `frontend/src/` only, so `app/`, `components/` and `lib/` are outside it.
  Write frontend tests for new logic in those directories anyway; the gate will
  not catch their absence.
- Keep the diff to the scope you declared. No drive-by refactors, no unrelated
  formatting.
- Never commit `.env`, `.env.development`, `.env.production`, `scripts/data/`,
  or anything from `node_modules/`. All of them are gitignored already.
- Run `npm run format` if you touched files Prettier covers.

## What the PR must include

The repo's documentation is part of the deliverable. A PR that changes shipped
behaviour without touching the docs is incomplete.

1. **The spec doc** — either a new `docs/v0.X/dev-N-*.md` or an update to the
   existing one. Set its `**Status**` field to reflect reality. (Ten of the
   fourteen existing spec docs are still marked `ready for implementation` or
   `planned` although they shipped; that drift is tracked in the roadmap, and
   not adding to it is the point.)
2. **A `CHANGELOG.md` entry** under the correct `<milestone>.<development>`
   heading, in Keep-a-Changelog sections (`Added` / `Changed` / `Fixed` /
   `Removed`).
3. **Deviations recorded in both places.** If the implementation does not match
   the spec, say so in the spec doc *and* in the `CHANGELOG.md` entry, with the
   reason. This is a valued practice here, not a confession of failure — the
   v0.2.3 entry is mostly a record of bonuses that were cut before release, and
   that record is the only reason anyone still knows they were ever planned.
4. **No regression** against the verification baseline in
   [`docs/roadmap.md` §5](docs/roadmap.md#5-verification-baseline). If your
   numbers moved, explain why in the PR.
5. **The roadmap updated**, if this closes or opens a development.

The [PR template](.github/pull_request_template.md) walks through all of this.

## Versioning

FootPlay uses a **two-component** version, `<milestone>.<development>` — not
SemVer. The development number is not arbitrary: it is the `dev-N` in the spec
doc that defined the work. `docs/v0.1/dev-3-core-rest-api.md` shipped as
**v0.1.3**.

Git tags are **not used yet** — no tag exists in this repository, so
`docs/roadmap.md` [§6.4](docs/roadmap.md#6-release-process) records the decision
that **the first tag is `v0.2.3`**, and the nine earlier versions
(v0.1.1–v0.2.2) are deliberately left untagged because a backfilled tag would
assert a release event that never happened. Releases are otherwise recorded in
`CHANGELOG.md` and the delivery map in `docs/roadmap.md`. Release tooling and its
four guards are in
[`docs/decisions/001-release-process.md`](docs/decisions/001-release-process.md).

## Architecture notes worth knowing before you touch things

- **Pure logic stays pure.** `frontend/src/lib/{wordle,gameState,scoring,teamColors,colorUtils}.ts`
  have no side effects and are unit-tested directly. Keep new logic in that
  shape where it fits.
- **The server is the authority on guesses.** The Wordle evaluator exists twice
  by design: `backend/src/services/wordle.ts` is authoritative, the frontend
  copy exists so the UI can stay responsive. Display names are never sent to the
  client before a correct guess.
- **Shirts are addressed by token, not by id or shirt number.** The token is
  `HMAC-SHA256(PLAYER_TOKEN_SECRET, "gameId:playerId")`, truncated. This is
  what stops the answer being read from the network tab. Do not introduce a
  path that returns a name before a correct guess.
- **The seed is filter-first.** `scripts/curated-teams.json` is the allow-list
  (17 clubs, 8 national teams) and only complete starting XIs are kept. If you
  widen the data, widen the curated set deliberately — a bad row in the
  database becomes an unanswerable shirt in the game.
- **Games are stateless.** There is no server-side session model and no
  `localStorage` persistence (it shipped and was removed in v0.1.5). Restoring
  it is open scope in v0.2.4 and is not a small change — it reintroduces the
  hydration mismatch that got it deleted.

## Reporting bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml). Steps to
reproduce matter more than a precise description of the symptom. If the answer
came out of a `/api` response, paste the JSON — but redact player tokens.

## License

MIT. See [LICENSE](LICENSE).
