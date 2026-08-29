import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { validateNonEmptyStringField, validateNumberField } from '../middleware/validate';
import { getPlayerNameForAppearance } from '../services/matchService';
import { evaluateGuessWithResult } from '../services/wordle';

const router = Router();

router.post('/', asyncHandler(async (req, res) => {
  const gameId = validateNumberField('gameId', req.body?.gameId);
  if (typeof gameId === 'object' && gameId !== null && 'error' in gameId) {
    return res.status(400).json(gameId);
  }

  const playerId = validateNumberField('playerId', req.body?.playerId);
  if (typeof playerId === 'object' && playerId !== null && 'error' in playerId) {
    return res.status(400).json(playerId);
  }

  const guess = validateNonEmptyStringField('guess', req.body?.guess);
  if (typeof guess === 'object' && guess !== null && 'error' in guess) {
    return res.status(400).json(guess);
  }

  const playerName = await getPlayerNameForAppearance(gameId, playerId)

  if (!playerName) {
    return res.status(404).json({ error: `Player ${playerId} not found`, code: 'NOT_FOUND' })
  }

  const result = evaluateGuessWithResult(guess, playerName);
  const response = {
    results: result.results,
    isCorrect: result.isCorrect
  }
  
  if (result.isCorrect) {
    res.json({ ...response, name: playerName });
  } else {
    res.json(response);
  }

}));

export default router;