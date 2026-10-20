'use strict';
const mysql = require('mysql2/promise');
const { createDatabase, configuration, unavailable } = require('./database');

async function initialize(env = process.env) {
  const { loadEnv } = require('./env');
  loadEnv(env);
  const config = configuration(env);
  let admin;
  try {
    admin = await mysql.createConnection({ host: config.host, port: config.port, user: config.user, password: config.password, connectTimeout: config.connectTimeout });
    await admin.query('CREATE DATABASE IF NOT EXISTS ' + mysql.escapeId(config.database) + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  } catch (cause) { throw unavailable(cause); }
  finally { if (admin) await admin.end(); }
  const db = createDatabase(env);
  try { await db.migrate(); return await db.health(); }
  finally { await db.close(); }
}
if (require.main === module) {
  initialize().then(result => console.log('Database schema ready: ' + result.schemaVersion)).catch(error => { console.error('Database initialization failed: ' + error.message); process.exitCode = 1; });
}
module.exports = { initialize };
