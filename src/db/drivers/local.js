export function createLocalDriver(sqliteDb) {
  return {
    async get(sql, params = []) {
      const stmt = sqliteDb.prepare(sql);
      return Array.isArray(params) ? stmt.get(...params) : stmt.get(params);
    },
    async all(sql, params = []) {
      const stmt = sqliteDb.prepare(sql);
      return Array.isArray(params) ? stmt.all(...params) : stmt.all(params);
    },
    async run(sql, params = []) {
      const stmt = sqliteDb.prepare(sql);
      const info = Array.isArray(params) ? stmt.run(...params) : stmt.run(params);
      return { lastInsertRowid: Number(info.lastInsertRowid), changes: info.changes };
    },
    async exec(sql) {
      sqliteDb.exec(sql);
    },
    async batch(statements) {
      const runAll = sqliteDb.transaction((stmts) => {
        for (const { sql, params = [] } of stmts) {
          const stmt = sqliteDb.prepare(sql);
          Array.isArray(params) ? stmt.run(...params) : stmt.run(params);
        }
      });
      runAll(statements);
    },
  };
}
