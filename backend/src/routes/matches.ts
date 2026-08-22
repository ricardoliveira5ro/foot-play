import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { getRandomMatch, buildMatchResponse, getMatchById } from '../services/matchService';
import { validateNonNegativeIntParam } from '../middleware/validate';

const router = Router();

router.get('/random', asyncHandler(async (_req, res) => {
  const game = await getRandomMatch();

  if (!game) {
    return res.status(404).json({ error: 'No matches available', code: 'NOT_FOUND' });
  }

  const response = buildMatchResponse(game);
  res.json(response);
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