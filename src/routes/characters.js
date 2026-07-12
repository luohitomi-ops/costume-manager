import { Router } from 'express';
import { createCharacter, listCharacters, getCharacterById } from '../models/character.js';
import { listItemsForCharacter } from '../models/item.js';

const router = Router();

router.post('/', (req, res, next) => {
  try {
    const character = createCharacter(req.body || {});
    res.status(201).json(character);
  } catch (err) {
    next(err);
  }
});

router.get('/', (req, res) => {
  res.json(listCharacters());
});

router.get('/:id/items', (req, res) => {
  const character = getCharacterById(req.params.id);
  if (!character) {
    return res.status(404).json({ error: 'character not found' });
  }
  const includeInactive = req.query.include_inactive === 'true';
  res.json(listItemsForCharacter(req.params.id, { include_inactive: includeInactive }));
});

export default router;
