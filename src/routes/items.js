import { Router } from 'express';
import { createItem, searchItems, updateItem, getItemById } from '../models/item.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

router.post('/', asyncHandler(async (req, res) => {
  const item = await createItem(req.body || {});
  res.status(201).json(item);
}));

router.get('/', asyncHandler(async (req, res) => {
  const { q, category, character_id, status, include_inactive } = req.query;
  res.json(
    await searchItems({
      q,
      category,
      character_id,
      status,
      include_inactive: include_inactive === 'true',
    })
  );
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const existing = await getItemById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'item not found' });
  }
  const updated = await updateItem(req.params.id, req.body || {});
  res.json(updated);
}));

// Central error handler for validation errors thrown by the model layer.
router.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message });
});

export default router;
