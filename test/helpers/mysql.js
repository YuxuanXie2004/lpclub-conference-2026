'use strict';
const crypto = require('node:crypto');

async function mysqlFixture(t) {
  const mysql = require('mysql2/promise');
  const name = 'lpclub_conference_test_' + crypto.randomBytes(8).toString('hex');
  const env = require('../../server/env').loadEnv({ ...process.env, MYSQL_DATABASE: name });
  const admin = await mysql.createConnection({ host: env.MYSQL_HOST || '127.0.0.1', port: Number(env.MYSQL_PORT || 3306), user: env.MYSQL_USER || 'root', password: env.MYSQL_PASSWORD || '' });
  await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  let db;
  t.after(async () => { if (db) await db.close(); await admin.query(`DROP DATABASE \`${name}\``); await admin.end(); });
  db = require('../../server/database').createDatabase(env);
  await db.migrate();
  return { db, env, name };
}

async function insertRegistration(db, input = {}) {
  const id = input.id || crypto.randomUUID();
  await db.query('INSERT INTO registrations (id,event_key,ref,email,full_name,status) VALUES (?,?,?,?,?,?)', [id, input.eventKey || 'conference-2026', input.ref || 'LPC26-' + crypto.randomBytes(6).toString('hex'), input.email || id + '@example.com', input.fullName || 'Jane Doe', input.status || 'Received']);
  return (await db.query('SELECT * FROM registrations WHERE id=?', [id]))[0];
}
module.exports = { mysqlFixture, insertRegistration };
