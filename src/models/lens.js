import db from '../db/connection.js';

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function validateQuantity(quantity) {
  if (quantity === undefined) return 0;
  const n = Number(quantity);
  if (!Number.isInteger(n) || n < 0) {
    throw badRequest('quantity must be a non-negative integer');
  }
  return n;
}

export async function createLens({ name, quantity }) {
  if (!name || !name.trim()) throw badRequest('name is required');
  const qty = validateQuantity(quantity);

  const info = await db.run('INSERT INTO lenses (name, quantity) VALUES (?, ?)', [name.trim(), qty]);
  return getLensById(info.lastInsertRowid);
}

export async function listLenses() {
  return db.all('SELECT * FROM lenses ORDER BY name');
}

export async function getLensById(id) {
  return db.get('SELECT * FROM lenses WHERE id = ?', [id]);
}

export async function updateLens(id, patch) {
  const existing = await getLensById(id);
  if (!existing) return null;

  const name = patch.name !== undefined ? patch.name.trim() : existing.name;
  if (!name) throw badRequest('name is required');
  const quantity = patch.quantity !== undefined ? validateQuantity(patch.quantity) : existing.quantity;

  await db.run(
    `UPDATE lenses SET name = @name, quantity = @quantity,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = @id`,
    { id, name, quantity }
  );
  return getLensById(id);
}

export async function deleteLens(id) {
  const existing = await getLensById(id);
  if (!existing) return null;
  await db.run('DELETE FROM lenses WHERE id = ?', [id]);
  return true;
}
