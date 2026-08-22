import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { getRandomMatch, buildMatchResponse } from '../services/matchService';

const router = Router();

router.get('/random', asyncHandler(async (_req, res) => {
    const game = await getRandomMatch();

    if (!game) {
      return res.status(404).json({ error: 'No matches available', code: 'NOT_FOUND' });
    }

    const response = buildMatchResponse(game);
    res.json(response);
  })
);

export default router;