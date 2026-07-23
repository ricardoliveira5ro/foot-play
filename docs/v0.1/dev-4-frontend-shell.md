# Development 4: Frontend Shell & Layout

**Status**: `ready for implementation`
**Source**: `docs/v0.1/plan-v1.0-decomposition.md` (Development 4)
**Estimated Effort**: S (2-3 days)

---

## Objective

Build the frontend foundation — shared layout, page structure, and all game components in their initial form. By the end of this development, the `/missing-eleven` route renders a tactic board with 11 shirts, match info, and interactive shirt state changes — all driven by **mock data** (no real API dependency yet). This development can run in parallel with Dev 2 and Dev 3.

---

## Approach

**Component tree**:
```
Layout
├── Navbar
├── /missing-eleven/page.tsx (game wrapper)
│   ├── MatchInfo (score, date, competition)
│   └── TacticBoard (pitch background)
│       └── Shirt × 11 (position-based, state-driven)
└── Footer
```

**State management**: Components accept props and optional callback functions. For now, the page can use `useState` for demo interactions.

**Mock data**: A static mock object in `frontend/src/lib/mockData.ts` mimics the API response shape from Dev 3.

**Shirt component states**:
1. **Default**: Shirt color with player number
2. **In progress**: Below shirt, guessed letters displayed (e.g., `..R...`)
3. **Correct**: Full player name below shirt in default color
4. **Failed**: Correct name below shirt in red

**TacticBoard rendering**: CSS-based pitch with shirts positioned using absolute positioning (top/left percentages). Pitch rendered as green rectangle with white markings via CSS/SVG.

**Responsive design**: Desktop-first, minimum 44px touch target on mobile.

---

## Detailed Tasks

### Task 4.1: Create shared Layout, Navbar, and Footer components

- **Description**: Build the reusable site shell that wraps all pages.
- **Files to create/modify**:
  - `frontend/src/app/layout.tsx` — modify to use Layout component
  - `frontend/src/components/Layout.tsx` — Nav + main + Footer wrapper
  - `frontend/src/components/Navbar.tsx` — site logo, navigation links
  - `frontend/src/components/Footer.tsx` — copyright, links
- **Acceptance criteria**:
  - [ ] Layout renders on all pages
  - [ ] Navbar shows "FootPlay" logo and "Missing Eleven" link
  - [ ] Footer shows copyright
  - [ ] Responsive: Navbar collapses hamburger menu on mobile
- **Validation**: Verify layout at desktop and mobile viewport sizes.

### Task 4.2: Create TypeScript type definitions

- **Description**: Define all game-related types matching the API response shape.
- **Files to create/modify**:
  - `frontend/src/types/index.ts` — all shared types
- **Key types**: Match, Club, LineupPlayer, PositionCoords, MatchResponse, PlayerSearchResult, PlayerSearchResponse, ShirtState ('default' | 'in-progress' | 'correct' | 'failed'), ShirtData, TeamSide
- **Acceptance criteria**:
  - [ ] All types compile without errors
  - [ ] Types match the API response shape from Dev 3
  - [ ] `ShirtState` is a union type with 4 values
- **Validation**: `npm run build` in frontend passes TypeScript compilation.

### Task 4.3: Create API client module (with mock data fallback)

- **Description**: Build the API client with `USE_MOCK` flag to switch between real/mock data.
- **Files to create/modify**:
  - `frontend/src/lib/api.ts` — fetch wrapper with error handling
  - `frontend/src/lib/mockData.ts` — static mock match response (2+ matches)
- **Functions**: `fetchRandomMatch()`, `fetchMatchById(id)`, `searchPlayers(query)`
- **Acceptance criteria**:
  - [ ] `fetchRandomMatch()` returns a MatchResponse object
  - [ ] `fetchMatchById(1)` returns a match
  - [ ] `searchPlayers("ron")` returns results
  - [ ] API functions throw on network errors
- **Validation**: Import and call each function in browser console.

### Task 4.4: Build TacticBoard component

- **Description**: Render a football pitch with shirts positioned at coordinates.
- **Files to create/modify**:
  - `frontend/src/components/TacticBoard.tsx` — pitch SVG/CSS + shirt placement
  - `frontend/src/components/Pitch.tsx` — optional sub-component for pitch background
- **Rendering**: `position: relative` div with `aspect-ratio: 2/3`. Green background with white SVG markings (center circle, halfway line, penalty areas). Shirts positioned absolutely with `left: ${x}%; top: ${y}%; transform: translate(-50%, -50%)`. Formation label and team name displayed above pitch.
- **Acceptance criteria**:
  - [ ] Pitch renders as green rectangle with correct proportions
  - [ ] Pitch markings visible (center circle, halfway line, penalty areas)
  - [ ] 11 shirts positioned according to coordinate data
  - [ ] Shirts evenly distributed, not overlapping
  - [ ] Formation label displays above the pitch
- **Validation**: Render with mock data. Visually inspect formation. Verify positioning percentages in DevTools.

### Task 4.5: Build Shirt component (4 states)

- **Description**: Render an individual shirt with 4 clearly distinguishable visual states.
- **Files to create/modify**:
  - `frontend/src/components/Shirt.tsx` — shirt component
- **State rendering**:
  - **Default**: Colored shirt SVG with shirt number. Name NOT shown.
  - **In progress**: Shirt + guessed letters below in monospace (`_ _ R _ _ _`)
  - **Correct**: Shirt + full player name in default text color
  - **Failed**: Shirt + full player name in red text
- **Acceptance criteria**:
  - [ ] All 4 states render distinctly
  - [ ] Shirt number visible in default state
  - [ ] In-progress shows underscores for unguessed letters
  - [ ] Correct state shows full player name
  - [ ] Failed state shows full player name in red
  - [ ] Component is clickable (onClick fires)
- **Validation**: Render each state with test props. Verify distinct styling.

### Task 4.6: Build MatchInfo component

- **Description**: Display match metadata — home team vs away team with score, date, competition.
- **Files to create/modify**:
  - `frontend/src/components/MatchInfo.tsx`
- **Acceptance criteria**:
  - [ ] Shows team names: "Manchester City 4-1 Chelsea"
  - [ ] Shows date below score
  - [ ] Shows competition name below date
  - [ ] Responsive: scores prominent on mobile
- **Validation**: Render with mock match data.

### Task 4.7: Create the /missing-eleven page route

- **Description**: Wire up the game page composing MatchInfo, TacticBoard, and Shirt components with mock data.
- **Files to create/modify**:
  - `frontend/src/app/missing-eleven/page.tsx` — game page
  - `frontend/src/app/page.tsx` — update home page with link to game
- **Page logic**:
  1. On mount, fetch mock match data
  2. Display MatchInfo at top
  3. Display TacticBoard with 11 shirts
  4. Each shirt click cycles states (default → in-progress → correct → failed) — TEMPORARY
  5. Randomly select one team (home/away) as active team
- **Acceptance criteria**:
  - [ ] `/missing-eleven` renders MatchInfo and TacticBoard
  - [ ] 11 shirts visible in formation layout
  - [ ] Clicking a shirt cycles through states
  - [ ] Page is responsive (mobile-friendly)
  - [ ] No API server required — works entirely with mock data
- **Validation**: Navigate to `/missing-eleven`. Click shirts to cycle states.

### Task 4.8: Tailwind configuration and responsive design

- **Description**: Set up Tailwind with custom theme values, ensure responsive breakpoints work.
- **Files to modify**:
  - `frontend/tailwind.config.ts` — add custom colors, fonts, breakpoints
- **Additions**:
  - Custom color: `pitch-green` (#2e7d32 or similar)
  - Custom font: system font stack
  - Ensure Tailwind JIT compiles all used classes
- **Acceptance criteria**:
  - [ ] Custom theme values available as Tailwind classes
  - [ ] Page renders at 375px (mobile), 768px (tablet), 1280px (desktop)
  - [ ] Shirts meet 44px minimum touch target on mobile
- **Validation**: Use Chrome DevTools responsive mode at all three breakpoints.

---

## Dependencies

- **Dev 1 (Repo Scaffold & Prisma Schema)** — Next.js app must exist
- **No dependency on Dev 2 or Dev 3** — uses mock data (can run in parallel)

---

## Effort Estimate

**S (2-3 days)**

| Task | Estimate |
|------|----------|
| Task 4.1 (Layout, Navbar, Footer) | 0.5 day |
| Task 4.2 (TypeScript types) | 0.25 day |
| Task 4.3 (API client + mock data) | 0.5 day |
| Task 4.4 (TacticBoard) | 0.75 day |
| Task 4.5 (Shirt) | 0.5 day |
| Task 4.6 (MatchInfo) | 0.25 day |
| Task 4.7 (/missing-eleven page) | 0.5 day |
| Task 4.8 (Tailwind config + responsive) | 0.25 day |

---

## Risk Factors

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Shirt positioning overlaps for some formations | Medium | Medium | Test with 5 common formations. Add minimum distance constraint. |
| Pitch SVG markings complex to render | Low | Low | Use simplified markings. SVG overlay well-documented. |
| Responsive layout breaks on very small screens | Low | Low | Set minimum container width, allow horizontal scroll. |

---

## "Done" Checklist

- [ ] `/missing-eleven` renders with mock data (no API required)
- [ ] MatchInfo shows score, teams, date, competition
- [ ] TacticBoard renders a green pitch with 11 shirts in formation
- [ ] Pitch markings visible (center circle, halfway line, penalty areas)
- [ ] Shirt component has 4 distinct visual states
- [ ] Clicking a shirt changes its state
- [ ] Layout, Navbar, Footer render correctly
- [ ] Responsive design works on mobile, tablet, desktop
- [ ] TypeScript types defined and compile
- [ ] API client module exists with mock data fallback
- [ ] `npm run lint` passes
- [ ] All changes committed to `dev-4/*` branch
