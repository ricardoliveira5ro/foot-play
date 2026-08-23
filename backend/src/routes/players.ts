import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { validateStringParam } from "../middleware/validate";
import { getPlayers } from "../services/playerService";

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const validation = validateStringParam('name', req.query.name, { minLength: 3 });

  if (typeof validation === 'object' && validation !== null && 'error' in validation) {
    return res.status(400).json(validation);
  }

  const name = validation;
  const players = await getPlayers(name);

  res.json(players);
}));

export default router;