# Development 3: Core REST API

**Status**: `ready for implementation`
**Source**: `docs/v0.1/plan-v1.0-decomposition.md` (Development 3)
**Estimated Effort**: M (2-4 days)

---

## Objective

Build the three Express API endpoints that power the Missing Eleven game. By the end of this development, the backend serves match data with full lineups, individual match details, and player search — all with consistent error handling and logging.

---

## Approach

**Express app structure**: The backend scaffold from Dev 1 is extended with proper middleware, route files, and a service layer. Controllers are minimal — they parse the request, delegate to a service, and format the response.

**Endpoint design**:

1. `GET /api/matches/random`
   - Returns a random match with full lineup data for both teams
   - Uses `ORDER BY RANDOM() LIMIT 1` (acceptable for ~35k rows)
   - Returns: match metadata + both lineups with player details + position coordinates

2. `GET /api/matches/:id`
   - Same response shape as `/random` but for a specific match ID
   - Returns 404 if match not found

3. `GET /api/players?q=`
   - Server-side search by `display_name` (case-insensitive, partial match)
   - Returns top 20 matches
   - Minimum query length: 2 characters

**Error handling**: Middleware that catches all errors and returns consistent JSON shape.
**Logging**: Morgan middleware for request logging.
**CORS**: Configured to allow frontend origin.

---

## Detailed Tasks

### Task 3.1: Set up Express middleware stack

- **Description**: Add CORS, JSON body parser, Morgan logging, and error handling middleware.
- **Files to create/modify**:
  - `backend/src/index.ts` — add middleware imports
  - `backend/src/middleware/errorHandler.ts` — catch-all error handler, returns `{ error, code }`
  - `backend/src/middleware/logger.ts` — Morgan configuration
  - `backend/src/middleware/validate.ts` — param validation helpers
- **Acceptance criteria**:
  - [ ] CORS allows requests from `http://localhost:3000` (configurable)
  - [ ] All errors return JSON: `{ error: string, code: string }`
  - [ ] Request logs appear in console (method, path, status, duration)
  - [ ] `Content-Type: application/json` on all responses
- **Validation**: Hit non-existent route: `curl http://localhost:4000/api/nonexistent` returns `{ "error": "Not found", "code": "NOT_FOUND" }`.

### Task 3.2: Implement GET /api/matches/random

- **Description**: Build the endpoint returning a random match with full lineups and position coordinates.
- **Files to create/modify**:
  - `backend/src/routes/matches.ts` — route definitions
  - `backend/src/services/matchService.ts` — Prisma query logic
  - `backend/src/services/positionMapping.ts` — reuse from Dev 2
- **API response shape**:
  ```json
  {
    "match": {
      "id": 123, "date": "2023-05-28", "season": "2022/2023",
      "competition": "Premier League",
      "homeClub": { "id": 15, "name": "Manchester City" },
      "awayClub": { "id": 42, "name": "Chelsea" },
      "homeScore": 4, "awayScore": 1,
      "homeFormation": "4-3-3", "awayFormation": "4-2-3-1"
    },
    "homeLineup": [
      { "playerId": 1, "displayName": "Ederson", "shirtNumber": 31, "position": "Goalkeeper", "coords": { "x": 50, "y": 92 } }
    ],
    "awayLineup": [...]
  }
  ```
- **Acceptance criteria**:
  - [ ] Returns 200 with valid JSON response
  - [ ] Includes match metadata + Both lineups with exactly 11 players each
  - [ ] Competition name is resolved (not raw ID)
  - [ ] Each lineup entry has: playerId, displayName, shirtNumber, position, coords
  - [ ] Response time < 500ms
- **Validation**: `curl http://localhost:4000/api/matches/random | jq '.homeLineup | length'` returns 11.

### Task 3.3: Implement GET /api/matches/:id

- **Description**: Build the endpoint for fetching a specific match by its internal ID.
- **Files to modify**:
  - `backend/src/routes/matches.ts` — add `:id` route
  - `backend/src/services/matchService.ts` — add `getMatchById(id)`
- **Acceptance criteria**:
  - [ ] `GET /api/matches/1` returns a valid match with full lineup
  - [ ] `GET /api/matches/9999999` returns 404 with error JSON
  - [ ] Same response shape as `/random`
  - [ ] Invalid ID (non-numeric) returns 400
- **Validation**: `curl http://localhost:4000/api/matches/1 | jq '.match.id'` returns 1.

### Task 3.4: Implement GET /api/players?q=

- **Description**: Build the debounced player search endpoint.
- **Files to create/modify**:
  - `backend/src/routes/players.ts` — route definitions
  - `backend/src/services/playerService.ts` — Prisma search query
  - `backend/src/index.ts` — register players route
- **Query logic**: Prisma `contains` with `mode: 'insensitive'`, limit 20, ordered by `displayName`.
- **Acceptance criteria**:
  - [ ] `GET /api/players?q=ron` returns players matching "ron"
  - [ ] Empty `?q=` returns 400 (minimum 2 characters)
  - [ ] Results limited to 20, case-insensitive
  - [ ] Response time < 300ms
  - [ ] Each result includes player ID and display name
- **Validation**: `curl "http://localhost:4000/api/players?q=ron" | jq '.results | length'` returns ≤ 20.

### Task 3.5: Add request validation and error response consistency

- **Description**: Ensure all endpoints validate inputs and return consistent error shapes.
- **Error shapes**:
  ```json
  // 400 Bad Request
  { "error": "Query parameter 'q' must be at least 2 characters", "code": "INVALID_PARAMETER" }
  // 404 Not Found
  { "error": "Match with id 999999 not found", "code": "NOT_FOUND" }
  // 500 Internal Server Error
  { "error": "Internal server error", "code": "INTERNAL_ERROR" }
  ```
- **Acceptance criteria**:
  - [ ] Every error case returns one of the three shapes above
  - [ ] Validation errors include the specific field that failed
  - [ ] Stack traces are NOT exposed in production responses
- **Validation**: Test all error cases manually with curl.

---

## Dependencies

- **Dev 2 (Data Pipeline)** — Database must be seeded with data

---

## Effort Estimate

**M (2-4 days)**

| Task | Estimate |
|------|----------|
| Task 3.1 (middleware) | 0.5 day |
| Task 3.2 (matches/random) | 1 day |
| Task 3.3 (matches/:id) | 0.5 day |
| Task 3.4 (players search) | 0.5 day |
| Task 3.5 (validation + error consistency) | 0.5 day |
| Buffer | 0.5 day |

---

## Risk Factors

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Random match query performance | Low | Medium | `ORDER BY RANDOM()` acceptable for 35k rows. Use `OFFSET` approach if slow. |
| Player search under 300ms with 37k records | Medium | Medium | Add DB index on `display_name`. Add trigram index if needed. |
| Large response payloads | Low | Low | Response ~5-10 KB per match. Acceptable. |

---

## "Done" Checklist

- [ ] `GET /api/matches/random` returns random match with 11-player lineup on each team
- [ ] `GET /api/matches/:id` returns specific match with full lineup
- [ ] `GET /api/matches/:id` returns 404 for non-existent or invalid IDs
- [ ] `GET /api/players?q=ron` returns ≤ 20 results within 300ms
- [ ] `GET /api/players?q=r` returns 400 (minimum 2 chars)
- [ ] All errors return consistent JSON shape `{ error, code }`
- [ ] Request logging shows method, path, status, duration
- [ ] CORS configured for frontend origin
- [ ] No stack traces exposed in error responses
- [ ] `npm run lint` passes
- [ ] All changes committed to `dev-3/*` branch
