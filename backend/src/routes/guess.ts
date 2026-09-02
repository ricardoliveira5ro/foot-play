import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { validateEnumStringField, validateNonEmptyStringField, validateNumberField } from '../middleware/validate';
import { getMatchById, getPlayerNameForAppearance, getRevealAppearances } from '../services/matchService';
import { evaluateGuessWithResult } from '../services/wordle';

const router = Router();

router.post('/', asyncHandler(async (req, res) => {
  const gameId = validateNumberField('gameId', req.body?.gameId);
  if (typeof gameId === 'object' && gameId !== null && 'error' in gameId) {
    return res.status(400).json(gameId);
  }

  const token = validateNonEmptyStringField('token', req.body?.token);
  if (typeof token === 'object' && token !== null && 'error' in token) {
    return res.status(400).json(token);
  }

  const guess = validateNonEmptyStringField('guess', req.body?.guess);
  if (typeof guess === 'object' && guess !== null && 'error' in guess) {
    return res.status(400).json(guess);
  }

  const playerName = await getPlayerNameForAppearance(gameId, token)

  if (!playerName) {
    return res.status(404).json({ error: `Player not found`, code: 'NOT_FOUND' })
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

router.post('/reveal', asyncHandler(async (req, res) => {
  const gameId = validateNumberField('gameId', req.body?.gameId);
  if (typeof gameId === 'object' && gameId !== null && 'error' in gameId) {
    return res.status(400).json(gameId);
  }

  const teamSide = validateEnumStringField('teamSide', req.body?.teamSide, ["home", "away"]);
  if (typeof teamSide === 'object' && teamSide !== null && 'error' in teamSide) {
    return res.status(400).json(teamSide);
  }

  const game = await getMatchById(gameId);

  if (!game) {
    return res.status(404).json({ error: `Game ${gameId} not found`, code: 'NOT_FOUND' })
  }

  const clubId = teamSide === "home" ? game.homeClubId : game.awayClubId;
  const appearances = await getRevealAppearances(gameId, clubId);

  res.json({ players: appearances.map(ap => ({ playerId: ap.playerId, name: ap.player.displayName ?? ap.player.name ?? '', shirtNumber: ap.number })) });
}));

router.post('/reveal-one', asyncHandler(async (req, res) => {
  const gameId = validateNumberField('gameId', req.body?.gameId);
  if (typeof gameId === 'object' && gameId !== null && 'error' in gameId) {
    return res.status(400).json(gameId);
  }

  const token = validateNonEmptyStringField('token', req.body?.token);
  if (typeof token === 'object' && token !== null && 'error' in token) {
    return res.status(400).json(token);
  }

  const name = await getPlayerNameForAppearance(gameId, token);

  if (!name) {
    return res.status(404).json({ error: 'Player not found', code: 'NOT_FOUND' });
  }

  res.json({ name });
}));

export default router;