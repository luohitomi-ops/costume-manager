import { Router } from 'express';
import { listCharacters } from '../models/character.js';
import { allItemsWithCharacters } from '../models/item.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

const CSV_COLUMNS = [
  'id', 'character_id', 'character_name', 'name', 'category', 'status',
  'location', 'borrower', 'photo_path', 'note', 'active', 'created_at', 'updated_at',
];

function toCsv(items) {
  const rows = items.map((item) =>
    CSV_COLUMNS.map((col) => csvEscape(item[col])).join(',')
  );
  return [CSV_COLUMNS.join(','), ...rows].join('\n');
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

router.get('/export', asyncHandler(async (req, res) => {
  const format = req.query.format === 'csv' ? 'csv' : 'json';
  const items = await allItemsWithCharacters();

  if (format === 'csv') {
    res.type('text/csv').send(toCsv(items));
    return;
  }

  res.json({
    characters: await listCharacters(),
    items,
  });
}));

export default router;
