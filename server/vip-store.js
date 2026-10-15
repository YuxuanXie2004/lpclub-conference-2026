'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

function error(code, message, statusCode = 400) { return Object.assign(new Error(message), { code, statusCode }); }
function normalizeCode(raw) {
  if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > 128) throw error('INVALID_VIP_CODE', 'Invalid VIP Code. Please check your code.');
  return raw.trim().toUpperCase();
}
function codeHash(raw) { return crypto.createHash('sha256').update(normalizeCode(raw)).digest('hex'); }
function expiry(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(raw) || !Number.isFinite(Date.parse(raw)) || Date.parse(raw) <= Date.now()) throw error('INVALID_EXPIRY', '有效期必须是带时区的未来时间。');
  return new Date(raw).toISOString();
}
function text(raw, max) { return String(raw == null ? '' : raw).trim().slice(0, max); }

class VipStore {
  constructor({ filename, key }) {
    const bytes = typeof key === 'string' ? Buffer.from(key, 'base64') : Buffer.alloc(0);
    if (bytes.length !== 32 || bytes.toString('base64') !== key) throw error('VIP_STORAGE_UNAVAILABLE', 'VIP storage is not configured. Please contact LP CLUB.', 503);
    this.key = bytes;
    try {
      if (filename !== ':memory:') {
        filename = path.resolve(filename);
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        fs.closeSync(fs.openSync(filename, 'a', 0o600));
        fs.chmodSync(filename, 0o600);
      }
      this.db = new Database(filename);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = FULL');
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('busy_timeout = 5000');
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS vip_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS vip_codes (
          id TEXT PRIMARY KEY, code_hash TEXT UNIQUE NOT NULL, cipher TEXT NOT NULL, last4 TEXT NOT NULL,
          batch_name TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('available','redeeming','review','used','revoked')),
          expires_at TEXT, recipient_name TEXT NOT NULL DEFAULT '', recipient_email TEXT NOT NULL DEFAULT '',
          distributed_at TEXT, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
          used_at TEXT, used_name TEXT NOT NULL DEFAULT '', used_email TEXT NOT NULL DEFAULT '', registration_ref TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS vip_attempts (
          id TEXT PRIMARY KEY, code_id TEXT NOT NULL REFERENCES vip_codes(id), request_hash TEXT NOT NULL,
          email TEXT NOT NULL, package_id TEXT NOT NULL, registration_ref TEXT UNIQUE NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('redeeming','review','used','failed','revoked')),
          created_at TEXT NOT NULL, record_id TEXT, result_json TEXT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS vip_code_inflight ON vip_attempts(code_id) WHERE status IN ('redeeming','review','used');
        CREATE UNIQUE INDEX IF NOT EXISTS vip_email_inflight ON vip_attempts(email) WHERE status IN ('redeeming','review');
        CREATE TABLE IF NOT EXISTS vip_events (
          id INTEGER PRIMARY KEY, code_id TEXT NOT NULL REFERENCES vip_codes(id), action TEXT NOT NULL, at TEXT NOT NULL, detail TEXT NOT NULL
        );
      `);
      const verifier = crypto.createHash('sha256').update(bytes).digest('hex');
      this.db.transaction(() => {
        const existing = this.db.prepare("SELECT value FROM vip_meta WHERE key='key_verifier'").get();
        if (existing && existing.value !== verifier) throw new Error('Encryption key does not match');
        this.db.prepare("INSERT OR IGNORE INTO vip_meta VALUES ('key_verifier',?)").run(verifier);
        // Add the name only after verifying the key; keep existing codes and statuses intact.
        if(!this.db.pragma('table_info(vip_codes)').some(column=>column.name==='used_name'))this.db.exec("ALTER TABLE vip_codes ADD COLUMN used_name TEXT NOT NULL DEFAULT ''");
      }).immediate();
    } catch (e) {
      if (this.db) this.db.close();
      throw error('VIP_STORAGE_UNAVAILABLE', 'VIP storage is unavailable. Please contact LP CLUB.', 503);
    }
  }
  close() { this.db.close(); }
  event(id, action, detail = '') { this.db.prepare('INSERT INTO vip_events(code_id,action,at,detail) VALUES (?,?,?,?)').run(id, action, new Date().toISOString(), text(detail, 1000)); }
  encrypt(code) {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const value = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), value]).toString('base64');
  }
  decrypt(ciphertext) {
    const bytes = Buffer.from(ciphertext, 'base64'), cipher = crypto.createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, 12));
    cipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8');
  }
  row(id) { const row = this.db.prepare('SELECT * FROM vip_codes WHERE id=?').get(id); if (!row) throw error('VIP_NOT_FOUND', '兑换码不存在。', 404); return row; }
  display(row) {
    return { id: row.id, maskedCode: 'VIP-••••-' + row.last4, batchName: row.batch_name,
      status: row.status === 'available' && row.expires_at && Date.parse(row.expires_at) <= Date.now() ? 'expired' : row.status,
      expiresAt: row.expires_at, recipientName: row.recipient_name, recipientEmail: row.recipient_email,
      distributedAt: row.distributed_at, note: row.note, createdAt: row.created_at,
      usedAt: row.used_at, usedName: row.used_name, usedEmail: row.used_email, registrationRef: row.registration_ref };
  }
  ensureAvailable(row) {
    if (row.status === 'used') throw error('VIP_USED', 'This VIP Code has already been used.', 409);
    if (row.status === 'revoked') throw error('VIP_REVOKED', 'This VIP Code has been revoked.');
    if (row.status !== 'available') throw error('VIP_PROCESSING', 'This VIP Code is being processed. Please contact LP CLUB.', 409);
    if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) throw error('VIP_EXPIRED', 'This VIP Code has expired.');
  }
  preview(raw) {
    const row = this.db.prepare('SELECT * FROM vip_codes WHERE code_hash=?').get(codeHash(raw));
    if (!row) throw error('INVALID_VIP_CODE', 'Invalid VIP Code. Please check your code.');
    this.ensureAvailable(row); return this.display(row);
  }
  generate(input = {}) {
    const count = input.count;
    if (!Number.isInteger(count) || count < 1 || count > 200) throw error('INVALID_COUNT', '每次生成数量须为 1–200。');
    const expiresAt = expiry(input.expiresAt), batchName = text(input.batchName, 120), createdAt = new Date().toISOString();
    return this.db.transaction(() => {
      const items = [];
      for (let i=0; i<count; i++) {
        const code = 'VIP-' + crypto.randomBytes(16).toString('hex').toUpperCase(), id = crypto.randomUUID();
        this.db.prepare("INSERT INTO vip_codes(id,code_hash,cipher,last4,batch_name,status,expires_at,created_at) VALUES (?,?,?,?,?,'available',?,?)").run(id,codeHash(code),this.encrypt(code),code.slice(-4),batchName,expiresAt,createdAt);
        this.event(id, 'generated', batchName); items.push(this.display(this.row(id)));
      }
      return items;
    }).immediate();
  }
  list({q='',status='',page=1,pageSize=50} = {}) {
    page = Math.max(1, Math.floor(Number(page)||1)); pageSize = Math.max(1, Math.min(100, Math.floor(Number(pageSize)||50)));
    let rows = this.db.prepare('SELECT * FROM vip_codes ORDER BY created_at DESC,id DESC').all().map(r=>this.display(r));
    const stats = {};
    for (const row of rows) stats[row.status] = (stats[row.status]||0)+1;
    const query = text(q,128).toLowerCase();
    if (query) {
      let hash; try { hash=codeHash(q); } catch (_) {}
      const exact = hash && this.db.prepare('SELECT id FROM vip_codes WHERE code_hash=?').get(hash);
      rows=rows.filter(r=>r.id===(exact&&exact.id)||[r.maskedCode,r.batchName,r.recipientName,r.recipientEmail,r.note,r.registrationRef,r.usedName,r.usedEmail].join(' ').toLowerCase().includes(query));
    }
    if (status) rows=rows.filter(r=>r.status===status);
    return {items:rows.slice((page-1)*pageSize,page*pageSize),total:rows.length,page,pageSize,stats};
  }
  detail(id) {
    const row = this.row(id);
    return {item:{...this.display(row),code:this.decrypt(row.cipher)},events:this.db.prepare('SELECT action,at,detail FROM vip_events WHERE code_id=? ORDER BY id DESC').all(id)};
  }
  update(id,input) {
    return this.db.transaction(() => {
      const row = this.row(id);
      if (row.status !== 'available') throw error('VIP_NOT_EDITABLE', '只有未使用兑换码可以编辑。',409);
      const changes = {recipient_name:row.recipient_name,recipient_email:row.recipient_email,distributed_at:row.distributed_at,note:row.note,expires_at:row.expires_at};
      if ('recipientName' in input) changes.recipient_name=text(input.recipientName,120);
      if ('recipientEmail' in input) {
        changes.recipient_email=text(input.recipientEmail,180).toLowerCase();
        if (changes.recipient_email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(changes.recipient_email)) throw error('INVALID_EMAIL','分发邮箱格式无效。');
      }
      if ('note' in input) changes.note=text(input.note,500);
      if ('expiresAt' in input) changes.expires_at=expiry(input.expiresAt);
      if ('distributedAt' in input) {
        if (input.distributedAt!=null&&!Number.isFinite(Date.parse(input.distributedAt))) throw error('INVALID_DATE','分发时间无效。');
        changes.distributed_at=input.distributedAt?new Date(input.distributedAt).toISOString():null;
      }
      this.db.prepare('UPDATE vip_codes SET recipient_name=?,recipient_email=?,distributed_at=?,note=?,expires_at=? WHERE id=?').run(changes.recipient_name,changes.recipient_email,changes.distributed_at,changes.note,changes.expires_at,id);
      this.event(id,'updated',changes.distributed_at?'人工分发信息已登记':'信息已更新');
      return this.display(this.row(id));
    }).immediate();
  }
  revoke({ids,reason=''}) {
    if (!Array.isArray(ids)||!ids.length||ids.length>200||ids.some(id=>typeof id!=='string')) throw error('INVALID_IDS','请选择 1–200 个兑换码。');
    return this.db.transaction(() => {
      let revoked=0; const skipped=[];
      for (const id of new Set(ids)) {
        const row=this.db.prepare('SELECT * FROM vip_codes WHERE id=?').get(id);
        if (!row||row.status!=='available') {skipped.push({id,reason:'不存在或非未使用状态'});continue;}
        if(this.db.prepare("UPDATE vip_codes SET status='revoked' WHERE id=? AND status='available'").run(id).changes) {revoked++;this.event(id,'revoked',reason);}
      }
      return {revoked,skipped};
    }).immediate();
  }
  export(ids) {
    if (!Array.isArray(ids)||!ids.length||ids.length>200) throw error('INVALID_IDS','请选择 1–200 个兑换码。');
    return this.db.transaction(() => {
      const items=[];
      for (const id of new Set(ids)) {const row=this.row(id);if(this.display(row).status!=='available')continue;items.push({...this.display(row),code:this.decrypt(row.cipher)});}
      if(!items.length)throw error('VIP_NOT_AVAILABLE','所选码均不可用，无法导出。',409);
      for (const item of items) this.event(item.id,'exported','导出供人工分发');
      return items;
    }).immediate();
  }
  emailPending(email) { return Boolean(this.db.prepare("SELECT id FROM vip_attempts WHERE email=? AND status IN ('redeeming','review')").get(email)); }
  attempt(id) { return this.db.prepare('SELECT * FROM vip_attempts WHERE id=?').get(id); }
  reserve(input) {
    if (typeof input.idempotencyKey!=='string'||!/^[a-zA-Z0-9_-]{16,128}$/.test(input.idempotencyKey)) throw error('INVALID_IDEMPOTENCY_KEY','Please retry this registration from the website.');
    const hash=codeHash(input.code);
    return this.db.transaction(() => {
      const prior=this.attempt(input.idempotencyKey);
      if (prior) {
        const code=this.row(prior.code_id);
        if(prior.request_hash!==input.requestHash||code.code_hash!==hash) throw error('IDEMPOTENCY_CONFLICT','This submission has changed. Please start a new registration.',409);
        return {...prior,fresh:false};
      }
      const row=this.db.prepare('SELECT * FROM vip_codes WHERE code_hash=?').get(hash);
      if(!row) throw error('INVALID_VIP_CODE','Invalid VIP Code. Please check your code.');
      this.ensureAvailable(row);
      if(this.db.prepare("SELECT id FROM vip_attempts WHERE email=? AND status IN ('redeeming','review')").get(input.email)) throw error('VIP_EMAIL_PROCESSING','A registration for this email is being processed. Please contact LP CLUB.',409);
      const acquired=this.db.prepare("UPDATE vip_codes SET status='redeeming',registration_ref=? WHERE id=? AND status='available'").run(input.registrationRef,row.id);
      if(!acquired.changes) throw error('VIP_PROCESSING','This VIP Code is being processed.',409);
      this.db.prepare("INSERT INTO vip_attempts(id,code_id,request_hash,email,package_id,registration_ref,status,created_at) VALUES (?,?,?,?,?,?,'redeeming',?)").run(input.idempotencyKey,row.id,input.requestHash,input.email,input.packageId,input.registrationRef,new Date().toISOString());
      this.event(row.id,'reserved',input.registrationRef);
      return {...this.attempt(input.idempotencyKey),fresh:true};
    }).immediate();
  }
  transition(id,status,detail) {
    return this.db.transaction(() => {
      const a=this.attempt(id);
      if(!a||!['redeeming','review'].includes(a.status)) return;
      this.db.prepare('UPDATE vip_attempts SET status=? WHERE id=?').run(status,id);
      this.db.prepare('UPDATE vip_codes SET status=?,registration_ref=? WHERE id=?').run(status==='failed'?'available':status,status==='failed'?'':a.registration_ref,a.code_id);
      this.event(a.code_id,status,detail);
    }).immediate();
  }
  release(id,reason) { this.transition(id,'failed',reason); }
  review(id,reason) { this.transition(id,'review',reason); }
  complete(id,recordId,result,usedName='') {
    return this.db.transaction(() => {
      const a=this.attempt(id); if(!a) throw error('VIP_NOT_FOUND','兑换尝试不存在。',404);
      if(a.status==='used') return;
      if(!['redeeming','review'].includes(a.status)) throw error('VIP_NOT_EDITABLE','兑换状态已变更。',409);
      this.db.prepare("UPDATE vip_attempts SET status='used',record_id=?,result_json=? WHERE id=?").run(recordId,JSON.stringify(result||null),id);
      this.db.prepare("UPDATE vip_codes SET status='used',used_at=?,used_name=?,used_email=?,registration_ref=? WHERE id=?").run(new Date().toISOString(),text(usedName,120),a.email,a.registration_ref,a.code_id);
      this.event(a.code_id,'used',a.registration_ref);
    }).immediate();
  }
  saveResult(id,result) { this.db.prepare("UPDATE vip_attempts SET result_json=? WHERE id=? AND status='used'").run(JSON.stringify(result),id); }
  latestAttempt(id) { return this.db.prepare('SELECT * FROM vip_attempts WHERE code_id=? ORDER BY rowid DESC LIMIT 1').get(id); }
  resolve(id,reason) {
    if(!text(reason,500)) throw error('REASON_REQUIRED','请填写作废原因。');
    return this.db.transaction(()=>{
      const row=this.row(id);if(row.status!=='review')throw error('VIP_NOT_EDITABLE','仅待核对记录可人工作废。',409);
      const a=this.latestAttempt(id);this.db.prepare("UPDATE vip_attempts SET status='revoked' WHERE id=?").run(a.id);
      this.db.prepare("UPDATE vip_codes SET status='revoked' WHERE id=?").run(id);this.event(id,'resolved_revoked',reason);return this.display(this.row(id));
    }).immediate();
  }
  recover() {
    this.db.transaction(()=>{for(const row of this.db.prepare("SELECT id FROM vip_attempts WHERE status='redeeming'").all())this.review(row.id,'服务重启，等待飞书核对');}).immediate();
  }
  backup(filename) { return this.db.backup(filename); }
}

let singleton;
function getStore(env = process.env) {
  if (env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME) throw error('VIP_STORAGE_UNAVAILABLE','VIP redemption requires the persistent conference server.',503);
  if (!singleton) {
    const candidate = new VipStore({filename:env.VIP_DB_PATH||path.resolve(__dirname,'../data/vip-codes.sqlite'),key:env.VIP_CODE_ENCRYPTION_KEY});
    try { candidate.recover(); singleton=candidate; }
    catch (_) { candidate.close(); throw error('VIP_STORAGE_UNAVAILABLE','VIP storage recovery failed. Please contact LP CLUB.',503); }
  }
  return singleton;
}
module.exports={VipStore,getStore,error,normalizeCode,codeHash};
