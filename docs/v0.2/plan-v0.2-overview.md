# FootPlay v0.2 — Missing Eleven Enhanced

**Status**: `planned`
**Date**: 2026-09-04
**Source**: Brainstorming session with project owner

---

## 1. What's Changing

v0.2 enriches the Missing Eleven experience with three features:
- Team-authentic shirt colors that make the board feel like a real match
- The ability to guess both teams' lineups via a simple toggle
- A scoring system that rewards precision and football knowledge

No new games, no auth, no infrastructure changes — just gameplay depth.

## 2. Feature Summary

| Feature | What it does | Effort |
|---|---|---|
| Team Colors | Shirts reflect real kit colors per team | S (2-3 days) |
| Opponent Toggle | Guess both teams via board toggle | M (3-4 days) |
| Scoring System | Attempt-based scoring + bonuses | M (3-4 days) |
| Integration & Polish | E2E testing, edge cases, smooth transitions | S (2-3 days) |

**Total estimated effort**: 10-14 days (2-3 weeks)

## 3. What's NOT in v0.2

- No auth/user accounts (deferred)
- No filters or difficulty modes (deferred)
- No new games
- No share/social features
- No daily puzzle
- No timer
- No streak tracking

## 4. Dependencies

v0.2 builds on v1.0. All v1.0 features must be working. No new infrastructure required.

## 5. Key Decisions Made

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D1 | Shirt color source | Static curated lookup (~60-80 teams) | No external dependency, covers most popular teams |
| D2 | Color model per team | primary, secondary, pattern (solid/stripes/halves) | Simple, covers most iconic home kits |
| D3 | Fallback for unknown teams | Neutral gray/white, no pattern | Clean default, no errors |
| D4 | Loss condition | No early game-over — play until all 22 resolved | Rewards completion, no frustration from early exit |
| D5 | Toggle UX | Simple toggle switch, no progress indicators | Minimal, clean, doesn't clutter the board |
| D6 | Scoring: correct guess | Linear decay: 1000 → 100 based on attempts used | Transparent, rewards precision |
| D7 | Scoring: failed guess | Letter-based partial credit (correct_letters / total × 150) | Rewards partial knowledge |
| D8 | Scoring: bonuses | Full House (+500), Clean Sweep (+2000), One-Try Wonders (+1000) | Incentivizes completion and excellence |

## 6. Risk Register

| ID | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Color lookup doesn't cover enough teams | Medium | Low | Fallback is clean default; easy to add more teams later |
| R2 | SVG pattern rendering edge cases | Low | Low | Test with 5-10 pattern types; fallback to solid |
| R3 | Game state refactor for 22 shirts introduces bugs | Medium | Medium | Thorough testing in Dev 4; incremental state changes |
| R4 | Scoring math errors | Low | Medium | Unit test the scoring function with 20+ scenarios |
| R5 | Toggle UX feels clunky on mobile | Low | Medium | Test on real devices; keep toggle simple and sticky |

## 7. Release Criteria

- [ ] Team colors render correctly for all curated teams
- [ ] Unknown teams fall back to neutral default
- [ ] Toggle switches between target and opponent boards
- [ ] Both teams' shirts have independent guess state
- [ ] Game ends when all 22 shirts are resolved
- [ ] Scoring calculates correctly per-player and with bonuses
- [ ] Live score counter updates after each guess
- [ ] GameComplete shows full breakdown for both teams
- [ ] No regressions in existing v1.0 functionality
- [ ] All changes pass lint and build
