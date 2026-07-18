export function createTursoDriver(client) {
  return {
    async get(sql, params = []) {
      const result = await client.execute({ sql, args: params });
      return result.rows[0];
    },
    async all(sql, params = []) {
      const result = await client.execute({ sql, args: params });
      return result.rows;
    },
    async run(sql, params = []) {
      const result = await client.execute({ sql, args: params });
      return {
        lastInsertRowid: Number(result.lastInsertRowid),
        changes: Number(result.rowsAffected),
      };
    },
    async exec(sql) {
      await client.executeMultiple(sql);
    },
    async batch(statements) {
      await client.batch(
        statements.map(({ sql, params = [] }) => ({ sql, args: params })),
        'write'
      );
    },
  };
}
