'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { mysqlFixture, insertRegistration } = require('./helpers/mysql');
const integration = process.env.RUN_MYSQL_TESTS === '1';

// Integration fixtures create and remove only randomly named test databases.
test('MySQL database and VIP repository modules expose the asynchronous contract', () => {
  assert.equal(typeof require('../server/database').createDatabase, 'function');
  assert.equal(typeof require('../server/mysql-vip-store').createMysqlVipStore, 'function');
});

test('MySQL migration is repeatable and active emails are unique per event', { skip: !integration }, async t => {
  const { db } = await mysqlFixture(t);
  await db.migrate();
  assert.equal((await db.query('SELECT * FROM schema_migrations')).length, 4);
  assert.equal((await db.health()).ok, true);
  const a = await insertRegistration(db, { email: 'SAME@example.com' });
  await assert.rejects(insertRegistration(db, { email: 'same@example.com' }), e => e.code === 'ER_DUP_ENTRY');
  await insertRegistration(db, { email: 'same@example.com', eventKey: 'conference-2027' });
  await db.query("UPDATE registrations SET status='Rejected' WHERE id=?", [a.id]);
  await insertRegistration(db, { email: 'same@example.com' });
  await assert.rejects(db.query("UPDATE registrations SET status='Approved' WHERE id=?", [a.id]), e => e.code === 'ER_DUP_ENTRY');
  const rows = await db.query('SHOW TABLES');
  assert.equal(rows.length, 17);
});

test('MySQL transaction rolls back inserts and retries only confirmed deadlocks', { skip: !integration }, async t => {
  const { db } = await mysqlFixture(t);
  await assert.rejects(db.transaction(async tx => { await insertRegistration(tx); throw Error('rollback'); }), /rollback/);
  assert.equal((await db.query('SELECT * FROM registrations')).length, 0);
  let attempts = 0;
  await db.transaction(async tx => { attempts++; await insertRegistration(tx); if (attempts === 1) throw Object.assign(Error('deadlock'), { code: 'ER_LOCK_DEADLOCK' }); });
  assert.equal(attempts, 2);
  assert.equal((await db.query('SELECT * FROM registrations')).length, 1);
});

test('MySQL material foreign keys reject a current version belonging to another item', { skip: !integration }, async t => {
  const { db } = await mysqlFixture(t);
  const reg = await insertRegistration(db);
  const file = crypto.randomUUID(), a = crypto.randomUUID(), b = crypto.randomUUID(), version = crypto.randomUUID();
  await db.query('INSERT INTO material_files(id,storage_key,filename,mime_type,byte_size,sha256) VALUES (?,?,?,?,?,?)', [file, crypto.randomBytes(32).toString('hex'), 'card.png', 'image/png', 10, 'a'.repeat(64)]);
  await db.query("INSERT INTO material_items(id,registration_id,kind) VALUES (?,?,'card'),(?,?,'portrait')", [a, reg.id, b, reg.id]);
  await db.query("INSERT INTO material_versions(id,item_id,version_no,file_id,status) VALUES (?,?,?,?, 'pending')", [version, a, 1, file]);
  await db.query('UPDATE material_items SET current_version_id=?,approved_version_id=? WHERE id=?', [version, version, a]);
  await assert.rejects(db.query('UPDATE material_items SET approved_version_id=? WHERE id=?', [version, b]), e => e.code === 'ER_NO_REFERENCED_ROW_2');
  await assert.rejects(db.query('UPDATE material_items SET current_version_id=? WHERE id=?', [version, b]), e => e.code === 'ER_NO_REFERENCED_ROW_2');
});

test('MySQL VIP management encrypts codes, validates edits, expires and audits', { skip: !integration }, async t => {
  const { db } = await mysqlFixture(t);
  const { createMysqlVipStore } = require('../server/mysql-vip-store');
  const env = { VIP_CODE_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64') };
  const store = createMysqlVipStore(db, env);
  const items = await store.generate({ count: 2, batchName: 'Partners' });
  const detail = await store.detail(items[0].id), code = detail.item.code;
  assert.equal((await store.previewCode(' ' + code.toLowerCase() + ' ')).id, items[0].id);
  assert.ok(!JSON.stringify(await db.query('SELECT * FROM vip_codes')).includes(code));
  await store.update(items[0].id, { recipientName: 'Jane', recipientEmail: 'JANE@example.com', distributedAt: new Date().toISOString(), note: 'manual' });
  assert.equal((await store.list({ q: 'Jane' })).total, 1);
  assert.equal((await store.list({ q: code })).total, 1);
  assert.equal((await store.export([items[0].id]))[0].code, code);
  assert.equal((await store.revoke({ ids: [items[0].id], reason: 'withdrawn' })).revoked, 1);
  await assert.rejects(store.previewCode(code), e => e.code === 'VIP_REVOKED');
  assert.ok((await store.detail(items[0].id)).events.length >= 4);
  await db.query('UPDATE vip_codes SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) WHERE id=?', [items[1].id]);
  assert.equal((await store.list({ status: 'expired' })).total, 1);
  await assert.rejects(store.generate({ count: 201 }), e => e.code === 'INVALID_COUNT');
  assert.throws(() => createMysqlVipStore(db, { VIP_CODE_ENCRYPTION_KEY: 'bad' }), e => e.code === 'VIP_STORAGE_UNAVAILABLE');
});

test('MySQL VIP redemption is atomic, idempotent and one winner across connections', { skip: !integration }, async t => {
  const { db } = await mysqlFixture(t);
  const { createMysqlVipStore } = require('../server/mysql-vip-store');
  const store = createMysqlVipStore(db, { VIP_CODE_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64') });
  const items = await store.generate({ count: 2 }), code = (await store.detail(items[0].id)).item.code;
  const a = await insertRegistration(db), b = await insertRegistration(db);
  const key = crypto.randomUUID();
  await assert.rejects(db.transaction(async tx => { await store.redeem(tx, code, a, key); throw Error('rollback'); }), /rollback/);
  assert.equal((await store.previewCode(code)).status, 'available');
  const outcomes = await Promise.allSettled([db.transaction(tx => store.redeem(tx, code, a, key)), db.transaction(tx => store.redeem(tx, code, b, crypto.randomUUID()))]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(result => result.status === 'rejected').reason.code, 'VIP_USED');
  const used = (await db.query('SELECT * FROM vip_redemptions'))[0];
  const reg = used.registration_id === a.id ? a : b;
  const replay = await db.transaction(tx => store.redeem(tx, code, reg, used.request_key));
  assert.equal(replay.status, 'used');
  await assert.rejects(db.transaction(tx => store.redeem(tx, code, reg, crypto.randomUUID())), e => e.code === 'VIP_USED');
});

test('MySQL connection failures expose a safe service unavailable error', async () => {
  const { createDatabase } = require('../server/database');
  const db = createDatabase({ MYSQL_DATABASE: 'lpclub_conference_test_unreachable', MYSQL_HOST: '127.0.0.1', MYSQL_PORT: '1' });
  try { await assert.rejects(db.query('SELECT 1'), e => e.code === 'DATABASE_UNAVAILABLE' && e.statusCode === 503); }
  finally { await db.close(); }
});

test('MySQL never retries a transaction after a lost commit response', { skip: !integration }, async t => {
  const { db } = await mysqlFixture(t);
  const acquire = db.pool.getConnection.bind(db.pool);
  db.pool.getConnection = async () => {
    const connection = await acquire(), commit = connection.commit.bind(connection);
    connection.commit = async () => { await commit(); throw Object.assign(Error('lost commit response'), { code: 'ER_LOCK_DEADLOCK' }); };
    return connection;
  };
  let attempts = 0;
  await assert.rejects(db.transaction(async tx => { attempts++; await insertRegistration(tx); }), e => e.commitUncertain === true);
  assert.equal(attempts, 1);
  assert.equal((await db.query('SELECT * FROM registrations')).length, 1);
});

test('MySQL migration restarts partial DDL and rejects changed checksums', { skip: !integration }, async t => {
  const { db } = await mysqlFixture(t);
  await db.query('DELETE FROM schema_migrations');
  await db.migrate();
  assert.equal((await db.query('SELECT * FROM schema_migrations')).length, 4);
  await db.query("UPDATE schema_migrations SET checksum=REPEAT('0',64)");
  await assert.rejects(db.migrate(), /checksum mismatch/);
});

test('MySQL initializer creates only the configured new database and can repeat', { skip: !integration }, async t => {
  const mysql = require('mysql2/promise');
  const name = 'lpclub_conference_test_' + crypto.randomBytes(8).toString('hex');
  const env = require('../server/env').loadEnv({ ...process.env, MYSQL_DATABASE: name });
  const admin = await mysql.createConnection({ host: env.MYSQL_HOST, port: Number(env.MYSQL_PORT || 3306), user: env.MYSQL_USER, password: env.MYSQL_PASSWORD });
  t.after(async () => { await admin.query(`DROP DATABASE IF EXISTS \`${name}\``); await admin.end(); });
  const { initialize } = require('../server/init-db');
  assert.equal((await initialize(env)).schemaReady, true);
  assert.equal((await initialize(env)).schemaReady, true);
});

test('MySQL session timestamps are UTC and cold VIP checks never request an extra pool connection', {skip:!integration}, async t=>{
 const {db}=await mysqlFixture(t);
 const [{offset}]=await db.query('SELECT TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(),CURRENT_TIMESTAMP()) AS offset');assert.equal(offset,0);
 const {createMysqlVipStore}=require('../server/mysql-vip-store');const env={VIP_CODE_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64')};
 const warm=createMysqlVipStore(db,env),[item]=await warm.generate({count:1}),raw=(await warm.detail(item.id)).item.code;
 const cold=createMysqlVipStore({...db,query(){throw Error('Must use the supplied transaction connection');}},env);
 await db.transaction(async tx=>{assert.equal((await cold.previewCode(raw,tx)).id,item.id)});
});

test('MySQL showcase upgrade preserves legacy publication layout and backfills latest approved versions', { skip: !integration }, async t => {
  const { db } = await mysqlFixture(t), reg = await insertRegistration(db, { status: 'Approved' });
  await db.query('ALTER TABLE material_items DROP FOREIGN KEY item_approved_version');
  await db.query('ALTER TABLE material_items DROP COLUMN approved_version_id');
  await db.query('ALTER TABLE registrations DROP COLUMN follow_up_note');
  await db.query('DROP TABLE showcase_boards');
  await db.query("DELETE FROM schema_migrations WHERE version='002-showcase.sql'");
  const file = crypto.randomUUID(), item = crypto.randomUUID(), entry = crypto.randomUUID(), versions = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  await db.query('INSERT INTO material_files(id,storage_key,filename,mime_type,byte_size,sha256) VALUES (?,?,?,?,?,?)', [file, crypto.randomBytes(32).toString('hex'), 'photo.png', 'image/png', 10, 'c'.repeat(64)]);
  await db.query("INSERT INTO material_items(id,registration_id,kind) VALUES (?,?,'portrait')", [item, reg.id]);
  for (const [index, id] of versions.entries()) await db.query('INSERT INTO material_versions(id,item_id,version_no,file_id,status) VALUES (?,?,?,?,?)', [id, item, index + 1, file, index === 2 ? 'pending' : 'approved']);
  await db.query('UPDATE material_items SET current_version_id=?,version_no=3 WHERE id=?', [versions[2], item]);
  const config = { draft: { name: { en: 'Draft', zh: '草稿' } }, published: { name: { en: 'Published', zh: '公开' }, crop: { portrait: { x: .3, y: .6 } } } };
  await db.query("INSERT INTO showcase_entries(id,item_id,event_key,kind,published_version_id,enabled,config_json,sort_order,org_key) VALUES (?,?,'conference-2026','portrait',?,1,?,9,?)", [entry, item, versions[0], JSON.stringify(config), reg.id]);
  // Simulate a process stopping after the first ADD COLUMN's implicit commit.
  await db.query('ALTER TABLE registrations ADD COLUMN follow_up_note TEXT NULL');
  await db.migrate();
  assert.equal((await db.query('SELECT approved_version_id FROM material_items WHERE id=?', [item]))[0].approved_version_id, versions[1]);
  const saved = (await db.query('SELECT * FROM showcase_entries WHERE id=?', [entry]))[0];
  assert.equal(saved.enabled, 1); assert.equal(saved.published_version_id, versions[0]); assert.equal(saved.sort_order, 9);
  assert.deepEqual(typeof saved.config_json === 'string' ? JSON.parse(saved.config_json) : saved.config_json, config);
  assert.equal((await db.query('SELECT * FROM showcase_boards')).length, 2);
});
