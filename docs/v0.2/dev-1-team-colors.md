# Development 1: Team-Specific Shirt Colors

**Status**: `planned`
**Source**: `docs/v0.2/plan-v0.2-overview.md` (Feature 1)
**Estimated Effort**: S (2-3 days)

---

## Objective

Replace the default white/gray shirt colors with team-authentic colors. Each team's shirts reflect their real home kit — Barcelona gets red/blue stripes, Juventus gets black/white halves, Brazil gets yellow/green, etc. Teams not in the curated lookup get a clean neutral default.

---

## Approach

**Color lookup**: A static lookup map in a new file (`frontend/src/lib/teamColors.ts`) keyed by club ID (a number). Each entry defines three things:
- A primary color: the hex color used for the main shirt fill (e.g., #A50044 for Barcelona)
- A secondary color: the hex color used for accents and stripes (e.g., #004D98 for Barcelona)
- A pattern: one of four values — solid, vertical stripes, horizontal stripes, or halves

**Coverage**: 25+ curated teams — all entries from `frontend/lib/curatedTeams.ts` plus popular extras.

**Fallback**: Unknown teams get a neutral default: primary #F8FAF8 (the current white), secondary #E2E8F0 (light gray), and the solid pattern.

**No backend changes**: The API already returns the club ID and club name on each team's club object (the home club and away club of the game). The frontend does the lookup client-side.

**Contrast utility**: A separate pure function determines dark or light text color based on the primary shirt color's relative luminance (WCAG 2.1 formula). This keeps shirt numbers readable on any background.

---

## Detailed Tasks

### Task 1.1: Create team color lookup

- **File to create**: `frontend/src/lib/teamColors.ts`
- **What this connects to**: The club ID is exposed on the game response's home club and away club objects (see `frontend/types/index.ts` lines 6-9). The curated teams file at `frontend/lib/curatedTeams.ts` uses the same club IDs, so the map keys must match them.

**Step 1**: Create the file `frontend/src/lib/teamColors.ts`.

**Step 2**: Define the shape of a team color entry at the top of the file. It should have three fields: a primary color string, a secondary color string, and a pattern field restricted to one of the four pattern values (solid, vertical stripes, horizontal stripes, halves). Export this shape so other files can import it.

**Step 3**: Define the default colors constant: primary #F8FAF8, secondary #E2E8F0, and the solid pattern. Export it so the fallback path can reuse it.

**Step 4**: Create the team colors map. The keys must match the club ID values from `frontend/lib/curatedTeams.ts`. Below is the full table of curated teams with real kit colors:

| clubId | Name | Primary | Secondary | Pattern |
|-------:|------|---------|-----------|---------|
| 131 | FC Barcelona | `#A50044` | `#004D98` | `stripes-v` |
| 418 | Real Madrid | `#FFFFFF` | `#FEBE10` | `solid` |
| 27 | Bayern Munich | `#DC052D` | `#FFFFFF` | `solid` |
| 506 | Juventus | `#000000` | `#FFFFFF` | `halves` |
| 31 | Liverpool FC | `#C8102E` | `#FFFFFF` | `solid` |
| 281 | Manchester City | `#6CABDD` | `#FFFFFF` | `solid` |
| 583 | Paris Saint-Germain | `#004170` | `#DA291C` | `solid` |
| 11 | Arsenal FC | `#EF0107` | `#FFFFFF` | `solid` |
| 148 | Tottenham Hotspur | `#132257` | `#FFFFFF` | `solid` |
| 631 | Chelsea FC | `#034694` | `#DBA111` | `solid` |
| 985 | Manchester United | `#DA291C` | `#FBE122` | `solid` |
| 5 | AC Milan | `#FB090B` | `#000000` | `stripes-v` |
| 46 | Inter Milan | `#0068A8` | `#000000` | `stripes-v` |
| 13 | Atlético de Madrid | `#CB3524` | `#FFFFFF` | `stripes-h` |
| 294 | SL Benfica | `#FF0000` | `#FFFFFF` | `solid` |
| 336 | Sporting CP | `#00843D` | `#FFFFFF` | `stripes-v` |
| 720 | FC Porto | `#003893` | `#FFFFFF` | `stripes-h` |
| 3300 | Portugal | `#006600` | `#FF0000` | `solid` |
| 3375 | Spain | `#AA151B` | `#FABD00` | `solid` |
| 3377 | France | `#002395` | `#FFFFFF` | `solid` |
| 3262 | Germany | `#000000` | `#FFFFFF` | `solid` |
| 3299 | England | `#FFFFFF` | `#CF081F` | `solid` |
| 3376 | Italy | `#004B87` | `#FFFFFF` | `solid` |
| 3437 | Argentina | `#75AADB` | `#FFFFFF` | `stripes-v` |
| 3439 | Brazil | `#FFDC00` | `#009B3A` | `solid` |

Populate the map with one entry per team in the table above. Group the entries by league with short comments for readability: La Liga, Premier League, Bundesliga, Serie A, Ligue 1, Primeira Liga, and national teams. Each entry pairs the club ID with its color definition (primary color, secondary color, and pattern).

**Step 5**: Add the lookup function with fallback. Create a function that accepts a club ID and returns the matching color definition. If the club ID is not found in the map, return the default colors constant. This function is what the TacticBoard will call for each team. Export it so it can be imported elsewhere.

**What to verify after this step**:
- Run npx tsc --noEmit from the frontend directory — no type errors.
- The lookup function is exported and importable from the team colors module.

---

### Task 1.2: Create color contrast utility

- **File to create**: `frontend/src/lib/colorUtils.ts`
- **What this connects to**: The Shirt component needs this to choose dark or light text on the shirt number. The existing code uses a dark ink text color — this will be replaced with a dynamic choice.

**Step 1**: Create the file `frontend/src/lib/colorUtils.ts`.

**Step 2**: Implement the WCAG 2.1 relative luminance formula. This is the standard way to determine contrast. Three pieces:

- First, a helper that parses a hex color string into red, green, and blue channel values in the 0-255 range. It must handle both 3-digit (#RGB) and 6-digit (#RRGGBB) formats — for a 3-digit value, expand each digit by doubling it (e.g., #ABC becomes #AABBCC) before converting.
- Second, a function that computes relative luminance per WCAG 2.1: convert each channel from the 0-255 range to a 0-1 sRGB value, then apply the standard linearization — values at or below 0.03928 are divided by 12.92, larger values are raised to the 2.4 power after adding 0.055 and dividing by 1.055. Finally, combine the three linearized channels with the standard luminance weights (roughly 0.2126 for red, 0.7152 for green, 0.0722 for blue).
- Third, the exported contrast function: compute the relative luminance of the given background color and return "dark" when the background is light (luminance above the chosen threshold of 0.4) and "light" when the background is dark. The Shirt component calls this with the primary shirt color to pick the number color.

**What to verify after this step**:
- A white background (#FFFFFF) returns dark text.
- A black background (#000000) returns light text.
- Barcelona red (#A50044) returns light text.
- Man City sky blue (#6CABDD) returns dark text.
- Run npx tsc --noEmit from the frontend directory — no type errors.

---

### Task 1.3: Update Shirt component to accept and render colors

- **File to modify**: `frontend/components/Shirt.tsx`
- **What this connects to**: The component's props interface (lines 11-18), the SVG shirt path (line 150), and the shirt number span (line 154). Currently the fill and stroke colors are hardcoded.

**Step 1**: Add imports at the top of the file: the team color type from the team colors module and the contrast function from the color utilities module.

**Step 2**: Update the props interface to add an optional colors prop of the team color type. Document that when it is omitted, the component keeps its current default white/ink rendering. Keep the existing props (shirt data, index, click handler, guess history) unchanged.

**Step 3**: Update the component function signature to destructure the new colors prop alongside the existing ones.

**Step 4**: Replace the SVG section. The current code renders a single path with hardcoded fill and stroke. Replace it with a pattern-aware SVG that uses a defs section for pattern fills. The key insight: each pattern type needs a unique pattern ID — use the shirt's token to avoid collisions when two shirts on the same board share a team.

Describe the pattern approach:
- For vertical stripes: define a pattern tile that is a thin rectangle of the primary color followed by a thin rectangle of the secondary color, repeated across the shirt width. Concretely, the tile is 8 units wide and 64 units tall, with the primary color filling the first 4 units and the secondary color the next 4. Fill the shirt path by referencing this pattern.
- For horizontal stripes: do the same but rotated — a tile 64 units wide and 8 units tall, with the primary color in the top 4 units and the secondary in the bottom 4.
- For halves: split the shirt into two halves — fill the whole shirt path with the primary color, then overlay a rectangle covering the right half of the shirt (from the horizontal midpoint to the right edge) filled with the secondary color. Clip that overlay to the shirt path so it cannot spill outside the shirt shape; build the clip from the existing shirt path.
- For solid (or when no colors are provided): fill the shirt path with the primary color directly, falling back to the default white when colors are absent.
- In all cases, stroke the shirt path with the secondary color (falling back to the current ink stroke when absent), using a thin stroke width and rounded line joins so the shirt outline stays crisp.

**Step 5**: Update the shirt number span. Replace the hardcoded dark text class with a dynamic choice: call the contrast function with the primary color (falling back to the default white when no colors are provided). When the result is "light", use the light text color; when it is "dark", use the dark ink text color. Keep the existing font, sizing, and centering styles.

**What to verify after this step**:
- Run npx tsc --noEmit from the frontend directory — no type errors.
- The component still compiles without the colors prop (default behavior unchanged).
- Manual visual check: render a Shirt with Barcelona colors — stripes should show.

---

### Task 1.4: Wire colors through TacticBoard

- **File to modify**: `frontend/components/TacticBoard.tsx`
- **What this connects to**: The component's props (lines 5-10). It currently receives the team name, formation, shirts, and a click handler. The team's club ID is available on the game response's home club or away club object in the page component.

**Step 1**: Add an import at the top of the file for the lookup function and the team color type.

**Step 2**: Update the props interface to accept an optional club ID (a number). When it is omitted, the board uses the default colors.

**Step 3**: Update the component function to destructure the club ID and derive the colors: when the club ID is present, call the lookup function with it; otherwise leave the colors undefined. Pass the colors down to every Shirt rendered inside the pitch. Keep the existing section, heading, formation label, and pitch markup unchanged.

**Step 4**: Update the page component to pass the club ID. In `frontend/app/missing-eleven/page.tsx`, find the TacticBoard usage and add the club ID prop, derived from the current team side: when the picked side is home, use the home club's ID; otherwise use the away club's ID.

**What to verify after this step**:
- Run npx tsc --noEmit from the frontend directory — no type errors.
- Run npm run lint from the frontend directory — no lint warnings.
- Visual: Barcelona match → red/blue striped shirts. Real Madrid match → white shirts with gold text. Unknown team → default white shirts.

---

## Dependencies

- v1.0 must be complete (TacticBoard, Shirt, and API all working)

## Effort Estimate

**S (2-3 days)**

| Task | Estimate |
|---|---|
| Task 1.1 (color lookup) | 0.5 day |
| Task 1.2 (contrast utility) | 0.25 day |
| Task 1.3 (Shirt SVG changes) | 1 day |
| Task 1.4 (TacticBoard wiring) | 0.25 day |
| Buffer | 0.5 day |

## Risk Factors

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| SVG pattern rendering varies across browsers | Low | Low | Test in Chrome, Firefox, Safari; use simple patterns (rect fills, no complex gradients) |
| Color contrast fails for some combinations | Medium | Low | WCAG luminance check catches most cases; the table above was verified visually |
| Curated team list misses popular teams | Medium | Low | Easy to add more entries to the team colors map; fallback is clean |
| Halves pattern clipping edge cases | Low | Low | Use a clip path built from the existing shirt path — same path, just clipped |

## "Done" Checklist

- [ ] The team colors map has 25+ entries matching the curated teams IDs
- [ ] The contrast function returns correct values for light/dark backgrounds
- [ ] Shirts render with team-specific colors and patterns (vertical stripes, horizontal stripes, halves, solid)
- [ ] Fallback works for unknown teams (no colors prop or unmapped club ID)
- [ ] Shirt numbers are readable on all color combinations (dark text on light, light text on dark)
- [ ] No TypeScript errors (npx tsc --noEmit passes)
- [ ] Lint passes (npm run lint)
- [ ] Visual check: 5+ teams with different patterns look correct
- [ ] All changes committed