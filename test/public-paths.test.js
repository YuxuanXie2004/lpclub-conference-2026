'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { publicUrl, deploymentPrefix, stripPrefix } = require('../server/public-paths');
for (const base of ['https://lp-club.cn', 'https://lp-club.cn/2026-pe-conference', 'https://lp-club.cn/2026-pe-conference/']) {
  test('all public URLs preserve configured deployment path: ' + base, () => {
    const expected = base.includes('2026-') ? '/2026-pe-conference' : '';
    assert.equal(deploymentPrefix(base), expected);
    assert.equal(publicUrl(base, '/materials'), 'https://lp-club.cn' + expected + '/materials');
    assert.equal(publicUrl(base, 'api/public/media/id/1'), 'https://lp-club.cn' + expected + '/api/public/media/id/1');
    assert.equal(stripPrefix(expected + '/api/order', base), '/api/order');
    assert.equal(stripPrefix('/api/order', base), '/api/order');
    assert.equal(stripPrefix('/2026-pe-conference-other/api/order', base), '/2026-pe-conference-other/api/order');
  });
}
test('public base forbids credentials, non-http protocols and nonlocal plaintext', () => {
  for(const base of ['https://user:secret@example.com','javascript:alert(1)','http://example.com','https://example.com/path?secret=x','https://example.com/#token']) assert.throws(() => publicUrl(base,'materials'));
  assert.equal(publicUrl('http://localhost:8787','materials'),'http://localhost:8787/materials');
});
