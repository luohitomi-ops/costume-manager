// Driver-agnostic backup/restore logic — works against any object matching
// the get/all/run/exec/batch interface in src/db/drivers/{local,turso}.js.
// Kept separate from the CLI scripts so it can be exercised against a throwaway
// local SQLite driver in tests without ever touching the real Turso database.

export async function exportAllTables(driver) {
  return {
    exported_at: new Date().toISOString(),
    categories: await driver.all('SELECT * FROM categories'),
    characters: await driver.all('SELECT * FROM characters'),
    items: await driver.all('SELECT * FROM items'),
    lenses: await driver.all('SELECT * FROM lenses'),
  };
}

export async function restoreAllTables(driver, backup) {
  const statements = [];

  for (const cat of backup.categories) {
    statements.push({
      sql: 'INSERT OR REPLACE INTO categories (slug, name, sort_order, is_builtin) VALUES (?, ?, ?, ?)',
      params: [cat.slug, cat.name, cat.sort_order, cat.is_builtin],
    });
  }
  for (const c of backup.characters) {
    statements.push({
      sql: 'INSERT OR REPLACE INTO characters (id, name, created_at) VALUES (?, ?, ?)',
      params: [c.id, c.name, c.created_at],
    });
  }
  for (const i of backup.items) {
    statements.push({
      sql: `INSERT OR REPLACE INTO items
              (id, character_id, name, category, status, location, borrower, photo_path, note, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        i.id, i.character_id, i.name, i.category, i.status, i.location,
        i.borrower, i.photo_path, i.note, i.active, i.created_at, i.updated_at,
      ],
    });
  }
  for (const l of backup.lenses) {
    statements.push({
      sql: 'INSERT OR REPLACE INTO lenses (id, name, quantity, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      params: [l.id, l.name, l.quantity, l.created_at, l.updated_at],
    });
  }

  if (statements.length > 0) {
    await driver.batch(statements);
  }
}
