'use strict';

const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const MAX_BYTES = 5 * 1024 * 1024;

function unavailable(cause) {
  return Object.assign(new Error('File storage is temporarily unavailable. Please retry later.', { cause }), {
    code: 'MATERIALS_STORAGE_UNAVAILABLE', statusCode: 503, retryable: false
  });
}

// Originals are durable private data. Never expose this directory as static files
// or clean it with the disposable display cache.
function createFileStore(directory) {
  const root = path.resolve(directory);
  function filename(source) {
    if (source?.storage !== 'local' || !/^[a-f0-9]{64}$/.test(source.key)) throw Object.assign(new Error('Image not found'), { statusCode: 404 });
    return path.join(root, source.key + '.bin');
  }
  async function write(buffer, name, mimeType) {
    if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_BYTES) throw Object.assign(new Error('Image exceeds the storage size limit'), { statusCode: 413 });
    const source = { storage: 'local', key: crypto.randomBytes(32).toString('hex'), name, type: mimeType, size: buffer.length };
    const target = filename(source), temporary = target + '.tmp';
    let handle;
    try {
      await fs.mkdir(root, { recursive: true, mode: 0o700 });
      handle = await fs.open(temporary, 'wx', 0o600);
      await handle.writeFile(buffer);
      await handle.sync();
      await handle.close(); handle = null;
      await fs.rename(temporary, target);
      const directoryHandle = await fs.open(root, constants.O_RDONLY);
      try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
      return source;
    } catch (error) {
      await handle?.close().catch(() => {});
      await fs.unlink(temporary).catch(() => {});
      throw unavailable(error);
    }
  }
  async function read(source) {
    const target = filename(source);
    let handle;
    try {
      handle = await fs.open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = await handle.stat();
      if (!stat.isFile() || !stat.size || stat.size > MAX_BYTES) throw new Error('Invalid original file');
      const buffer = await handle.readFile();
      if (!buffer.length || buffer.length > MAX_BYTES) throw new Error('Invalid original file');
      return buffer;
    } catch (error) { throw unavailable(error); }
    finally { await handle?.close().catch(() => {}); }
  }
  return { write, read };
}

module.exports = { createFileStore };
