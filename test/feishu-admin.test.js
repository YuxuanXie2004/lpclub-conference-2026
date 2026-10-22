'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { renderNotificationPanel } = require('../server/notification-admin');

test('Feishu operations are collapsed at the top of their own notification panel', () => {
  const html = renderNotificationPanel('feishu');
  assert.match(html, /^<details id="feishuStatusPanel"[^>]*><summary/);
  assert.doesNotMatch(html.match(/<details[^>]*>/)[0], /\bopen\b/);
  assert.ok(html.indexOf('</details>') < html.indexOf('id="feishuConnection"'));
  assert.doesNotMatch(renderNotificationPanel('mail'), /feishuStatusPanel/);
});

test('Feishu status displays SQL UTC and ISO timestamps in Beijing time', async () => {
  const nodes = new Map();
  const document = { getElementById(id) { if (!nodes.has(id)) nodes.set(id, { textContent: '', value: '' }); return nodes.get(id); } };
  const window = { LPClubAdminI18n: { language: 'zh', text: (key, params = {}) => key.replace(/\{(\w+)\}/g, (_, name) => params[name]) } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/feishu-admin.js'), 'utf8'), {
    document, window, fetch: async () => ({ ok: true, json: async () => ({
      jobs: [{ status: 'pending', count: 1, oldest: '2026-10-22 00:01:02.000' }],
      sync: [{ status: 'synced', count: 1, lastSuccess: '2026-10-22 07:46:34.757' }],
      reconciliation: { lastReconcile: '2026-10-22T07:25:30Z' }
    }) })
  });
  await window.LPClubFeishuStatus.refresh();
  const text = nodes.get('feishuErrors').textContent;
  assert.match(text, /15:25:30/);
  assert.match(text, /08:01:02/);
  assert.match(text, /15:46:34/);
  assert.doesNotMatch(text, /UTC|Invalid Date/);
  assert.match(text, /Beijing time/);
});
