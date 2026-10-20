'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

// Only call after checking current publication rights. This is a disposable byte cache,
// never an authority for deciding whether an image may be served.
function createImageCache(directory) {
  const pending = new Map();
  return async function get(key, build) {
    const name = crypto.createHash('sha256').update(key).digest('hex');
    if (pending.has(name)) return pending.get(name);
    const operation = (async () => {
      const file = path.join(directory, name + '.webp');
      try {
        const stat = await fs.stat(file);
        if (stat.isFile() && stat.size > 0 && stat.size <= 5 * 1024 * 1024) return { buffer: await fs.readFile(file), mimeType: 'image/webp' };
      } catch (_) {}
      const result = await build();
      const temp = file + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
      try {
        await fs.mkdir(directory, { recursive: true, mode: 0o700 });
        await fs.writeFile(temp, result.buffer, { mode: 0o600, flag: 'wx' });
        await fs.rename(temp, file);
      } catch (_) { await fs.unlink(temp).catch(() => {}); }
      return result;
    })();
    pending.set(name, operation);
    try { return await operation; } finally { pending.delete(name); }
  };
}
module.exports = { createImageCache };
