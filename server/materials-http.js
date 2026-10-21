'use strict';

const crypto = require('node:crypto');
const Busboy = require('busboy');
const { MAX_BYTES } = require('./materials');
const { renderMaterialsPage, renderMaterialsAdminPage } = require('./materials-pages');
const error = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

function readImage(req) {
  if (Number(req.headers['content-length'] || 0) > MAX_BYTES + 65536) { req.resume(); return Promise.reject(error('Image exceeds 5 MiB', 413)); }
  return new Promise((resolve, reject) => {
    let parser;
    try { parser = Busboy({ headers: req.headers, limits: { fileSize: MAX_BYTES + 1, files: 1, fields: 0, parts: 2 } }); } catch (_) { req.resume(); reject(error('A multipart image upload is required')); return; }
    let file = null, problem = null, total = 0;
    const rejectFile = (message, code = 400) => { problem ||= error(message, code); };
    parser.on('file', (name, stream, info) => {
      if (name !== 'file') rejectFile('Use the file field for the image');
      const parts = [];
      stream.on('limit', () => rejectFile('Image exceeds 5 MiB', 413));
      stream.on('data', part => { if (!problem) parts.push(part); });
      stream.on('error', () => rejectFile('Incomplete image upload'));
      stream.on('end', () => { if (!problem) file = { buffer: Buffer.concat(parts), filename: info.filename, mimeType: info.mimeType }; });
    });
    parser.on('filesLimit', () => rejectFile('Upload exactly one image'));
    parser.on('fieldsLimit', () => rejectFile('Upload exactly one image'));
    parser.on('partsLimit', () => rejectFile('Upload exactly one image'));
    parser.on('field', () => rejectFile('Text fields are not accepted'));
    parser.on('error', () => { reject(error('Malformed multipart upload')); req.resume(); });
    req.on('data', chunk => { total += chunk.length; if (total > MAX_BYTES + 65536) { rejectFile('Upload exceeds maximum size', 413); req.unpipe(parser); parser.destroy(); req.resume(); reject(problem); } });
    req.on('aborted', () => reject(error('Upload interrupted')));
    req.on('error', () => reject(error('Upload interrupted')));
    parser.on('close', () => { if (problem) reject(problem); else if (!file) reject(error('Upload exactly one image')); else resolve(file); });
    req.pipe(parser);
  });
}

function createMaterialsHandler({ service, showcase, json, readBody, setSecurityHeaders, allowed, adminToken = '', logger = console }) {
  const buckets = new Map();
  function throttle(req, ref, action) {
    const now = Date.now(), key = [req.socket?.remoteAddress || '', ref, action].join('|');
    if (buckets.size > 2000) for (const [key, value] of buckets) if (value.reset < now) buckets.delete(key);
    let bucket = buckets.get(key);
    if (!bucket || bucket.reset < now) { bucket = { count: 0, reset: now + 600000 }; buckets.set(key, bucket); }
    if (++bucket.count > (action === 'resend' ? 5 : action === 'upload' ? 20 : 100)) throw error('Too many requests; please try again later', 429);
  }
  function headers(res) {
    setSecurityHeaders(res);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  }
  function adminAllowed(req, url, override) {
    if (typeof override === 'function') return !!override(req, url);
    if (typeof allowed === 'function') return !!allowed(req, url);
    const token = String(req.headers['x-admin-token'] || url.searchParams.get('token') || '');
    const a = Buffer.from(token), b = Buffer.from(adminToken);
    return b.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  async function auth(req, uploadOnly = false) {
    const ref = String(req.headers['x-registration-ref'] || '');
    const token = String(req.headers.authorization || '').match(/^Bearer ([^\s]+)$/i)?.[1] || '';
    if (!ref || !token) throw error('Use the link sent to your registered email', 401);
    const authContext = await service.authenticate(ref, token, { uploadOnly });
    throttle(req, ref, uploadOnly ? 'upload' : 'private');
    return { ref, authContext };
  }
  async function body(req) { try { return await readBody(req); } catch (_) { throw error('Invalid JSON request'); } }
  return async function handle(req, res, url, context = {}) {
    const path = url.pathname;
    const matches = path.startsWith('/api/admin/showcase/') || path === '/materials' || path === '/materials-admin' || path.startsWith('/api/materials/') || path === '/api/admin/materials' || path.startsWith('/api/admin/materials/') || path === '/api/public/showcase' || path.startsWith('/api/public/materials/') || path.startsWith('/api/public/media/');
    if (!matches) return false;
    try {
      headers(res);
      if (req.method === 'GET' && path === '/api/materials/config') { json(res, 200, { ok: true, enabled: service.ready() }); return true; }
      if (req.method === 'GET' && path === '/api/public/showcase') { json(res, 200, await service.showcase()); return true; }
      if (req.method === 'GET' && path === '/materials') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(renderMaterialsPage()); return true; }
      if (!service.ready()) throw error('Materials are not configured', 503);
      const isAdmin = path === '/materials-admin' || path.startsWith('/api/admin/materials') || path.startsWith('/api/admin/showcase/');
      if (isAdmin && !adminAllowed(req, url, context.allowed)) throw error('Unauthorised', 401);
      if (req.method === 'GET' && path === '/materials-admin') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(renderMaterialsAdminPage(adminToken || url.searchParams.get('token') || '', url.searchParams.get('ref') || '')); return true; }
      let match;
      if (path.startsWith('/api/admin/showcase/')) {
        match = path.match(/^\/api\/admin\/showcase\/(portrait|logo)\/uploads(?:\/([0-9a-f-]{36})\/preview)?$/i);
        if (match && showcase) {
          if (req.method === 'POST' && !match[2]) {
            throttle(req, 'showcase-' + match[1], 'upload');
            json(res, 200, { ok: true, ...await showcase.upload(match[1], await readImage(req)) });
          } else if (req.method === 'GET' && match[2]) {
            const data = await showcase.preview(match[1], match[2]);
            res.writeHead(200, { 'Content-Type': data.mimeType, 'Content-Length': data.buffer.length }); res.end(data.buffer);
          } else throw error('Method not allowed', 405);
          return true;
        }
        match = path.match(/^\/api\/admin\/showcase\/(portrait|logo)(?:\/(candidates))?$/);
        if (!match || !showcase) throw error('Route not found', 404);
        const kind = match[1];
        let result;
        if (req.method === 'GET' && match[2] === 'candidates') result = await showcase.candidates(kind, Object.fromEntries(url.searchParams));
        else if (req.method === 'GET' && !match[2]) result = await showcase.board(kind);
        else if (req.method === 'PUT' && !match[2]) result = await showcase.save(kind, await body(req));
        else throw error('Method not allowed', 405);
        json(res, 200, { ok: true, ...result }); return true;
      }
      if (req.method === 'GET' && ((match = path.match(/^\/api\/public\/materials\/([^/]+)\/(portrait|logo)$/)) || (match = path.match(/^\/api\/public\/media\/([^/]+)\/([0-9]+)$/)))) {
        const data = path.startsWith('/api/public/media/') ? await service.publicMedia(decodeURIComponent(match[1]), Number(match[2])) : await service.publicImage(decodeURIComponent(match[1]), match[2], Number(url.searchParams.get('version')));
        res.writeHead(200, { 'Content-Type': data.mimeType, 'Cache-Control': 'no-store', 'Content-Length': data.buffer.length }); res.end(data.buffer); return true;
      }
      if (isAdmin) {
        if (path === '/api/admin/materials' && req.method === 'GET') { json(res, 200, { ok: true, ...(service.adminPage ? await service.adminPage(Object.fromEntries(url.searchParams)) : {rows: await service.adminList(url.searchParams.get('ref') || '')}) }); return true; }
        match = path.match(/^\/api\/admin\/materials\/([^/]+)\/(review|config|owner|resend|unpublish|preview\/(card|portrait|logo))$/);
        if (!match) throw error('Route not found', 404);
        const ref = decodeURIComponent(match[1]), action = match[2];
        if (action.startsWith('preview/') && req.method === 'GET') { const data = await service.preview(ref, match[3], { published: url.searchParams.get('published') === 'true', versionId: url.searchParams.get('versionId') || undefined, fit: url.searchParams.get('fit') || undefined }); res.writeHead(200, { 'Content-Type': data.mimeType }); res.end(data.buffer); return true; }
        let result;
        if (action === 'review' && req.method === 'POST') result = await service.review(ref, await body(req));
        else if (action === 'config' && req.method === 'PUT') result = await service.configure(ref, await body(req));
        else if (action === 'owner' && req.method === 'PUT') result = await service.setOwner(ref, await body(req));
        else if (action === 'unpublish' && req.method === 'POST') result = await service.unpublish(ref, (await body(req)).kind);
        else if (action === 'resend' && req.method === 'POST') { throttle(req, ref, 'resend'); result = await service.resend(ref); }
        else throw error('Method not allowed', 405);
        json(res, 200, { ok: true, ...result }); return true;
      }
      if (req.method === 'POST' && (match = path.match(/^\/api\/materials\/upload\/(card|portrait|logo)$/))) {
        const { ref, authContext } = await auth(req, true), file = await readImage(req);
        json(res, 200, { ok: true, ...await service.upload(ref, match[1], {...file,...(req.headers['idempotency-key']?{idempotencyKey:req.headers['idempotency-key']}:{})}, authContext) }); return true;
      }
      const { ref, authContext } = await auth(req);
      if (path === '/api/materials/me' && req.method === 'GET') json(res, 200, { ok: true, ...await service.me(ref, authContext) });
      else if (path === '/api/materials/consents' && req.method === 'PUT') json(res, 200, { ok: true, ...await service.setConsents(ref, await body(req), authContext) });
      else if (req.method === 'DELETE' && (match = path.match(/^\/api\/materials\/(card|portrait|logo)$/))) json(res, 200, { ok: true, ...await service.remove(ref, match[1], authContext) });
      else if (req.method === 'GET' && (match = path.match(/^\/api\/materials\/preview\/(card|portrait|logo)$/))) { const data = await service.preview(ref, match[1], {authContext, fit: 'contain'}); res.writeHead(200, { 'Content-Type': data.mimeType }); res.end(data.buffer); }
      else throw error('Route not found', 404);
    } catch (problem) {
      const storageError = ['MATERIALS_STORAGE_PERMISSION_REQUIRED', 'MATERIALS_STORAGE_UNAVAILABLE'].includes(problem.code);
      if (!problem.statusCode || problem.statusCode >= 500) logger.error('[materials] operation failed', JSON.stringify({
        operation: path.replace(/^(\/api\/admin\/materials)\/[^/]+/, '$1/:ref').replace(/^(\/api\/public\/(?:materials|media))\/[^/]+/, '$1/:id'),
        code: storageError ? problem.code : 'MATERIALS_UNAVAILABLE',
        feishuCode: problem.feishuCode,
        upstreamStatus: problem.upstreamStatus,
        cause: problem.cause?.code
      }));
      if (!res.headersSent) json(res, problem.statusCode || 503, { ok: false, error: problem.statusCode ? problem.message : 'Materials service temporarily unavailable', ...(problem.statusCode && /^[A-Z][A-Z0-9_]+$/.test(problem.code || '') ? { code: problem.code } : {}), ...(storageError ? { retryable: problem.retryable === true } : {}) });
      else if (!res.writableEnded) res.end();
    }
    return true;
  };
}
module.exports = { createMaterialsHandler, readImage };
