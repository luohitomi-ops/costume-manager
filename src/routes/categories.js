import { Router } from 'express';
import {
  listCategories,
  createCategory,
  renameCategory,
  moveCategory,
  deleteCategory,
} from '../models/category.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  res.json(await listCategories());
}));

router.post('/', asyncHandler(async (req, res) => {
  const category = await createCategory(req.body || {});
  res.status(201).json(category);
}));

router.patch('/:slug', asyncHandler(async (req, res) => {
  const category = await renameCategory(req.params.slug, req.body || {});
  if (!category) return res.status(404).json({ error: 'category not found' });
  res.json(category);
}));

router.post('/:slug/move', asyncHandler(async (req, res) => {
  const { direction } = req.body || {};
  const categories = await moveCategory(req.params.slug, direction);
  if (!categories) return res.status(404).json({ error: 'category not found' });
  res.json(categories);
}));

router.delete('/:slug', asyncHandler(async (req, res) => {
  const result = await deleteCategory(req.params.slug);
  if (!result) return res.status(404).json({ error: 'category not found' });
  res.status(204).end();
}));

router.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message });
});

export default router;
