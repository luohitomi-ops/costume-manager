import { Router } from 'express';
import { createLens, listLenses, updateLens, deleteLens } from '../models/lens.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

router.post('/', asyncHandler(async (req, res) => {
  const lens = await createLens(req.body || {});
  res.status(201).json(lens);
}));

router.get('/', asyncHandler(async (req, res) => {
  res.json(await listLenses());
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const lens = await updateLens(req.params.id, req.body || {});
  if (!lens) return res.status(404).json({ error: 'lens not found' });
  res.json(lens);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await deleteLens(req.params.id);
  if (!result) return res.status(404).json({ error: 'lens not found' });
  res.status(204).end();
}));

router.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message });
});

export default router;
