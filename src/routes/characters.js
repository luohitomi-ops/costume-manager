import { Router } from 'express';
import { createCharacter, listCharacters, getCharacterById, deleteCharacter } from '../models/character.js';
import { listItemsForCharacter } from '../models/item.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

router.post('/', asyncHandler(async (req, res) => {
  const character = await createCharacter(req.body || {});
  res.status(201).json(character);
}));

router.get('/', asyncHandler(async (req, res) => {
  res.json(await listCharacters());
}));

router.get('/:id/items', asyncHandler(async (req, res) => {
  const character = await getCharacterById(req.params.id);
  if (!character) {
    return res.status(404).json({ error: 'character not found' });
  }
  const includeInactive = req.query.include_inactive === 'true';
  res.json(await listItemsForCharacter(req.params.id, { include_inactive: includeInactive }));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await deleteCharacter(req.params.id);
  if (!result) return res.status(404).json({ error: 'character not found' });
  res.status(204).end();
}));

export default router;
