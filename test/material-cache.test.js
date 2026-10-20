'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('display cache is reproducible and never uses source filenames as paths', async () => {
  const { createImageCache } = require('../server/materials-image-cache');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lpclub-material-cache-'));
  try {
    const get = createImageCache(dir); let builds = 0;
    const build = async () => { builds++; return { buffer: Buffer.from('derivative'), mimeType: 'image/webp' }; };
    assert.equal((await get('../private-file-token', build)).buffer.toString(), 'derivative');
    assert.equal((await get('../private-file-token', build)).buffer.toString(), 'derivative');
    assert.equal(builds, 1);
    assert.ok((await fs.readdir(dir)).every(name => /^[a-f0-9]{64}\.webp$/.test(name)));
    await fs.rm(dir, { recursive: true });
    assert.equal((await get('../private-file-token', build)).buffer.toString(), 'derivative');
    assert.equal(builds, 2);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('unavailable cache storage does not prevent generating an authorised display image', async () => {
  const { createImageCache } = require('../server/materials-image-cache');
  const get = createImageCache('/dev/null/cache');
  const image = await get('source', async () => ({ buffer: Buffer.from('image'), mimeType: 'image/webp' }));
  assert.equal(image.buffer.toString(), 'image');
});
