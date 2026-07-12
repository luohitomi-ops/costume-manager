import db from '../db/connection.js';

export function createCharacter({ name }) {
  if (!name || !name.trim()) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }
  const stmt = db.prepare('INSERT INTO characters (name) VALUES (?)');
  const info = stmt.run(name.trim());
  return getCharacterById(info.lastInsertRowid);
}

export function listCharacters() {
  return db.prepare('SELECT * FROM characters ORDER BY name').all();
}

export function getCharacterById(id) {
  return db.prepare('SELECT * FROM characters WHERE id = ?').get(id);
}
