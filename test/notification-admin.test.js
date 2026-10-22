'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { renderTablePage } = require('../server/sheet');
const { createMailOutbox, decryptPayload, encryptPayload } = require('../server/mail-outbox');
const service = options => require('../server/notification-admin').createNotificationAdmin(options);
const id = '11111111-1111-4111-8111-111111111111';
const env = { MAIL_PAYLOAD_KEY: crypto.randomBytes(32).toString('base64'), SMTP_PASS: 'test' };

test('notification channels have independent sidebar panels and no global Feishu accordion', () => {
  const html = renderTablePage('');
  assert.equal((html.match(/role="tab"/g) || []).length, 7);
  for (const name of ['feishu', 'mail']) {
    assert.match(html, new RegExp('id="' + name + 'Tab"[^>]*aria-controls="' + name + 'Panel"'));
    assert.match(html, new RegExp('id="' + name + 'Panel"[^>]*role="tabpanel"'));
  }
  assert.doesNotMatch(html, /<details id="feishuStatusPanel"/);
});

test('mail list filters are parameterized and pagination is bounded; payloads never enter list responses', async () => {
  const calls = [];
  const api = service({ env, integrations: {}, db: { query: async (sql, args) => {
    calls.push({ sql, args });
    return sql.includes('GROUP BY') ? [{ status: 'sent', count: 2 }] : sql.includes('COUNT(*)') ? [{ total: 2 }] : [{ id, status: 'sent' }];
  } } });
  const result = await api.list('mail', { q: "x' OR 1=1 --", status: 'sent', kind: 'registration', page: '2', pageSize: '999', from: '2026-10-20', to: '2026-10-22' });
  assert.equal(result.pageSize, 100);
  assert.equal(result.page, 2);
  assert.equal(result.stats.sent, 2);
  assert.equal(result.total, 2);
  const rows = calls.find(c => c.sql.includes('LIMIT'));
  assert.ok(rows.args.includes("%x' OR 1=1 --%"));
  assert.doesNotMatch(rows.sql, /OR 1=1|encrypted_payload|encrypted_snapshot/);
  assert.deepEqual(rows.args.slice(-2), [100, 100]);
  await assert.rejects(api.list('mail', { status: 'unknown' }), e => e.statusCode === 400);
  await assert.rejects(api.list('mail', { from: '2026-02-30' }), e => e.statusCode === 400);
  await assert.rejects(api.list('mail', { from: '2026-10-22', to: '2026-10-20' }), e => e.statusCode === 400);
});

test('new mail jobs persist a separate encrypted content snapshot while excluding attachments', async () => {
  let write;
  const outbox = createMailOutbox({ db: {}, env });
  await outbox.enqueue({ query: async (sql, args) => { write = { sql, args }; } }, id, 'registration', { to: 'original@example.com', subject: 'Original subject', text: 'Original body', html: '<h1>Original body</h1>', attachments: [{ content: 'large-base64' }] });
  assert.match(write.sql, /encrypted_snapshot/);
  const snapshot = write.args.map(value => { try { return decryptPayload(value, env.MAIL_PAYLOAD_KEY); } catch (_) { return null; } }).find(value => value?.subject && !value.attachments);
  assert.deepEqual(snapshot, { to: 'original@example.com', subject: 'Original subject', text: 'Original body', html: '<h1>Original body</h1>' });
});

test('mail detail uses immutable snapshot and explains missing historical content', async () => {
  let job = { id, ref: 'REF', status: 'sent', email: 'changed@example.com', encrypted_snapshot: encryptPayload({ to: 'original@example.com', subject: 'Historical subject', text: '<script>private</script>', html: '<h1>Historical body</h1>' }, env.MAIL_PAYLOAD_KEY) };
  const api = service({ env, db: { query: async () => [job] }, integrations: {} });
  const detail = await api.detail('mail', id);
  assert.equal(detail.content.to, 'original@example.com');
  assert.equal(detail.content.subject, 'Historical subject');
  assert.equal(detail.content.text, '<script>private</script>');
  assert.equal(detail.content.html, '<h1>Historical body</h1>');
  assert.equal(detail.encrypted_snapshot, undefined);
  job = { ...job, encrypted_snapshot: null };
  assert.equal((await api.detail('mail', id)).contentAvailable, false);
});

test('historical mail recipients are never replaced with a changed registration email', async () => {
  const calls = [];
  const api = service({ env, integrations: {}, db: { query: async (sql, args) => { calls.push({ sql, args }); return []; } } });
  await api.list('mail');
  assert.doesNotMatch(calls.find(c => c.sql.includes('LIMIT')).sql, /NULLIF\(j.recipient,''\),r.email/);
});

test('mail retry refuses successful and in-flight jobs and updates registration state transactionally', async () => {
  const calls = []; let status = 'sent';
  const tx = { query: async (sql, args) => { calls.push({ sql, args }); return sql.startsWith('SELECT') ? [{ id, registration_id: 'reg', kind: 'registration', status, encrypted_payload: 'payload' }] : { affectedRows: 1 }; } };
  const api = service({ env, db: { transaction: fn => fn(tx) }, integrations: { capture: async () => calls.push({ sql: 'capture' }) } });
  for (status of ['sent', 'processing', 'pending']) await assert.rejects(api.retryMail(id), e => e.statusCode === 409);
  assert.equal(calls.filter(c => c.sql.startsWith('UPDATE')).length, 0);
  status = 'failed';
  await api.retryMail(id);
  assert.ok(calls.some(c => /FOR UPDATE/.test(c.sql)));
  assert.ok(calls.some(c => /UPDATE mail_jobs/.test(c.sql)));
  assert.ok(calls.some(c => /email_status='Queued'/.test(c.sql)));
  assert.ok(calls.some(c => c.sql === 'capture'));
  await assert.rejects(api.retryMail('bad'), e => e.statusCode === 400);
});

test('Feishu list and retry stay scoped to the active sync target', async () => {
  const calls = [];
  const api = service({ env, integrations: { target: 'current-target' }, db: { query: async (sql, args) => { calls.push({ sql, args }); return sql.includes('COUNT(*)') ? [] : []; } } });
  await api.list('sync', {});
  assert.ok(calls.every(c => c.sql.includes('target_key=?') && c.args.includes('current-target')));
});

test('mail detail supports older full payloads without exposing attachments', async () => {
  const job = { id, encrypted_payload: encryptPayload({ to: 'guest@example.com', html: '<p>Saved HTML</p>', attachments: [{ content: 'private' }] }, env.MAIL_PAYLOAD_KEY) };
  const api = service({ env, db: { query: async () => [job] }, integrations: {} });
  const detail = await api.detail('mail', id);
  assert.equal(detail.content.html, '<p>Saved HTML</p>');
  assert.equal(detail.content.attachments, undefined);
  assert.equal(detail.encrypted_payload, undefined);
});
