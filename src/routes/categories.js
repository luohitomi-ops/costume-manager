import { Router } from 'express';
import {
  listCategories,
  createCategory,
  renameCategory,
  moveCategory,
  deleteCategory,
} from '../models/category.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(listCategories());
});

router.post('/', (req, res, next) => {
  try {
    const category = createCategory(req.body || {});
    res.status(201).json(category);
  } catch (err) {
    next(err);
  }
});

router.patch('/:slug', (req, res, next) => {
  try {
    const category = renameCategory(req.params.slug, req.body || {});
    if (!category) return res.status(404).json({ error: 'category not found' });
    res.json(category);
  } catch (err) {
    next(err);
  }
});

router.post('/:slug/move', (req, res, next) => {
  try {
    const { direction } = req.body || {};
    const categories = moveCategory(req.params.slug, direction);
    if (!categories) return res.status(404).json({ error: 'category not found' });
    res.json(categories);
  } catch (err) {
    next(err);
  }
});

router.delete('/:slug', (req, res, next) => {
  try {
    const result = deleteCategory(req.params.slug);
    if (!result) return res.status(404).json({ error: 'category not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message });
});

export default router;
