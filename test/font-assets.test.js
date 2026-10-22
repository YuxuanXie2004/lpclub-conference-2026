'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const localServer = require('./helpers/local-server.cjs');

test('local Chinese font assets are served with font MIME type and security headers', async () => {
  const app = await localServer();
  try {
    const response = await fetch(app.base + '/assets/fonts/noto-sans-sc-000.woff2');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'font/woff2');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0, 4).toString(), 'wOF2');
    assert.equal(Number(response.headers.get('content-length') || bytes.length), bytes.length);
    const missing = await fetch(app.base + '/assets/fonts/missing-font.woff2');
    assert.equal(missing.status, 404);
  } finally {
    await app.close();
  }
});
