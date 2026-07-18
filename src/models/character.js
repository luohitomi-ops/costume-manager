import db from '../db/connection.js';

export async function createCharacter({ name }) {
  if (!name || !name.trim()) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }
  const info = await db.run('INSERT INTO characters (name) VALUES (?)', [name.trim()]);
  return getCharacterById(info.lastInsertRowid);
}

export async function listCharacters() {
  return db.all('SELECT * FROM characters ORDER BY name');
}

export async function getCharacterById(id) {
  return db.get('SELECT * FROM characters WHERE id = ?', [id]);
}
