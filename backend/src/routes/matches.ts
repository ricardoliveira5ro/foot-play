import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { getRandomMatch, buildMatchResponse, getMatchById } from '../services/matchService';
import { getFilterOptions } from '../services/filterService';
import type { GameFilterParams } from '../lib/filterQuery';
import { validateNonNegativeIntParam } from '../middleware/validate';

const router = Router();

router.get('/random', asyncHandler(async (req, res) => {
  const game = await getRandomMatch(parseGameFilterParams(req.query));

  if (!game) {
    return res.status(404).json({ error: 'No matches available', code: 'NOT_FOUND' });
  }

  const response = buildMatchResponse(game);
  res.json(response);
}));

// MUST stay above '/:id' — Express would otherwise match 'filter-options' as a game id.
router.get('/filter-options', asyncHandler(async (req, res) => {
  res.json(await getFilterOptions(parseGameFilterParams(req.query)));
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
