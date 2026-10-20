'use strict';
const crypto = require('node:crypto');

function error(code, message, statusCode = 400) { return Object.assign(new Error(message), { code, statusCode }); }
function text(raw, max) { return String(raw == null ? '' : raw).trim().slice(0, max); }
function normalizeCode(raw) {
  if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > 128) throw error('INVALID_VIP_CODE', 'Invalid VIP Code. Please check your code.');
  return raw.trim().toUpperCase();
}
function codeHash(raw) { return crypto.createHash('sha256').update(normalizeCode(raw)).digest('hex'); }
function expiry(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(raw) || !Number.isFinite(Date.parse(raw)) || Date.parse(raw) <= Date.now()) throw error('INVALID_EXPIRY', '有效期必须是带时区的未来时间。');
  return sqlDate(raw);
}
function sqlDate(raw) { return new Date(raw).toISOString().slice(0, 23).replace('T', ' '); }
function iso(raw) { return raw ? new Date(/[zZ]|[+-]\d\d:\d\d$/.test(String(raw)) ? raw : String(raw).replace(' ', 'T') + 'Z').toISOString() : null; }
function validateIds(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 200 || ids.some(id => typeof id !== 'string' || !id)) throw error('INVALID_IDS', '请选择 1–200 个兑换码。');
  return [...new Set(ids)].sort();
}
const DISPLAY_STATUS = "CASE WHEN status='available' AND expires_at IS NOT NULL AND expires_at<=UTC_TIMESTAMP(3) THEN 'expired' ELSE status END";

function createMysqlVipStore(db, env = process.env) {
  const configured = env.VIP_CODE_ENCRYPTION_KEY;
  const key = typeof configured === 'string' ? Buffer.from(configured, 'base64') : Buffer.alloc(0);
  if (key.length !== 32 || key.toString('base64') !== configured) throw error('VIP_STORAGE_UNAVAILABLE', 'VIP storage is not configured. Please contact LP CLUB.', 503);
  let keyReady;
  async function ensureKey(conn = db) {
    if (conn !== db) {
      // Never acquire another pool connection while holding a transaction connection.
      const verifier = crypto.createHash('sha256').update(key).digest('hex');
      const rows = await conn.query("SELECT meta_value FROM vip_meta WHERE meta_key='key_verifier'");
      if (rows.length) { if (rows[0].meta_value !== verifier) throw error('VIP_STORAGE_UNAVAILABLE', 'VIP encryption key does not match.', 503); return; }
      await conn.query("INSERT IGNORE INTO vip_meta(meta_key,meta_value) VALUES ('key_verifier',?)", [verifier]);
      const saved = await conn.query("SELECT meta_value FROM vip_meta WHERE meta_key='key_verifier' FOR UPDATE");
      if (saved[0]?.meta_value !== verifier) throw error('VIP_STORAGE_UNAVAILABLE', 'VIP encryption key does not match.', 503);
      return;
    }
    if (!keyReady) {
      keyReady = (async () => {
        const verifier = crypto.createHash('sha256').update(key).digest('hex');
        await db.query("INSERT IGNORE INTO vip_meta(meta_key,meta_value) VALUES ('key_verifier',?)", [verifier]);
        const rows = await db.query("SELECT meta_value FROM vip_meta WHERE meta_key='key_verifier'");
        if (rows[0]?.meta_value !== verifier) throw error('VIP_STORAGE_UNAVAILABLE', 'VIP encryption key does not match.', 503);
      })().catch(cause => { keyReady = null; throw cause; });
    }
    return keyReady;
  }
  function encrypt(code) {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const value = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), value]).toString('base64');
  }
  function decrypt(encoded) {
    try {
      const bytes = Buffer.from(encoded, 'base64'), cipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      cipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8');
    } catch (_) { throw error('VIP_STORAGE_UNAVAILABLE', 'VIP code could not be decrypted.', 503); }
  }
  function display(row) {
    const expiresAt = iso(row.expires_at);
    return { id: row.id, maskedCode: 'VIP-••••-' + row.last4, batchName: row.batch_name,
      status: row.status === 'available' && expiresAt && Date.parse(expiresAt) <= Date.now() ? 'expired' : row.status,
      expiresAt, recipientName: row.recipient_name, recipientEmail: row.recipient_email,
      distributedAt: iso(row.distributed_at), note: row.note, createdAt: iso(row.created_at),
      usedAt: iso(row.used_at), usedName: row.used_name, usedEmail: row.used_email, registrationRef: row.registration_ref };
  }
  async function row(conn, id, lock = false) {
    const rows = await conn.query('SELECT * FROM vip_codes WHERE id=?' + (lock ? ' FOR UPDATE' : ''), [id]);
    if (!rows.length) throw error('VIP_NOT_FOUND', '兑换码不存在。', 404);
    return rows[0];
  }
  async function audit(conn, id, action, message, registrationId = null) {
    await conn.query('INSERT INTO audit_events(vip_code_id,registration_id,action,actor,detail) VALUES (?,?,?,?,?)', [id, registrationId, action, registrationId ? 'registrant' : 'admin', JSON.stringify({ message: text(message, 1000) })]);
  }
  function ensureAvailable(item) {
    if (item.status === 'used') throw error('VIP_USED', 'This VIP Code has already been used.', 409);
    if (item.status === 'revoked') throw error('VIP_REVOKED', 'This VIP Code has been revoked.');
    if (item.expires_at && Date.parse(iso(item.expires_at)) <= Date.now()) throw error('VIP_EXPIRED', 'This VIP Code has expired.');
  }
  async function previewCode(code, conn = db) {
    await ensureKey(conn);
    const rows = await conn.query('SELECT * FROM vip_codes WHERE code_hash=?', [codeHash(code)]);
    if (!rows.length) throw error('INVALID_VIP_CODE', 'Invalid VIP Code. Please check your code.');
    ensureAvailable(rows[0]);
    return display(rows[0]);
  }
  async function generate(input = {}) {
    const { count } = input;
    if (!Number.isInteger(count) || count < 1 || count > 200) throw error('INVALID_COUNT', '每次生成数量须为 1–200。');
    const expiresAt = expiry(input.expiresAt), batchName = text(input.batchName, 120);
    await ensureKey();
    return db.transaction(async conn => {
      const items = [];
      for (let n = 0; n < count; n++) {
        const code = 'VIP-' + crypto.randomBytes(16).toString('hex').toUpperCase(), id = crypto.randomUUID();
        await conn.query('INSERT INTO vip_codes(id,code_hash,cipher,last4,batch_name,expires_at) VALUES (?,?,?,?,?,?)', [id, codeHash(code), encrypt(code), code.slice(-4), batchName, expiresAt]);
        await audit(conn, id, 'generated', batchName);
        items.push(display(await row(conn, id)));
      }
      return items;
    });
  }
  async function list({ q = '', status = '', page = 1, pageSize = 50 } = {}) {
    await ensureKey();
    page = Math.max(1, Math.min(1000000, Math.floor(Number(page) || 1)));
    pageSize = Math.max(1, Math.min(100, Math.floor(Number(pageSize) || 50)));
    const stats = Object.fromEntries((await db.query('SELECT ' + DISPLAY_STATUS + ' AS display_status,COUNT(*) AS count FROM vip_codes GROUP BY display_status')).map(item => [item.display_status, Number(item.count)]));
    const predicates = [], params = [], query = text(q, 128);
    if (query) {
      const columns = ['last4','batch_name','recipient_name','recipient_email','note','registration_ref','used_name','used_email'];
      const like = '%' + query.replace(/[!%_]/g, value => '!' + value) + '%';
      predicates.push('(' + columns.map(column => column + " LIKE ? ESCAPE '!'").join(' OR ') + ' OR code_hash=?)');
      params.push(...columns.map(() => like), codeHash(query));
    }
    if (status) { predicates.push('(' + DISPLAY_STATUS + ')=?'); params.push(status); }
    const where = predicates.length ? ' WHERE ' + predicates.join(' AND ') : '';
    const count = await db.query('SELECT COUNT(*) AS total FROM vip_codes' + where, params);
    const items = await db.query('SELECT * FROM vip_codes' + where + ' ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?', [...params, pageSize, (page - 1) * pageSize]);
    return { items: items.map(display), total: Number(count[0].total), page, pageSize, stats };
  }
  async function detail(id) {
    await ensureKey();
    const item = await row(db, id);
    const events = await db.query('SELECT action,created_at,detail FROM audit_events WHERE vip_code_id=? ORDER BY id DESC', [id]);
    return { item: { ...display(item), code: decrypt(item.cipher) }, events: events.map(event => ({ action: event.action, at: iso(event.created_at), detail: (typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail)?.message || '' })) };
  }
  async function update(id, input = {}) {
    await ensureKey();
    return db.transaction(async conn => {
      const item = await row(conn, id, true);
      if (item.status !== 'available') throw error('VIP_NOT_EDITABLE', '只有未使用兑换码可以编辑。', 409);
      const changes = { recipient_name: item.recipient_name, recipient_email: item.recipient_email, distributed_at: item.distributed_at, note: item.note, expires_at: item.expires_at };
      if ('recipientName' in input) changes.recipient_name = text(input.recipientName, 120);
      if ('recipientEmail' in input) {
        changes.recipient_email = text(input.recipientEmail, 180).toLowerCase();
        if (changes.recipient_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(changes.recipient_email)) throw error('INVALID_EMAIL', '分发邮箱格式无效。');
      }
      if ('note' in input) changes.note = text(input.note, 500);
      if ('expiresAt' in input) changes.expires_at = expiry(input.expiresAt);
      if ('distributedAt' in input) {
        if (input.distributedAt != null && input.distributedAt !== '' && (!/(Z|[+-]\d{2}:\d{2})$/.test(input.distributedAt) || !Number.isFinite(Date.parse(input.distributedAt)))) throw error('INVALID_DATE', '分发时间无效。');
        changes.distributed_at = input.distributedAt ? sqlDate(input.distributedAt) : null;
      }
      await conn.query('UPDATE vip_codes SET recipient_name=?,recipient_email=?,distributed_at=?,note=?,expires_at=? WHERE id=?', [...Object.values(changes), id]);
      await audit(conn, id, 'updated', changes.distributed_at ? '人工分发信息已登记' : '信息已更新');
      return display(await row(conn, id));
    });
  }
  async function revoke({ ids, reason = '' } = {}) {
    const selected = validateIds(ids);
    await ensureKey();
    return db.transaction(async conn => {
      let revoked = 0;
      const skipped = [];
      for (const id of selected) {
        const rows = await conn.query('SELECT * FROM vip_codes WHERE id=? FOR UPDATE', [id]);
        if (!rows.length || rows[0].status !== 'available') { skipped.push({ id, reason: '不存在或非未使用状态' }); continue; }
        await conn.query("UPDATE vip_codes SET status='revoked' WHERE id=?", [id]);
        await audit(conn, id, 'revoked', reason);
        revoked++;
      }
      return { revoked, skipped };
    });
  }
  async function exportCodes(ids) {
    const selected = validateIds(ids);
    await ensureKey();
    return db.transaction(async conn => {
      const items = [];
      for (const id of selected) {
        const item = await row(conn, id, true);
        if (display(item).status !== 'available') continue;
        items.push({ ...display(item), code: decrypt(item.cipher) });
        await audit(conn, id, 'exported', '导出供人工分发');
      }
      if (!items.length) throw error('VIP_NOT_AVAILABLE', '所选码均不可用，无法导出。', 409);
      return items;
    });
  }
  async function redeem(conn, code, registration, requestKey) {
    if (!conn || typeof conn.query !== 'function') throw new TypeError('A transaction connection is required.');
    if (typeof requestKey !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(requestKey)) throw error('INVALID_IDEMPOTENCY_KEY', 'Please retry this registration from the website.');
    await ensureKey(conn);
    const rows = await conn.query('SELECT * FROM vip_codes WHERE code_hash=? FOR UPDATE', [codeHash(code)]);
    if (!rows.length) throw error('INVALID_VIP_CODE', 'Invalid VIP Code. Please check your code.');
    const item = rows[0];
    const prior = await conn.query('SELECT * FROM vip_redemptions WHERE code_id=? FOR UPDATE', [item.id]);
    if (prior.length && prior[0].request_key === requestKey && prior[0].registration_id === registration.id) return display(item);
    ensureAvailable(item);
    const conflicts = await conn.query('SELECT id FROM vip_redemptions WHERE request_key=? OR registration_id=?', [requestKey, registration.id]);
    if (conflicts.length) throw error('IDEMPOTENCY_CONFLICT', 'This submission has changed. Please start a new registration.', 409);
    try {
      await conn.query('INSERT INTO vip_redemptions(id,code_id,registration_id,request_key) VALUES (?,?,?,?)', [crypto.randomUUID(), item.id, registration.id, requestKey]);
    } catch (cause) {
      if (cause.code === 'ER_DUP_ENTRY') throw error('IDEMPOTENCY_CONFLICT', 'This submission has changed. Please start a new registration.', 409);
      throw cause;
    }
    const name = text(registration.fullName || registration.full_name || registration.attendee?.fullName, 255);
    await conn.query("UPDATE vip_codes SET status='used',used_at=UTC_TIMESTAMP(3),used_name=?,used_email=?,registration_ref=? WHERE id=?", [name, registration.email || registration.attendee?.email || '', registration.ref || '', item.id]);
    await audit(conn, item.id, 'used', registration.ref, registration.id);
    return display(await row(conn, item.id));
  }
  return { list, generate, detail, update, revoke, export: exportCodes, previewCode, preview: previewCode, redeem };
}
module.exports = { createMysqlVipStore, normalizeCode, codeHash };
