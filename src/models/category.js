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

export async function listCategories() {
  return db.all('SELECT * FROM categories ORDER BY sort_order');
}

export async function categoryExists(slug) {
  return !!(await db.get('SELECT 1 FROM categories WHERE slug = ?', [slug]));
}

export async function createCategory({ name }) {
  if (!name || !name.trim()) throw badRequest('name is required');
  const trimmed = name.trim();
  const slug = `custom_${Date.now()}`;
  const maxRow = await db.get('SELECT MAX(sort_order) AS max_order FROM categories');
  const nextOrder = (maxRow.max_order ?? -1) + 1;
  await db.run(
    'INSERT INTO categories (slug, name, sort_order, is_builtin) VALUES (?, ?, ?, 0)',
    [slug, trimmed, nextOrder]
  );
  return db.get('SELECT * FROM categories WHERE slug = ?', [slug]);
}

export async function renameCategory(slug, { name }) {
  if (!name || !name.trim()) throw badRequest('name is required');
  const existing = await db.get('SELECT * FROM categories WHERE slug = ?', [slug]);
  if (!existing) return null;
  await db.run('UPDATE categories SET name = ? WHERE slug = ?', [name.trim(), slug]);
  return db.get('SELECT * FROM categories WHERE slug = ?', [slug]);
}

export async function moveCategory(slug, direction) {
  if (direction !== 'up' && direction !== 'down') {
    throw badRequest("direction must be 'up' or 'down'");
  }
  const current = await db.get('SELECT * FROM categories WHERE slug = ?', [slug]);
  if (!current) return null;

  const neighbor = direction === 'up'
    ? await db.get('SELECT * FROM categories WHERE sort_order < ? ORDER BY sort_order DESC LIMIT 1', [current.sort_order])
    : await db.get('SELECT * FROM categories WHERE sort_order > ? ORDER BY sort_order ASC LIMIT 1', [current.sort_order]);

  if (!neighbor) return listCategories();

  // Atomic swap (see plan's "Verified findings" item 4) — two independent
  // UPDATEs would no longer be implicitly atomic once this file is async.
  await db.batch([
    { sql: 'UPDATE categories SET sort_order = ? WHERE slug = ?', params: [neighbor.sort_order, current.slug] },
    { sql: 'UPDATE categories SET sort_order = ? WHERE slug = ?', params: [current.sort_order, neighbor.slug] },
  ]);
  return listCategories();
}

export async function deleteCategory(slug) {
  const existing = await db.get('SELECT * FROM categories WHERE slug = ?', [slug]);
  if (!existing) return null;
  const { count } = await db.get('SELECT COUNT(*) AS count FROM items WHERE category = ?', [slug]);
  if (count > 0) {
    throw conflict(`還有 ${count} 件道具使用這個分類，無法刪除`);
  }
  await db.run('DELETE FROM categories WHERE slug = ?', [slug]);
  return true;
}
