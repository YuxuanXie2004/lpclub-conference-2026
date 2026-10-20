'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { createMaterialService, decodeImage, MAX_BYTES } = require('../server/materials');
const image = () => sharp({ create: { width: 12, height: 10, channels: 3, background: '#126544' } }).png().toBuffer();
const env = { MATERIALS_ENABLED: 'true', PUBLIC_BASE_URL: 'https://conference.example/conference/', MATERIALS_SIGNING_KEY: 'test-key-which-is-at-least-32-bytes-long' };

test('MySQL materials readiness requires database and valid settings, always uses local originals', async () => {
  const db = { query() {}, transaction() {} };
  assert.equal(createMaterialService({ db, env }).ready(), true);
  assert.equal(createMaterialService({ db, env }).storageMode, 'local');
  for (const options of [{ db: undefined }, { env: { ...env, MATERIALS_ENABLED: 'false' } }, { env: { ...env, PUBLIC_BASE_URL: 'http://public.example' } }, { env: { ...env, MATERIALS_SIGNING_KEY: 'short' } }]) {
    const service = createMaterialService({ db, env, ...options });
    assert.equal(service.ready(), false);
    assert.deepEqual(await service.showcase(), { ok: true, enabled: false, speakers: [], organisations: [] });
    await assert.rejects(service.me('example'), error => error.statusCode === 503);
  }
});

test('decodeImage accepts real images and rejects corrupt, mismatched, SVG and oversized files', async () => {
  assert.deepEqual(await decodeImage(await image(), 'image/png'), { width: 12, height: 10, format: 'png' });
  for (const [buffer, type] of [[Buffer.from('<svg/>'), 'image/svg+xml'], [Buffer.from('bad'), 'image/png'], [await image(), 'image/jpeg'], [Buffer.alloc(MAX_BYTES + 1), 'image/png'], [Buffer.alloc(0), 'image/png']]) {
    await assert.rejects(decodeImage(buffer, type), error => [400, 413].includes(error.statusCode));
  }
});

test('decodeImage refuses animated WebP, truncated JPEG and images exceeding 25 megapixels', async () => {
  const header = Buffer.from('47494638396101000100800000000000ffffff', 'hex');
  const frame = Buffer.from('21f904000a0000002c0000000001000100000202440100', 'hex');
  const second = Buffer.from(frame); second[second.length - 3] = 0x4c;
  const animated = await sharp(Buffer.concat([header, frame, second, Buffer.from([0x3b])]), { animated: true }).webp().toBuffer();
  const huge = await sharp({ create: { width: 5001, height: 5000, channels: 3, background: 'white' } }).png().toBuffer();
  const jpeg = await sharp(await image()).jpeg().toBuffer();
  for (const [buffer, type] of [[animated, 'image/webp'], [huge, 'image/png'], [jpeg.subarray(0, jpeg.length - 20), 'image/jpeg']]) await assert.rejects(decodeImage(buffer, type), error => error.statusCode === 400);
});

test('admin pagination normalizes non-finite and excessive input before querying SQL', async () => {
  const queries = [];
  const db = { transaction() {}, async query(sql, params) { queries.push(params); return sql.includes('COUNT(*)') ? [{ total: 0 }] : []; } };
  const service = createMaterialService({ db, env });
  const invalid = await service.adminPage({ page: 'Infinity', pageSize: 'Infinity' });
  assert.equal(invalid.page, 1);
  assert.equal(invalid.pageSize, 50);
  assert.deepEqual(queries[1].slice(-2), [50, 0]);
  const excessive = await service.adminPage({ page: Number.MAX_VALUE, pageSize: Number.MAX_VALUE });
  assert.equal(excessive.page, 1000000);
  assert.equal(excessive.pageSize, 100);
});
