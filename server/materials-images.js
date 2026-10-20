'use strict';
const sharp = require('sharp');
const { cropRect } = require('../assets/image-crop');
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PIXELS = 25 * 1000 * 1000;
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

async function decodeImage(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw fail('An image file is required');
  if (buffer.length > MAX_BYTES) throw fail('Image exceeds 5 MiB', 413);
  const formats = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
  if (!formats[mimeType]) throw fail('Only JPG, PNG and WebP images are accepted');
  try {
    const pipeline = sharp(buffer, { failOn: 'warning', limitInputPixels: MAX_PIXELS, animated: true });
    const metadata = await pipeline.metadata();
    if (metadata.format !== formats[mimeType] || (metadata.pages || 1) !== 1 || !metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PIXELS) throw fail('Image must be a static JPG, PNG or WebP within 25 megapixels');
    // Complete decoding detects truncated/corrupt images; sharp strips metadata by default.
    await pipeline.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp().toBuffer();
    return { width: metadata.width, height: metadata.height, format: metadata.format };
  } catch (error) {
    if (error.statusCode) throw error;
    throw fail('Image is corrupt or exceeds 25 megapixels');
  }
}

async function derivative(buffer, kind, crop) {
  await decodeImage(buffer, (() => {
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
    if (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
    return 'image/webp';
  })());
  let image = sharp(buffer, { failOn: 'warning', limitInputPixels: MAX_PIXELS }).rotate();
  if (kind === 'portrait' || kind === 'logo') {
    const oriented = await image.toBuffer({ resolveWithObject: true });
    const area = cropRect(oriented.info.width, oriented.info.height, kind, crop);
    const width = Math.max(1, Math.min(oriented.info.width, Math.round(area.width))), height = Math.max(1, Math.min(oriented.info.height, Math.round(area.height)));
    image = sharp(oriented.data).extract({ left: Math.max(0, Math.min(oriented.info.width-width, Math.round(area.left))), top: Math.max(0, Math.min(oriented.info.height-height, Math.round(area.top))), width, height }).resize(kind === 'portrait' ? 500 : 840, kind === 'portrait' ? 600 : 420, { fit: 'fill' });
  } else image = image.resize({ width: kind === 'card' ? 1200 : 640, height: kind === 'card' ? 1200 : 360, fit: 'inside', withoutEnlargement: true });
  return { buffer: await image.webp({ quality: 85 }).toBuffer(), mimeType: 'image/webp' };
}

module.exports = { decodeImage, derivative, MAX_BYTES, MAX_PIXELS };
