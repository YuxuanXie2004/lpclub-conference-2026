'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lpclub-originals-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const { createFileStore } = require('../server/materials-file-store');
  return { directory, store: createFileStore(directory) };
}

test('server originals persist across restarts with private permissions and opaque filenames', async t => {
  const { directory, store } = await fixture(t);
  const original = Buffer.from('original image');
  const ref = await store.write(original, '../../private.png', 'image/png');
  assert.equal(ref.storage, 'local');
  assert.match(ref.key, /^[a-f0-9]{64}$/);
  assert.equal((await store.read(ref)).equals(original), true);
  const restarted = require('../server/materials-file-store').createFileStore(directory);
  assert.equal((await restarted.read(ref)).equals(original), true);
  const names = await fs.readdir(directory);
  assert.deepEqual(names, [ref.key + '.bin']);
  assert.equal((await fs.stat(path.join(directory, names[0]))).mode & 0o777, 0o600);
  const next = await store.write(Buffer.from('new image'), 'same.png', 'image/png');
  assert.notEqual(ref.key, next.key);
  assert.equal((await store.read(ref)).equals(original), true);
});

test('server originals reject path traversal, symlinks and oversized reads', async t => {
  const { directory, store } = await fixture(t);
  for (const key of ['../private', '/etc/passwd', 'x'.repeat(64), 'a'.repeat(64) + '/../../']) await assert.rejects(store.read({ storage: 'local', key }));
  const ref = await store.write(Buffer.from('image'), 'image.png', 'image/png');
  await fs.unlink(path.join(directory, ref.key + '.bin'));
  await fs.symlink('/etc/hosts', path.join(directory, ref.key + '.bin'));
  await assert.rejects(store.read(ref));
  await fs.unlink(path.join(directory, ref.key + '.bin'));
  await fs.writeFile(path.join(directory, ref.key + '.bin'), Buffer.alloc(5 * 1024 * 1024 + 1));
  await assert.rejects(store.read(ref));
  await assert.rejects(store.write(Buffer.alloc(5 * 1024 * 1024 + 1), 'huge.png', 'image/png'));
});

test('unwritable original storage fails clearly without claiming upload success', async () => {
  const store = require('../server/materials-file-store').createFileStore('/dev/null/originals');
  await assert.rejects(store.write(Buffer.from('image'), 'image.png', 'image/png'), error => error.code === 'MATERIALS_STORAGE_UNAVAILABLE' && error.statusCode === 503);
});
