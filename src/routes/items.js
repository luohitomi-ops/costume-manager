import { Router } from 'express';
import { createItem, searchItems, updateItem, getItemById } from '../models/item.js';

const router = Router();

router.post('/', (req, res, next) => {
  try {
    const item = createItem(req.body || {});
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

router.get('/', (req, res) => {
  const { q, category, character_id, status, include_inactive } = req.query;
  res.json(
    searchItems({
      q,
      category,
      character_id,
      status,
      include_inactive: include_inactive === 'true',
    })
  );
});

router.patch('/:id', (req, res, next) => {
  try {
    const existing = getItemById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'item not found' });
    }
    const updated = updateItem(req.params.id, req.body || {});
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Central error handler for validation errors thrown by the model layer.
router.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message });
});

export default router;
