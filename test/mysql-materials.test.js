'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path'), sharp = require('sharp');
const { mysqlFixture, insertRegistration } = require('./helpers/mysql');
const { createMaterialService } = require('../server/materials');
const integration = (name, fn) => test(name, { skip: process.env.RUN_MYSQL_TESTS !== '1' }, fn);
const tokenFrom = url => new URLSearchParams(new URL(url).hash.slice(1)).get('token');
async function fixture(t) {
  const { db, env: mysqlEnv } = await mysqlFixture(t);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lp-mysql-materials-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const env = { ...mysqlEnv, MATERIALS_ENABLED: 'true', PUBLIC_BASE_URL: 'https://conference.example/conference/', MATERIALS_SIGNING_KEY: 'test-key-which-is-at-least-32-bytes-long', MATERIALS_STORAGE_DIR: path.join(root, 'originals'), MATERIALS_CACHE_DIR: path.join(root, 'cache') };
  const queued = [];
  const mail = { configured: () => true, async enqueue(tx, id, kind, payload, dedupe) {
    queued.push(payload);
    await tx.query("INSERT INTO mail_jobs(id,registration_id,kind,dedupe_key,encrypted_payload) VALUES (?,?,?,?,?)", [crypto.randomUUID(), id, kind, dedupe, JSON.stringify(payload)]);
    return { queued: true };
  } };
  const composeSupplement = value => ({ to: value.to, subject: 'Supplement', text: value.url, html: value.url });
  const service = createMaterialService({ db, env, mail, composeSupplement });
  async function registration(options = {}) {
    const row = await insertRegistration(db, { status: 'Approved', ...options });
    await db.query("UPDATE registrations SET option_id=?,company='Example Capital',job_title='Partner' WHERE id=?", [options.optionId || 'speaking', row.id]);
    const updated = (await db.query('SELECT * FROM registrations WHERE id=?', [row.id]))[0];
    const initial = await db.transaction(tx => service.initialize(tx, { ref: row.ref, package: { optionId: updated.option_id }, materialPreferences: { portraitConsent: true, logoConsent: true, language: 'en' } }, updated));
    return { row: updated, initial, token: tokenFrom(initial.supplementUrl) };
  }
  const file = { buffer: await sharp({ create: { width: 20, height: 16, channels: 3, background: '#123456' } }).png().toBuffer(), filename: 'private.png', mimeType: 'image/png' };
  async function review(ref, values) {
    const state = await service.me(ref);
    return service.review(ref, { rowVersion: state.assets[values.kind].rowVersion, ...values });
  }
  const boardService = require('../server/showcase').createShowcaseService({ db, env, materials: service });
  async function publish(ref, kind = 'portrait', changes = {}) {
    const board = await boardService.board(kind), candidate = (await boardService.candidates(kind)).rows.find(row => row.ref === ref);
    if (!candidate) throw Error('Approved candidate not found');
    return boardService.save(kind, { revision: board.revision, items: [...board.items.filter(row => row.entryId !== candidate.entryId), { ...candidate, ...changes }] });
  }
  return { db, env, root, queued, service, registration, file, review, publish, boardService, upload: (ref, kind = 'portrait') => service.upload(ref, kind, file) };
}

integration('MySQL initial material rows, opaque expiring credentials, atomic resend and disabled feature', async t => {
  const f = await fixture(t), a = await f.registration(), b = await f.registration();
  assert.equal((await f.db.query('SELECT * FROM material_items WHERE registration_id=?', [a.row.id])).length, 3);
  assert.equal((await f.db.query('SELECT * FROM publication_consents WHERE registration_id=?', [a.row.id])).length, 2);
  assert.equal((await f.db.query('SELECT * FROM showcase_entries WHERE enabled=1')).length, 0);
  const saved = await f.db.query('SELECT * FROM supplement_tokens WHERE registration_id=?', [a.row.id]);
  assert.equal(JSON.stringify(saved).includes(a.token), false);
  assert.equal(new URL(a.initial.supplementUrl).pathname, '/conference/materials');
  assert.equal(new URL(a.initial.supplementUrl).search, '');
  assert.equal((await f.service.authenticate(a.row.ref, a.token)).scope, 'supplement');
  await assert.rejects(f.service.authenticate(b.row.ref, a.token), error => error.statusCode === 401);
  const grant = f.service.uploadGrant(a.row.ref);
  assert.equal((await f.service.authenticate(a.row.ref, grant.token, { uploadOnly: true })).scope, 'upload');
  await assert.rejects(f.service.authenticate(a.row.ref, grant.token), error => error.statusCode === 403);
  await assert.rejects(f.service.authenticate(b.row.ref, grant.token, { uploadOnly: true }), error => error.statusCode === 401);
  const result = await f.service.resend(a.row.ref);
  assert.equal(result.queued, true);
  assert.equal((await f.db.query("SELECT * FROM mail_jobs WHERE kind='supplement'")).length, 1);
  await assert.rejects(f.service.authenticate(a.row.ref, a.token), error => error.statusCode === 401);
  const renewed = tokenFrom(f.queued[0].text);
  assert.equal((await f.service.authenticate(a.row.ref, renewed)).scope, 'supplement');
  await f.db.query('UPDATE supplement_tokens SET expires_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 DAY) WHERE registration_id=?', [a.row.id]);
  await assert.rejects(f.service.authenticate(a.row.ref, renewed), error => error.statusCode === 401);
  const disabled = createMaterialService({ db: f.db, env: { ...f.env, MATERIALS_ENABLED: 'false' } });
  assert.deepEqual(await f.db.transaction(tx => disabled.initialize(tx, {}, a.row)), { supplementUrl: '' });
});

integration('MySQL uploads preserve approved snapshots during replacement, serialize versions and reject stale review', async t => {
  const f = await fixture(t), { row } = await f.registration();
  await f.upload(row.ref, 'card');
  assert.equal((await f.service.me(row.ref)).assets.card.status, 'received');
  await Promise.all([f.upload(row.ref), f.upload(row.ref)]);
  let state = (await f.service.adminList(row.ref))[0];
  assert.equal(state.assets.portrait.version, 2);
  await f.review(row.ref, { kind: 'portrait', version: 2, rowVersion: state.assets.portrait.rowVersion, decision: 'approve' });
  await f.publish(row.ref, 'portrait');
  await f.upload(row.ref);
  state = (await f.service.adminList(row.ref))[0];
  assert.equal(state.publications.portrait.version, 2);
  assert.equal(state.assets.portrait.status, 'pending');
  await assert.rejects(f.review(row.ref, { kind: 'portrait', version: 2, rowVersion: state.assets.portrait.rowVersion - 1, decision: 'approve' }), error => error.statusCode === 409);
  await assert.rejects(f.review(row.ref, { kind: 'portrait', version: 3, rowVersion: state.assets.portrait.rowVersion - 1, decision: 'approve' }), error => error.statusCode === 409);
  await assert.rejects(f.review(row.ref, { kind: 'portrait', version: 3, decision: 'reject' }), error => error.statusCode === 400);
  await f.review(row.ref, { kind: 'portrait', version: 3, decision: 'reject', reason: 'Please provide a clearer photo' });
  assert.equal((await f.service.showcase()).speakers.length, 1);
  assert.ok((await f.service.preview(row.ref, 'portrait', { published: true })).buffer.length);
  await assert.rejects(f.service.publicImage(row.ref, 'card', 1), error => error.statusCode === 404);
  await f.upload(row.ref, 'logo');
  await f.review(row.ref, { kind: 'logo', version: 1, decision: 'approve' });
  await f.publish(row.ref, 'logo');
  assert.equal((await f.service.showcase()).organisations.length, 1);
});

integration('MySQL public media fails closed for revoked consent, deleted registrations and database outage', async t => {
  const f = await fixture(t), { row } = await f.registration();
  await f.upload(row.ref); await f.review(row.ref, { kind: 'portrait', version: 1, decision: 'approve' });
  await f.publish(row.ref, 'portrait');
  let dto = await f.service.showcase();
  const url = new URL(dto.speakers[0].imageUrl, f.env.PUBLIC_BASE_URL), parts = url.pathname.split('/');
  const id = parts.at(-2);
  assert.match(id, /^[0-9a-f-]{36}$/); assert.equal(url.pathname.startsWith('/conference/api/public/media/'), true);
  assert.ok((await f.service.publicMedia(id, 1)).buffer.length);
  const raw = JSON.stringify(dto);
  for (const privateValue of [row.email, row.ref, 'storage_key', 'private.png', 'token', 'mobile']) assert.equal(raw.includes(privateValue), false);
  await f.service.setConsents(row.ref, { portrait: false });
  await assert.rejects(f.service.publicMedia(id, 1), error => error.statusCode === 404);
  await f.service.setConsents(row.ref, { portrait: true });
  assert.equal((await f.service.showcase()).speakers.length, 0);
  await f.review(row.ref, { kind: 'portrait', version: 1, decision: 'approve' });
  await f.publish(row.ref, 'portrait');
  const { createRegistrationService } = require('../server/registration-service');
  const registrations = createRegistrationService({ db: f.db });
  await registrations.lifecycle('delete', { ref: row.ref, rowVersion: (await f.db.query('SELECT row_version FROM registrations WHERE id=?', [row.id]))[0].row_version });
  await assert.rejects(f.service.publicMedia(id, 1), error => error.statusCode === 404);
  await assert.rejects(f.service.authenticate(row.ref, f.service.uploadGrant(row.ref).token, { uploadOnly: true }), error => error.statusCode === 404);
  await registrations.lifecycle('restore', { ref: row.ref, rowVersion: (await f.db.query('SELECT row_version FROM registrations WHERE id=?', [row.id]))[0].row_version });
  assert.equal((await f.service.showcase()).speakers.length, 0);
  await f.review(row.ref, { kind: 'portrait', version: 1, decision: 'approve' });
  await f.publish(row.ref, 'portrait');
  const broken = createMaterialService({ db: { query: async () => { throw Error('SQL unavailable'); }, transaction: f.db.transaction }, env: f.env });
  await assert.rejects(broken.publicMedia(id, 1), /SQL unavailable/);
});

for(const kind of ['card','portrait','logo'])integration('MySQL '+kind+' review can return to pending and removes approval and active publication',async t=>{
 const f=await fixture(t),{row}=await f.registration();await f.upload(row.ref,kind);await f.review(row.ref,{kind,version:1,decision:'approve'});if(kind!=='card')await f.publish(row.ref,kind);
 const old=(await f.service.me(row.ref)).assets[kind];await f.review(row.ref,{kind,version:1,decision:'pending'});const state=await f.service.me(row.ref);assert.equal(state.assets[kind].status,kind==='card'?'received':'pending');assert.equal(state.assets[kind].approvedVersionId,null);assert.equal(state.assets[kind].reason,'');assert.ok(state.assets[kind].rowVersion>old.rowVersion);assert.equal(state.assets[kind].publishedVersion,null);assert.ok((await f.service.preview(row.ref,kind)).buffer.length);
 await assert.rejects(f.service.review(row.ref,{kind,version:1,rowVersion:old.rowVersion,decision:'approve'}),error=>error.statusCode===409);
 await f.review(row.ref,{kind,version:1,decision:'reject',reason:'Blurry'});await f.review(row.ref,{kind,version:1,decision:'pending'});assert.equal((await f.service.me(row.ref)).assets[kind].reason,'');
});

integration('MySQL metadata edits remain draft and same institution conflict is explicit on board save', async t => {
  const f = await fixture(t), a = await f.registration(), b = await f.registration();
  for (const r of [a, b]) { await f.upload(r.row.ref, 'logo'); await f.review(r.row.ref, { kind: 'logo', version: 1, decision: 'approve' }); }
  await f.service.configure(a.row.ref, { rowVersion: (await f.service.me(a.row.ref)).rowVersion, company: 'Fund' });
  await f.publish(a.row.ref, 'logo');
  await assert.rejects(f.publish(b.row.ref, 'logo', { organisationRef: a.row.ref }), error => error.statusCode === 409 && error.code === 'ORGANISATION_ALREADY_PUBLISHED');
  await f.upload(a.row.ref, 'logo');
  await f.service.configure(a.row.ref, { rowVersion: (await f.service.me(a.row.ref)).rowVersion, company: 'Updated Fund' });
  const state = (await f.service.adminList(a.row.ref))[0];
  assert.equal(state.assets.logo.status, 'pending'); assert.equal(state.publications.logo.version, 1);
  assert.equal((await f.service.showcase()).organisations[0].name, 'Fund');
  await f.service.remove(a.row.ref, 'logo');
  assert.equal((await f.service.me(a.row.ref)).assets.logo.version, 3);
  await assert.rejects(f.service.preview(a.row.ref, 'logo'), error => error.statusCode === 404);
  await f.upload(a.row.ref, 'logo'); assert.equal((await f.service.me(a.row.ref)).assets.logo.version, 4);
  await f.publish(b.row.ref, 'logo');
  await f.service.unpublish(b.row.ref, 'logo'); assert.equal((await f.service.showcase()).organisations.length, 0);
});

integration('MySQL publication enforces registration, explicit consent and server package eligibility', async t => {
  const f = await fixture(t), a = await f.registration({ status: 'Received' }), ticket = await f.registration({ optionId: 'ticket' });
  await assert.rejects(f.upload(ticket.row.ref), error => error.statusCode === 400);
  await f.upload(a.row.ref);
  await f.review(a.row.ref, { kind: 'portrait', version: 1, decision: 'approve' });
  await assert.rejects(f.publish(a.row.ref), error => error.statusCode === 409);
  await f.db.query("UPDATE registrations SET status='Approved' WHERE id=?", [a.row.id]);
  await f.service.setConsents(a.row.ref, { portrait: false });
  await f.review(a.row.ref, { kind: 'portrait', version: 1, decision: 'approve' });
  await assert.rejects(f.publish(a.row.ref), error => error.statusCode === 409);
  await assert.rejects(f.service.upload(a.row.ref, 'logo', { ...f.file, buffer: Buffer.from('corrupt') }), error => error.statusCode === 400);
  await f.service.setOwner(a.row.ref, { owner: 'Review Team', note: '', rowVersion: (await f.service.me(a.row.ref)).rowVersion });
  assert.equal((await f.service.adminList(a.row.ref))[0].owner, 'Review Team');
  const page = await f.service.adminPage({ pageSize: 1 }); assert.equal(page.rows.length, 1); assert.equal(page.total, 2);
  const filtered = await f.service.adminPage({ ref: a.row.ref }); assert.equal(filtered.total, 1);
  const events = await f.db.query('SELECT action,actor FROM audit_events WHERE registration_id=?', [a.row.id]);
  assert.equal(events.find(event => event.action === 'upload').actor, 'registrant');
  assert.equal(events.find(event => event.action === 'owner').actor, 'administrator');
});

integration('MySQL failed resend rolls back revocation and stale authenticated writes cannot survive token rotation', async t => {
  const f = await fixture(t), a = await f.registration();
  const stale = await f.service.authenticate(a.row.ref, a.token);
  const broken = createMaterialService({ db: f.db, env: f.env, mail: { configured: () => true, enqueue: async () => { throw Error('Outbox insert failed'); } } });
  await assert.rejects(broken.resend(a.row.ref), /Outbox insert failed/);
  assert.equal((await f.service.authenticate(a.row.ref, a.token)).scope, 'supplement');
  assert.equal((await f.db.query('SELECT * FROM supplement_tokens WHERE registration_id=?', [a.row.id])).length, 1);
  await f.service.resend(a.row.ref);
  await assert.rejects(f.service.upload(a.row.ref, 'logo', f.file, stale), error => error.statusCode === 401);
  await assert.rejects(f.service.setConsents(a.row.ref, { logo: false }, stale), error => error.statusCode === 401);
  await assert.rejects(f.service.remove(a.row.ref, 'logo', stale), error => error.statusCode === 401);
  await assert.rejects(f.service.me(a.row.ref, stale), error => error.statusCode === 401);
  assert.equal((await f.service.me(a.row.ref)).assets.logo.version, 0);
  const expired = Buffer.from(JSON.stringify({ ref: a.row.ref, scope: 'upload', exp: Date.now() - 1, nonce: 'test' })).toString('base64url');
  const expiredToken = expired + '.' + crypto.createHmac('sha256', f.env.MATERIALS_SIGNING_KEY).update(expired).digest('base64url');
  await assert.rejects(f.service.authenticate(a.row.ref, expiredToken, { uploadOnly: true }), error => error.statusCode === 401);
  const grantAuth = await f.service.authenticate(a.row.ref, f.service.uploadGrant(a.row.ref).token, { uploadOnly: true });
  await assert.rejects(f.service.setConsents(a.row.ref, { logo: false }, grantAuth), error => error.statusCode === 403);
  await assert.rejects(f.service.preview(a.row.ref, 'logo', { authContext: grantAuth }), error => error.statusCode === 403);
  await f.service.upload(a.row.ref, 'logo', f.file, grantAuth);
  assert.equal((await f.service.me(a.row.ref)).assets.logo.version, 1);
});

integration('MySQL public media rechecks consent after decoding and before returning cached bytes', async t => {
  const f = await fixture(t), a = await f.registration();
  await f.upload(a.row.ref); await f.review(a.row.ref, { kind: 'portrait', version: 1, decision: 'approve' });
  await f.publish(a.row.ref);
  const entry = (await f.db.query("SELECT s.id FROM showcase_entries s JOIN material_items m ON m.id=s.item_id WHERE m.registration_id=? AND s.kind='portrait'", [a.row.id]))[0];
  await f.service.publicMedia(entry.id, 1);
  let reads = 0;
  const concurrentDb = { transaction: f.db.transaction, async query(sql, params) {
    const result = await f.db.query(sql, params);
    if (sql.includes('AND s.id=?') && ++reads === 1) await f.service.setConsents(a.row.ref, { portrait: false });
    return result;
  } };
  const concurrent = createMaterialService({ db: concurrentDb, env: f.env });
  await assert.rejects(concurrent.publicMedia(entry.id, 1), error => error.statusCode === 404);
  assert.equal(reads, 2);
});

integration('MySQL review rejection revokes the published version; unpublish preserves originals across service restart', async t => {
  const f = await fixture(t), { row } = await f.registration();
  await f.upload(row.ref); await f.review(row.ref, { kind: 'portrait', version: 1, decision: 'approve' });
  await f.publish(row.ref, 'portrait');
  await f.review(row.ref, { kind: 'portrait', version: 1, decision: 'reject', reason: 'Publication permission needs confirmation' });
  assert.equal((await f.service.showcase()).speakers.length, 0);
  await f.review(row.ref, { kind: 'portrait', version: 1, decision: 'approve' });
  await f.publish(row.ref, 'portrait');
  const restarted = createMaterialService({ db: f.db, env: f.env });
  assert.ok((await restarted.preview(row.ref, 'portrait')).buffer.length);
  assert.ok((await restarted.publicImage(row.ref, 'portrait', 1)).buffer.length);
  await restarted.unpublish(row.ref, 'portrait');
  assert.ok((await restarted.preview(row.ref, 'portrait')).buffer.length);
  await assert.rejects(restarted.publicImage(row.ref, 'portrait', 1), error => error.statusCode === 404);
  const broken = createMaterialService({ db: f.db, env: { ...f.env, MATERIALS_STORAGE_DIR: '/dev/null/originals' } });
  await assert.rejects(broken.upload(row.ref, 'portrait', f.file), error => error.code === 'MATERIALS_STORAGE_UNAVAILABLE');
  assert.equal((await restarted.me(row.ref)).assets.portrait.version, 1);
});

integration('MySQL initial consent remains available when recent audit exceeds the admin window', async t => {
  const f = await fixture(t), { row } = await f.registration();
  await f.db.query('INSERT INTO audit_events(registration_id,action,actor,detail) VALUES ' + Array(205).fill('(?,?,?,?)').join(','), Array.from({ length: 205 }, () => [row.id, 'owner', 'administrator', '{}']).flat());
  const state = (await f.service.adminList(row.ref))[0];
  assert.equal(state.audit.length, 200);
  assert.ok(state.initialConsent, 'initial consent must survive the recent audit window');
  assert.equal(state.initialConsent.actor, 'registrant');
  assert.deepEqual(state.initialConsent.values, { portrait: true, logo: true });
});

integration('MySQL resend supersedes old queued mail and clears processing leases atomically', async t => {
  const f = await fixture(t), { row } = await f.registration();
  const jobs = [['registration', 'pending'], ['supplement', 'pending'], ['supplement', 'processing'], ['registration', 'sent']];
  for (const [kind, status] of jobs) await f.db.query('INSERT INTO mail_jobs(id,registration_id,kind,dedupe_key,encrypted_payload,status,lease_token,lease_until) VALUES (?,?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 60 SECOND))', [crypto.randomUUID(), row.id, kind, crypto.randomUUID(), 'old-private-payload', status, crypto.randomUUID()]);
  await f.service.resend(row.ref);
  const superseded = await f.db.query("SELECT * FROM mail_jobs WHERE registration_id=? AND last_error='SUPERSEDED'", [row.id]);
  assert.equal(superseded.length, 3);
  for (const job of superseded) {
    assert.equal(job.status, 'failed'); assert.equal(job.encrypted_payload, null); assert.equal(job.lease_token, null); assert.equal(job.lease_until, null);
  }
  assert.equal((await f.db.query("SELECT * FROM mail_jobs WHERE registration_id=? AND status='pending'", [row.id])).length, 1);
  assert.equal((await f.db.query("SELECT * FROM mail_jobs WHERE registration_id=? AND status='sent'", [row.id])).length, 1);
});


integration('MySQL review requires both an integer image version and material revision', async t => {
  const f = await fixture(t), { row } = await f.registration();
  await f.upload(row.ref);
  const state = await f.service.me(row.ref);
  for (const rowVersion of [undefined, null, String(state.assets.portrait.rowVersion), 1.5]) {
    await assert.rejects(f.service.review(row.ref, { kind: 'portrait', version: 1, rowVersion, decision: 'approve' }), error => error.statusCode === 409 && error.code === 'VERSION_CONFLICT');
  }
  await assert.rejects(f.service.review(row.ref, { kind: 'portrait', rowVersion: state.assets.portrait.rowVersion, decision: 'approve' }), error => error.statusCode === 409);
  await f.review(row.ref, { kind: 'portrait', version: 1, decision: 'approve' });
  await f.publish(row.ref, 'portrait');
});

for (const action of ['unpublish', 'configure', 'withdraw-and-regrant']) integration('MySQL stale review fails after ' + action + ' and a fresh revision can publish', async t => {
  const f = await fixture(t), { row } = await f.registration();
  await f.upload(row.ref);
  await f.review(row.ref, { kind: 'portrait', version: 1, decision: 'approve' });
  await f.publish(row.ref, 'portrait');
  const before = await f.service.me(row.ref), oldRevision = before.assets.portrait.rowVersion;
  if (action === 'unpublish') await f.service.unpublish(row.ref, 'portrait');
  else if (action === 'configure') await f.service.configure(row.ref, { rowVersion: before.rowVersion, name: 'New public name' });
  else {
    await f.service.setConsents(row.ref, { portrait: false });
    await f.service.setConsents(row.ref, { portrait: true });
  }
  await assert.rejects(f.service.review(row.ref, { kind: 'portrait', version: 1, rowVersion: oldRevision, decision: 'approve' }), error => error.statusCode === 409 && error.code === 'VERSION_CONFLICT');
  const current = await f.service.me(row.ref);
  assert.ok(current.assets.portrait.rowVersion > oldRevision);
  assert.equal(current.assets.card.rowVersion, before.assets.card.rowVersion);
  assert.equal(current.assets.logo.rowVersion > before.assets.logo.rowVersion, action === 'configure');
  await f.service.review(row.ref, { kind: 'portrait', version: 1, rowVersion: current.assets.portrait.rowVersion, decision: 'approve' });
  await f.publish(row.ref);
  assert.equal((await f.service.showcase()).speakers.length, 1);
});
