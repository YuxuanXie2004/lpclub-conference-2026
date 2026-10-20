'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');

function unavailable(cause) {
  return Object.assign(new Error('Database is unavailable.', { cause }), { code: 'DATABASE_UNAVAILABLE', statusCode: 503 });
}
function databaseError(cause) {
  const unavailableCodes = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'PROTOCOL_CONNECTION_LOST', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR', 'ER_CON_COUNT_ERROR'];
  return unavailableCodes.includes(cause.code) ? unavailable(cause) : cause;
}
function configuration(env = process.env) {
  const database = env.MYSQL_DATABASE;
  if (!database || !/^[a-zA-Z0-9_]+$/.test(database)) throw unavailable(new Error('MYSQL_DATABASE must be configured.'));
  const port = Number(env.MYSQL_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw unavailable(new Error('MYSQL_PORT is invalid.'));
  return { host: env.MYSQL_HOST || '127.0.0.1', port, user: env.MYSQL_USER || 'root', password: env.MYSQL_PASSWORD || '', database,
    charset: 'utf8mb4', timezone: 'Z', dateStrings: true, decimalNumbers: true, waitForConnections: true,
    connectionLimit: 10, connectTimeout: 10000, multipleStatements: false };
}
function createDatabase(env = process.env) {
  const config = configuration(env), pool = mysql.createPool(config);
  // Driver timezone controls serialization; the session also controls SQL defaults.
  pool.on('connection', connection => { connection.query("SET SESSION time_zone = '+00:00'", error => { if (error) connection.destroy(); }); });
  // All query methods, including transaction queries, return rows/result headers without mysql2's fields tuple.
  const wrapper = connection => ({ query: async (sql, params = []) => {
    try { return (await connection.query(sql, params))[0]; } catch (cause) { throw databaseError(cause); }
  } });
  const acquire = async () => {
    try { return await pool.getConnection(); } catch (cause) { throw databaseError(cause); }
  };
  const query = wrapper(pool).query;
  async function transaction(work, { deadlockRetries = 2 } = {}) {
    const retries = Math.max(0, Math.min(3, Number.isInteger(deadlockRetries) ? deadlockRetries : 2));
    for (let attempt = 0; ; attempt++) {
      const connection = await acquire();
      let committing = false;
      try {
        await connection.beginTransaction();
        const value = await work(wrapper(connection));
        committing = true;
        await connection.commit();
        return value;
      } catch (error) {
        let rolledBack = false;
        try { await connection.rollback(); rolledBack = true; } catch (_) { connection.destroy(); }
        // A lost commit response may already have committed. Never replay it automatically.
        if (!committing && rolledBack && error.code === 'ER_LOCK_DEADLOCK' && attempt < retries) continue;
        if (committing) error.commitUncertain = true;
        throw error;
      } finally { connection.release(); }
    }
  }
  async function migrate() {
    const connection = await acquire();
    const lockName = 'lpclub:migrations:' + crypto.createHash('sha256').update(config.database).digest('hex').slice(0, 40);
    let locked = false;
    try {
      const [lock] = await connection.query('SELECT GET_LOCK(?,30) AS acquired', [lockName]);
      if (Number(lock[0].acquired) !== 1) throw new Error('Migration lock unavailable.');
      locked = true;
      await connection.query('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB');
      const folder = path.join(__dirname, 'migrations');
      const files = (await fs.readdir(folder)).filter(name => /^\d+[-\w]*\.sql$/.test(name)).sort();
      for (const filename of files) {
        const source = await fs.readFile(path.join(folder, filename), 'utf8');
        const checksum = crypto.createHash('sha256').update(source).digest('hex');
        const [existing] = await connection.query('SELECT checksum FROM schema_migrations WHERE version=?', [filename]);
        if (existing.length) {
          if (existing[0].checksum !== checksum) throw new Error('Migration checksum mismatch: ' + filename);
          continue;
        }
        // DDL commits implicitly in MySQL. Every statement must be restartable; record only after all succeed.
        for (const statement of source.split(';').map(value => value.trim()).filter(Boolean)) {
          const constraint = statement.match(/^ALTER TABLE (\w+) ADD CONSTRAINT (\w+)/i);
          if (constraint) {
            const [present] = await connection.query('SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=? AND TABLE_NAME=? AND CONSTRAINT_NAME=?', [config.database, constraint[1], constraint[2]]);
            if (present.length) continue;
          }
          const column = statement.match(/^ALTER TABLE (\w+) ADD COLUMN (\w+)/i);
          if (column) {
            const [present] = await connection.query('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?', [config.database, column[1], column[2]]);
            if (present.length) continue;
          }
          await connection.query(statement);
        }
        await connection.query('INSERT INTO schema_migrations(version,checksum) VALUES (?,?)', [filename, checksum]);
      }
      return { schemaVersion: files.at(-1) || null };
    } finally {
      if (locked) await connection.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
      connection.release();
    }
  }
  async function health() {
    try {
      await query('SELECT 1');
      const rows = await query('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1');
      return { ok: rows.length > 0, schemaReady: rows.length > 0, schemaVersion: rows[0]?.version || null };
    } catch (cause) { throw unavailable(cause); }
  }
  return { pool, query, transaction, migrate, health, close: () => pool.end() };
}
module.exports = { createDatabase, configuration, unavailable };
