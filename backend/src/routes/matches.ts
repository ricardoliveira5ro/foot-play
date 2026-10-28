import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { getRandomMatch, buildMatchResponse, buildLineupForSide, getMatchById } from '../services/matchService';
import { getDailyMatch } from '../services/dailyService';
import { getFilterOptions } from '../services/filterService';
import type { GameFilterParams } from '../lib/filterQuery';
import { isDailyKey, toDailyKey } from '../lib/dailyKey';
import { validateNonNegativeIntParam } from '../middleware/validate';

const router = Router();

router.get('/random', asyncHandler(async (req, res) => {
  const difficulty = parseDifficulty(req.query.difficulty);
  if (typeof difficulty !== 'string') return res.status(400).json(difficulty);

  const game = await getRandomMatch(parseGameFilterParams(req.query));

  if (!game) {
    return res.status(404).json({ error: 'No matches available', code: 'NOT_FOUND' });
  }

  const response = buildMatchResponse(game, difficulty, true);
  res.json(response);
}));

// MUST stay above '/:id' — Express would otherwise match 'filter-options' as a game id.
router.get('/filter-options', asyncHandler(async (req, res) => {
  res.json(await getFilterOptions(parseGameFilterParams(req.query)));
}));

router.get('/:id/lineup', asyncHandler(async (req, res) => {
  const validation = validateNonNegativeIntParam('id', req.params.id);
  if (typeof validation === 'object' && validation !== null && 'error' in validation) return res.status(400).json(validation);
  const side = req.query.teamSide;
  const difficulty = req.query.difficulty;
  if ((side !== 'home' && side !== 'away') || (difficulty !== 'easy' && difficulty !== 'normal' && difficulty !== 'hard' && difficulty !== 'expert')) {
    return res.status(400).json({ error: 'Invalid teamSide or difficulty', code: 'INVALID_PARAMETER' });
  }
  const game = await getMatchById(validation);
  if (!game) return res.status(404).json({ error: 'Match not found', code: 'NOT_FOUND' });
  res.json({ lineup: buildLineupForSide(game, side === 'home' ? game.homeClubId : game.awayClubId, difficulty) });
}));

// MUST stay above '/:id' — Express would otherwise match 'daily' as a game id.
// Same ordering constraint as '/filter-options' above it.
router.get('/daily', asyncHandler(async (req, res) => {
  const raw = req.query.date;

  // Absent date means "today", resolved on the server's clock in UTC so a
  // bare curl is useful. The frontend always sends an explicit date so a
  // request that crosses the UTC midnight boundary cannot be resolved to a
  // different day than the client asked for.
  const key = raw ?? toDailyKey(new Date());

  // Unlike the filter endpoints — which degrade a malformed query to
  // "unfiltered" — a malformed date is a 400. A wrong filter silently widens
  // the result set; a wrong date silently serves the WRONG PUZZLE. Failing
  // loudly is the safer of the two.
  if (!isDailyKey(key)) {
    return res.status(400).json({
      error: `Query parameter 'date' must be a calendar date in YYYY-MM-DD form`,
      code: 'INVALID_PARAMETER',
    });
  }

  const game = await getDailyMatch(key);
  // The daily is always the Normal ruleset: the target XI can finish the
  // puzzle, and the opponent XI is an optional bonus round loaded on demand.
  return res.json(buildMatchResponse(game, 'normal', true));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const validation = validateNonNegativeIntParam('id', req.params.id);
  if (typeof validation === 'object' && validation !== null && 'error' in validation) {
    return res.status(400).json(validation);
  }

  const id = validation;
  const game = await getMatchById(id);

  if (!game) {
    return res.status(404).json({ error: 'Match not found', code: 'NOT_FOUND' });
  }

  const response = buildMatchResponse(game);
  res.json(response);
}));

export default router;

function parseGameFilterParams(query: Record<string, unknown>): GameFilterParams {
  return {
    teamIds: parseIdList(query.teamIds),
    competitionIds: parseCompetitionIds(query.competitionIds),
    seasonFrom: parseSeason(query.seasonFrom),
    seasonTo: parseSeason(query.seasonTo),
  };
}

function parseDifficulty(value: unknown): 'easy' | 'normal' | 'hard' | 'expert' | { error: string; code: 'INVALID_PARAMETER' } {
  if (value === undefined) return 'normal';
  if (value === 'easy' || value === 'normal' || value === 'hard' || value === 'expert') return value;
  return { error: "Query parameter 'difficulty' must be one of: easy, normal, hard, expert", code: 'INVALID_PARAMETER' };
}

function queryString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function parseIdList(value: unknown): number[] | null {
  const raw = queryString(value);
  if (raw === null) return null;

  const ids = raw.split(',').flatMap((part) => {
    const token = part.trim();
    if (!/^\d+$/.test(token)) return [];
    const id = Number(token);
    return Number.isSafeInteger(id) ? [id] : [];
  });

  return ids.length > 0 ? ids : null;
}

function parseCompetitionIds(value: unknown): string[] | null {
  const raw = queryString(value);
  if (raw === null) return null;

  const ids = raw.split(',')
    .map((part) => part.trim())
    .filter((id) => /^[A-Za-z0-9_-]{1,32}$/.test(id));

  return ids.length > 0 ? ids : null;
}

function parseSeason(value: unknown): number | null {
  const raw = queryString(value)?.trim();
  if (!raw || !/^-?\d+$/.test(raw)) return null;

  const season = Number(raw);
  if (!Number.isSafeInteger(season)) return null;
  return Math.min(2025, Math.max(2013, season));
}
