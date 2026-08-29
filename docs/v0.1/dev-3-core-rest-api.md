# Development 3: Core REST API

**Status**: `ready for implementation`
**Source**: `docs/v0.1/plan-v1.0-decomposition.md` (Development 3)
**Estimated Effort**: M (2-4 days)

---

## Objective

Build the five Express API endpoints that power the Missing Eleven game. By the end of this development, the backend serves match data with full lineups, individual match details, player search, and server-side guess validation — all with consistent error handling and logging.

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

4. `POST /api/guess`
   - Server-side wordle-style guess evaluation against the player's name
   - Returns per-letter results and `isCorrect`; reveals `name` only on a correct guess

5. `POST /api/guess/reveal`
   - Reveals the full lineup names for a team side at game completion
   - The only legitimate time names are exposed

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
      { "playerId": 1, "nameLength": 7, "shirtNumber": 31, "position": "Goalkeeper", "coords": { "x": 50, "y": 92 } }
    ],
    "awayLineup": [...]
  }
  ```
- **Note**: Lineup entries expose `nameLength` — the normalized length of the player's name (lowercase, diacritics stripped, spaces/hyphens/apostrophes removed) — instead of `displayName`. The frontend uses it to validate input length without the answer (the player's name) ever leaving the server. See Task 3.6 for the server-side guess validation contract.
- **Acceptance criteria**:
  - [ ] Returns 200 with valid JSON response
  - [ ] Includes match metadata + Both lineups with exactly 11 players each
  - [ ] Competition name is resolved (not raw ID)
  - [ ] Each lineup entry has: playerId, nameLength, shirtNumber, position, coords
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

### Task 3.6: Server-side guess validation

- **Description**: Move wordle-style guess evaluation from the client to the server so player names (the answers) are never exposed to the client. The server evaluates each guess against the player's name and only reveals the name on a correct guess or at game completion.
- **Files to create/modify**:
  - `backend/src/routes/guess.ts` — route definitions
  - `backend/src/services/guessService.ts` — guess evaluation logic
  - `backend/src/index.ts` — register guess routes
- **API: `POST /api/guess`**:
  - Request body: `{ "gameId": 123, "playerId": 456, "guess": "Messi" }`
  - Response (wrong guess):
    ```json
    { "results": [{ "letter": "M", "result": "CORRECT" }, ...], "isCorrect": false }
    ```
  - Response (correct guess):
    ```json
    { "results": [...], "isCorrect": true, "name": "Messi" }
    ```
  - `result` values are UPPERCASE: `"CORRECT" | "PRESENT" | "ABSENT"`
  - **Critical rule**: `name` is ONLY present when `isCorrect` is `true`. Never leak the answer on a wrong guess.
  - Errors:
    - 400 `{ "error": "...", "code": "INVALID_PARAMETER" }` — invalid body (gameId/playerId must be numbers, guess must be a non-empty string)
    - 404 `{ "error": "...", "code": "NOT_FOUND" }` — player is not in the match
- **API: `POST /api/guess/reveal`**:
  - Request body: `{ "gameId": 123, "teamSide": "home" }` (`teamSide` is `"home"` or `"away"`)
  - Response:
    ```json
    { "players": [{ "playerId": 456, "name": "Messi", "shirtNumber": 10 }, ...] }
    ```
  - This is the ONLY legitimate time names are revealed (game completion).
  - Errors:
    - 400 `{ "error": "...", "code": "INVALID_PARAMETER" }` — invalid body
    - 404 `{ "error": "...", "code": "NOT_FOUND" }` — game does not exist
- **Security rationale**: The answers (player names) never leave the server until a correct guess or game completion. This is the core anti-cheat fix.
- **Acceptance criteria**:
  - [ ] `POST /api/guess` returns per-letter results with `isCorrect`
  - [ ] `name` is only present in the response when `isCorrect` is `true`
  - [ ] `POST /api/guess/reveal` returns the full lineup names for the requested team side
  - [ ] Invalid bodies return 400 with `code: "INVALID_PARAMETER"`
  - [ ] Unknown player or game returns 404 with `code: "NOT_FOUND"`
- **Validation**: `curl -X POST http://localhost:4000/api/guess -H 'Content-Type: application/json' -d '{"gameId":123,"playerId":456,"guess":"Messi"}' | jq '.isCorrect'`.

---

## Dependencies

- **Dev 2 (Data Pipeline)** — Database must be seeded with data

---

## Effort Estimate

**M (2-4 days)**

| Task                                      | Estimate |
| ----------------------------------------- | -------- |
| Task 3.1 (middleware)                     | 0.5 day  |
| Task 3.2 (matches/random)                 | 1 day    |
| Task 3.3 (matches/:id)                    | 0.5 day  |
| Task 3.4 (players search)                 | 0.5 day  |
| Task 3.5 (validation + error consistency) | 0.5 day  |
| Task 3.6 (server-side guess validation)   | 0.5 day  |
| Buffer                                    | 0.5 day  |

---

## Risk Factors

| Risk                                       | Likelihood | Impact | Mitigation                                                                  |
| ------------------------------------------ | ---------- | ------ | --------------------------------------------------------------------------- |
| Random match query performance             | Low        | Medium | `ORDER BY RANDOM()` acceptable for 35k rows. Use `OFFSET` approach if slow. |
| Player search under 300ms with 37k records | Medium     | Medium | Add DB index on `display_name`. Add trigram index if needed.                |
| Large response payloads                    | Low        | Low    | Response ~5-10 KB per match. Acceptable.                                    |

---

## "Done" Checklist

- [ ] `GET /api/matches/random` returns random match with 11-player lineup on each team
- [ ] `GET /api/matches/:id` returns specific match with full lineup
- [ ] `GET /api/matches/:id` returns 404 for non-existent or invalid IDs
- [ ] `GET /api/players?q=ron` returns ≤ 20 results within 300ms
- [ ] `GET /api/players?q=r` returns 400 (minimum 2 chars)
- [ ] `POST /api/guess` returns per-letter results and only reveals `name` when `isCorrect` is true
- [ ] `POST /api/guess/reveal` returns lineup names only at game completion
- [ ] All errors return consistent JSON shape `{ error, code }`
- [ ] Request logging shows method, path, status, duration
- [ ] CORS configured for frontend origin
- [ ] No stack traces exposed in error responses
- [ ] `npm run lint` passes
- [ ] All changes committed to `dev-3/*` branch
