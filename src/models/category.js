import db from '../db/connection.js';

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function conflict(message) {
  const err = new Error(message);
  err.status = 409;
  return err;
}

export function listCategories() {
  return db.prepare('SELECT * FROM categories ORDER BY sort_order').all();
}

export function categoryExists(slug) {
  return !!db.prepare('SELECT 1 FROM categories WHERE slug = ?').get(slug);
}

export function createCategory({ name }) {
  if (!name || !name.trim()) throw badRequest('name is required');
  const trimmed = name.trim();
  const slug = `custom_${Date.now()}`;
  const maxRow = db.prepare('SELECT MAX(sort_order) AS max_order FROM categories').get();
  const nextOrder = (maxRow.max_order ?? -1) + 1;
  db.prepare('INSERT INTO categories (slug, name, sort_order, is_builtin) VALUES (?, ?, ?, 0)')
    .run(slug, trimmed, nextOrder);
  return db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug);
}

export function renameCategory(slug, { name }) {
  if (!name || !name.trim()) throw badRequest('name is required');
  const existing = db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug);
  if (!existing) return null;
  db.prepare('UPDATE categories SET name = ? WHERE slug = ?').run(name.trim(), slug);
  return db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug);
}

export function moveCategory(slug, direction) {
  if (direction !== 'up' && direction !== 'down') {
    throw badRequest("direction must be 'up' or 'down'");
  }
  const current = db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug);
  if (!current) return null;

  const neighbor = direction === 'up'
    ? db.prepare('SELECT * FROM categories WHERE sort_order < ? ORDER BY sort_order DESC LIMIT 1').get(current.sort_order)
    : db.prepare('SELECT * FROM categories WHERE sort_order > ? ORDER BY sort_order ASC LIMIT 1').get(current.sort_order);

  if (!neighbor) return listCategories();

  db.prepare('UPDATE categories SET sort_order = ? WHERE slug = ?').run(neighbor.sort_order, current.slug);
  db.prepare('UPDATE categories SET sort_order = ? WHERE slug = ?').run(current.sort_order, neighbor.slug);
  return listCategories();
}

export function deleteCategory(slug) {
  const existing = db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug);
  if (!existing) return null;
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM items WHERE category = ?').get(slug);
  if (count > 0) {
    throw conflict(`還有 ${count} 件道具使用這個分類，無法刪除`);
  }
  db.prepare('DELETE FROM categories WHERE slug = ?').run(slug);
  return true;
}
