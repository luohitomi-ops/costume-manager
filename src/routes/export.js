import { Router } from 'express';
import { listCharacters } from '../models/character.js';
import { allItemsWithCharacters } from '../models/item.js';

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

router.get('/export', (req, res) => {
  const format = req.query.format === 'csv' ? 'csv' : 'json';
  const items = allItemsWithCharacters();

  if (format === 'csv') {
    res.type('text/csv').send(toCsv(items));
    return;
  }

  res.json({
    characters: listCharacters(),
    items,
  });
});

export default router;
