import db from '../db/connection.js';
import { categoryExists } from './category.js';

const STATUSES = ['unassigned', 'in_storage', 'lent_out'];

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

/**
 * Enforces the status/location/borrower rules from data-model.md:
 * in_storage requires location and no borrower; lent_out requires borrower
 * and no location; unassigned requires neither. Does not touch the
 * database — stays synchronous, do not await calls to this function.
 */
export function validateStatusFields({ status, location, borrower }) {
  const s = status || 'unassigned';
  if (!STATUSES.includes(s)) {
    throw badRequest(`status must be one of: ${STATUSES.join(', ')}`);
  }
  if (s === 'in_storage') {
    if (!location) throw badRequest('location is required when status is in_storage');
    if (borrower) throw badRequest('borrower must be empty when status is in_storage');
  } else if (s === 'lent_out') {
    if (!borrower) throw badRequest('borrower is required when status is lent_out');
    if (location) throw badRequest('location must be empty when status is lent_out');
  } else {
    if (location) throw badRequest('location must be empty when status is unassigned');
    if (borrower) throw badRequest('borrower must be empty when status is unassigned');
  }
  return s;
}

export async function createItem(input) {
  const { character_id, name, category, photo_path = null, note = null } = input;

  if (!character_id) throw badRequest('character_id is required');
  if (!name || !name.trim()) throw badRequest('name is required');
  if (!(await categoryExists(category))) {
    throw badRequest('category does not exist');
  }

  const status = validateStatusFields(input);
  const location = status === 'in_storage' ? input.location : null;
  const borrower = status === 'lent_out' ? input.borrower : null;

  const info = await db.run(
    `INSERT INTO items (character_id, name, category, status, location, borrower, photo_path, note)
     VALUES (@character_id, @name, @category, @status, @location, @borrower, @photo_path, @note)`,
    {
      character_id,
      name: name.trim(),
      category,
      status,
      location,
      borrower,
      photo_path,
      note,
    }
  );
  return getItemById(info.lastInsertRowid);
}

export async function getItemById(id) {
  return db.get('SELECT * FROM items WHERE id = ?', [id]);
}

export async function searchItems({ q, category, character_id, status, include_inactive } = {}) {
  const clauses = [];
  const params = {};

  if (!include_inactive) {
    clauses.push('active = 1');
  }
  if (q) {
    clauses.push('name LIKE @q');
    params.q = `%${q}%`;
  }
  if (category) {
    clauses.push('category = @category');
    params.category = category;
  }
  if (character_id) {
    clauses.push('character_id = @character_id');
    params.character_id = character_id;
  }
  if (status) {
    clauses.push('status = @status');
    params.status = status;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.all(`SELECT * FROM items ${where} ORDER BY name`, params);
}

export async function listItemsForCharacter(characterId, { include_inactive } = {}) {
  return searchItems({ character_id: characterId, include_inactive });
}

export async function updateItem(id, patch) {
  const existing = await getItemById(id);
  if (!existing) return null;

  const merged = {
    status: patch.status ?? existing.status,
    location: patch.location !== undefined ? patch.location : existing.location,
    borrower: patch.borrower !== undefined ? patch.borrower : existing.borrower,
  };

  // If status changes without explicit location/borrower, clear the other field.
  if (patch.status && patch.status !== existing.status) {
    if (patch.location === undefined) merged.location = null;
    if (patch.borrower === undefined) merged.borrower = null;
  }

  const status = validateStatusFields(merged);
  const location = status === 'in_storage' ? merged.location : null;
  const borrower = status === 'lent_out' ? merged.borrower : null;

  const active = patch.active !== undefined ? (patch.active ? 1 : 0) : existing.active;
  const note = patch.note !== undefined ? patch.note : existing.note;
  const photo_path = patch.photo_path !== undefined ? patch.photo_path : existing.photo_path;

  await db.run(
    `UPDATE items
     SET status = @status, location = @location, borrower = @borrower,
         active = @active, note = @note, photo_path = @photo_path,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = @id`,
    { id, status, location, borrower, active, note, photo_path }
  );

  return getItemById(id);
}

export async function deleteItem(id) {
  const existing = await getItemById(id);
  if (!existing) return null;
  await db.run('DELETE FROM items WHERE id = ?', [id]);
  return true;
}

export async function allItemsWithCharacters() {
  return db.all(`
    SELECT items.*, characters.name AS character_name
    FROM items
    JOIN characters ON characters.id = items.character_id
    ORDER BY characters.name, items.name
  `);
}

export { STATUSES };
