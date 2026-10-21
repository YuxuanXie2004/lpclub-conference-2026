'use strict';
const crypto = require('node:crypto');
const { text, profile, lockItems, takeDown } = require('./showcase-state');
const path = require('node:path');
const { createImageCache } = require('./materials-image-cache');
const { createFileStore } = require('./materials-file-store');
const { publicUrl, deploymentPrefix } = require('./public-paths');
const { decodeImage, derivative, MAX_BYTES, MAX_PIXELS } = require('./materials-images');
const { validateCrop } = require('../assets/image-crop');
const KINDS = ['card', 'portrait', 'logo'];
const PUBLIC_KINDS = ['portrait', 'logo'];
const EVENT = 'conference-2026';
const CONSENT_VERSION = '2026-10-19';
const fail = (message, statusCode = 400, code) => Object.assign(new Error(message), { statusCode, ...(code ? { code } : {}) });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const equal = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y); };
const cleanText = (value, max = 200) => String(value ?? '').trim().slice(0, max);

function objectJSON(value) {
  let result;
  try { result = typeof value === 'string' ? JSON.parse(value) : value; } catch (_) { throw fail('Materials data needs administrator repair', 503); }
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw fail('Materials data needs administrator repair', 503);
  return result;
}
function kindCheck(kind) { if (!KINDS.includes(kind)) throw fail('Invalid material type'); }
const portraitEligible = row => ['speaking', 'panel'].includes(row.option_id);
const imageMissing = () => fail('Image not found', 404);

function createMaterialService({ db, packages = {}, env = process.env, mail, composeSupplement = data => data } = {}) {
  const storageMode = 'local';
  const fileStore = createFileStore(env.MATERIALS_STORAGE_DIR || path.join(__dirname, '../data/material-originals'));
  const imageCache = createImageCache(env.MATERIALS_CACHE_DIR || path.join(__dirname, '../data/material-cache'));
  function ready() {
    if (!db?.query || !db?.transaction || env.MATERIALS_ENABLED !== 'true' || Buffer.byteLength(env.MATERIALS_SIGNING_KEY || '') < 32) return false;
    try { publicUrl(env.PUBLIC_BASE_URL, 'materials'); return true; } catch (_) { return false; }
  }
  function requireReady() { if (!ready()) throw fail('Materials are not configured', 503); }
  function emailURL(ref, token) {
    const url = new URL(publicUrl(env.PUBLIC_BASE_URL, 'materials'));
    url.hash = new URLSearchParams({ ref, token }).toString();
    return url.href;
  }
  async function audit(tx, id, action, actor, detail = {}) {
    await tx.query('INSERT INTO audit_events(registration_id,action,actor,detail) VALUES (?,?,?,?)', [id, action, actor, JSON.stringify(detail)]);
  }
  async function newToken(tx, row) {
    const token = crypto.randomBytes(32).toString('base64url');
    await tx.query("INSERT INTO supplement_tokens(digest,registration_id,scope,expires_at) VALUES (?,?,'supplement',DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 30 DAY))", [hash(token), row.id]);
    return emailURL(row.ref, token);
  }
  async function initialize(tx, order, row) {
    if (!ready()) return { supplementUrl: '' };
    const preferences = order.materialPreferences || {};
    const consents = { portrait: portraitEligible(row) && preferences.portraitConsent === true, logo: preferences.logoConsent === true };
    for (const kind of KINDS) {
      const id = crypto.randomUUID();
      await tx.query('INSERT INTO material_items(id,registration_id,kind) VALUES (?,?,?)', [id, row.id, kind]);
      if (kind !== 'card') {
        await tx.query('INSERT INTO publication_consents(registration_id,kind,granted,granted_at,text_version) VALUES (?,?,?,IF(?,UTC_TIMESTAMP(3),NULL),?)', [row.id, kind, consents[kind], consents[kind], CONSENT_VERSION]);
        await tx.query('INSERT INTO showcase_entries(id,item_id,event_key,kind,config_json,org_key) VALUES (?,?,?,?,?,?)', [crypto.randomUUID(), id, row.event_key || EVENT, kind, JSON.stringify({ draft: {}, published: null }), row.id]);
      }
    }
    await audit(tx, row.id, 'consent', 'registrant', { values: consents, docVersion: CONSENT_VERSION, initial: true });
    return { supplementUrl: await newToken(tx, row) };
  }
  function uploadGrant(ref) {
    requireReady();
    if (typeof ref !== 'string' || !ref || ref.length > 100) throw fail('Invalid registration reference');
    const expiresAt = Date.now() + 10 * 60000;
    const payload = Buffer.from(JSON.stringify({ ref, scope: 'upload', exp: expiresAt, nonce: crypto.randomBytes(16).toString('hex') })).toString('base64url');
    return { token: payload + '.' + crypto.createHmac('sha256', env.MATERIALS_SIGNING_KEY).update(payload).digest('base64url'), expiresAt: new Date(expiresAt).toISOString() };
  }
  async function find(ref, connection = db, lock = false) {
    requireReady();
    if (typeof ref !== 'string' || !ref || ref.length > 100) throw fail('Invalid registration reference');
    const rows = await connection.query('SELECT * FROM registrations WHERE event_key=? AND ref=?' + (lock ? ' FOR UPDATE' : ''), [EVENT, ref]);
    const row = rows[0];
    if (!row || row.is_deleted || row.deleted_at) throw fail('Registration not found', 404);
    return row;
  }
  async function authenticateRow(connection, row, token, uploadOnly) {
    if (typeof token !== 'string' || !token || token.length > 2048) throw fail('Invalid or expired materials link', 401);
    const records = await connection.query("SELECT digest FROM supplement_tokens WHERE digest=? AND registration_id=? AND scope='supplement' AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP(3)", [hash(token), row.id]);
    if (records.length && equal(records[0].digest, hash(token))) return { scope: 'supplement', ref: row.ref, token };
    const [payload, signature, extra] = token.split('.');
    if (payload && signature && !extra && equal(signature, crypto.createHmac('sha256', env.MATERIALS_SIGNING_KEY).update(payload).digest('base64url'))) {
      let grant;
      try { grant = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch (_) {}
      if (grant?.ref === row.ref && grant.scope === 'upload' && Number.isFinite(grant.exp) && grant.exp > Date.now() && grant.exp <= Date.now() + 10 * 60000) {
        if (!uploadOnly) throw fail('This credential permits upload only; use the email link to manage materials', 403);
        return { scope: 'upload', ref: row.ref, token };
      }
    }
    throw fail('Invalid or expired materials link', 401);
  }
  async function authenticate(ref, token, { uploadOnly = false } = {}) { return authenticateRow(db, await find(ref), token, uploadOnly); }
  async function withRow(ref, work, authContext, uploadOnly = false) {
    requireReady();
    try {
      return await db.transaction(async tx => {
        const row = await find(ref, tx, true);
        if (authContext) {
          if (authContext.ref !== ref) throw fail('Invalid materials credential', 401);
          await authenticateRow(tx, row, authContext.token, uploadOnly);
        }
        return work(tx, row);
      });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw fail('This organisation already has a published logo. Unpublish it before publishing another registration.', 409, 'ORGANISATION_ALREADY_PUBLISHED');
      throw error;
    }
  }
  async function itemForUpdate(tx, row, kind) {
    const item = (await tx.query('SELECT * FROM material_items WHERE registration_id=? AND kind=? FOR UPDATE', [row.id, kind]))[0];
    if (!item) throw fail('Materials data needs administrator repair', 503);
    return item;
  }
  async function entries(tx, id) { return tx.query('SELECT s.*,m.kind FROM showcase_entries s JOIN material_items m ON m.id=s.item_id WHERE m.registration_id=? ORDER BY m.kind', [id]); }
  async function view(connection, row, admin = false) {
    const [items, consentRows, jobRows] = await Promise.all([
      connection.query('SELECT m.*,v.status,v.reason,v.uploaded_at,s.enabled,s.config_json,p.version_no AS published_version FROM material_items m LEFT JOIN material_versions v ON v.id=m.current_version_id LEFT JOIN showcase_entries s ON s.item_id=m.id LEFT JOIN material_versions p ON p.id=s.published_version_id WHERE m.registration_id=?', [row.id]),
      connection.query('SELECT kind,granted FROM publication_consents WHERE registration_id=?', [row.id]),
      connection.query("SELECT status,sent_at FROM mail_jobs WHERE registration_id=? AND kind IN ('registration','supplement') ORDER BY created_at DESC,id DESC LIMIT 1", [row.id])
    ]);
    const assets = Object.fromEntries(KINDS.map(kind => [kind, { version: 0, rowVersion: 1, approvedVersionId: null, status: kind === 'portrait' && !portraitEligible(row) ? 'not_applicable' : 'missing', reason: '', uploadedAt: '', publishedVersion: null, preview: false }]));
    const publications = {}, consents = { portrait: false, logo: false };
    let config = {};
    for (const consent of consentRows) consents[consent.kind] = consent.granted === 1;
    for (const item of items) {
      const active = !!item.current_version_id;
      assets[item.kind] = { version: item.version_no, rowVersion: item.row_version, approvedVersionId: item.approved_version_id || null, status: !active ? (item.kind === 'portrait' && !portraitEligible(row) ? 'not_applicable' : 'missing') : item.kind === 'card' && item.status === 'pending' ? 'received' : item.status, reason: item.reason || '', uploadedAt: item.uploaded_at || '', publishedVersion: item.enabled ? item.published_version : null, preview: active };
      if (item.kind !== 'card') {
        const state = objectJSON(item.config_json);
        config = { ...(state.draft || {}), ...profile(row, state.draft || {}) };
        if (item.enabled && item.published_version && state.published) publications[item.kind] = { ...state.published, ...profile(row, state.published), version: item.published_version };
      }
    }
    const latestMail = jobRows[0];
    const mailStatus = latestMail ? ({ pending: 'Queued', processing: 'Sending', sent: 'Sent', failed: 'Failed' }[latestMail.status] || '') : row.email_status || '';
    const output = { ref: row.ref, rowVersion: row.row_version, status: row.status, identity: { name: row.full_name || '', company: row.company || '', title: row.job_title || '', package: row.package_id || '' }, portraitEligible: portraitEligible(row), consents, assets, language: row.language || 'en', mailStatus };
    if (admin) {
      const [auditRows, initialRows] = await Promise.all([
        connection.query('SELECT action,actor,detail,created_at FROM audit_events WHERE registration_id=? ORDER BY id DESC LIMIT 200', [row.id]),
        connection.query("SELECT action,actor,detail,created_at FROM audit_events WHERE registration_id=? AND action='consent' AND JSON_UNQUOTE(JSON_EXTRACT(detail,'$.initial'))='true' ORDER BY id LIMIT 1", [row.id])
      ]);
      const auditView = event => ({ ...objectJSON(event.detail || {}), at: event.created_at, action: event.action, actor: event.actor });
      const audit = auditRows.reverse().map(auditView);
      Object.assign(output, { owner: row.owner || '', followUpNote: row.follow_up_note || '', email: row.email || '', mobile: row.mobile || '', config, publications, audit, initialConsent: initialRows.length ? auditView(initialRows[0]) : null });
    }
    return output;
  }
  async function me(ref, authContext) {
    if (authContext) return withRow(ref, (tx, row) => view(tx, row), authContext);
    return view(db, await find(ref));
  }
  async function upload(ref, kind, { buffer, filename, mimeType }, authContext) {
    kindCheck(kind); requireReady();
    const metadata = await decodeImage(buffer, mimeType);
    // Immutable durable bytes are written before SQL. A rolled-back transaction can leave only an unreachable original.
    const extension = metadata.format === 'jpeg' ? 'jpg' : metadata.format;
    const source = await fileStore.write(buffer, kind + '.' + extension, mimeType);
    return withRow(ref, async (tx, row) => {
      if (kind === 'portrait' && !portraitEligible(row)) throw fail('Portrait is only available for speaking or panel packages');
      const item = await itemForUpdate(tx, row, kind), fileId = crypto.randomUUID(), versionId = crypto.randomUUID();
      const version = item.version_no + 1;
      await tx.query('INSERT INTO material_files(id,storage_key,filename,mime_type,byte_size,width,height,sha256) VALUES (?,?,?,?,?,?,?,?)', [fileId, source.key, cleanText(filename, 255) || source.name, mimeType, buffer.length, metadata.width, metadata.height, hash(buffer)]);
      await tx.query("INSERT INTO material_versions(id,item_id,version_no,file_id,status) VALUES (?,?,?,?,'pending')", [versionId, item.id, version, fileId]);
      await tx.query('UPDATE material_items SET current_version_id=?,version_no=?,row_version=row_version+1 WHERE id=?', [versionId, version, item.id]);
      await audit(tx, row.id, 'upload', 'registrant', { kind, version });
      return view(tx, row);
    }, authContext, true);
  }
  async function setConsents(ref, values, authContext) {
    if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).some(key => !PUBLIC_KINDS.includes(key)) || Object.values(values).some(value => typeof value !== 'boolean')) throw fail('Consent values must be boolean');
    return withRow(ref, async (tx, row) => {
      const lockedItems = await lockItems(tx, [row.id]);
      const withdrawn = lockedItems.filter(item => Object.hasOwn(values, item.kind) && !values[item.kind]);
      await takeDown(tx, withdrawn, row.event_key);
      for (const kind of PUBLIC_KINDS) if (Object.hasOwn(values, kind)) {
        if (kind === 'portrait' && values[kind] && !portraitEligible(row)) throw fail('Portrait is only available for speaking or panel packages');
        const item = await itemForUpdate(tx, row, kind);
        await tx.query('UPDATE material_items SET row_version=row_version+1 WHERE id=?', [item.id]);
        await tx.query('UPDATE publication_consents SET granted=?,granted_at=IF(?,UTC_TIMESTAMP(3),granted_at),revoked_at=IF(?,NULL,UTC_TIMESTAMP(3)),text_version=? WHERE registration_id=? AND kind=?', [values[kind], values[kind], values[kind], CONSENT_VERSION, row.id, kind]);

      }
      await audit(tx, row.id, 'consent', 'registrant', { values, docVersion: CONSENT_VERSION });
      return view(tx, row);
    }, authContext);
  }
  async function remove(ref, kind, authContext) {
    kindCheck(kind);
    return withRow(ref, async (tx, row) => {
      const item = await itemForUpdate(tx, row, kind);
      if (kind !== 'card') await takeDown(tx, [item], row.event_key);
      await tx.query("UPDATE material_versions SET status='deleted' WHERE item_id=?", [item.id]);
      await tx.query('UPDATE material_items SET current_version_id=NULL,approved_version_id=NULL,version_no=version_no+1,row_version=row_version+1 WHERE id=?', [item.id]);
      await audit(tx, row.id, 'delete', 'registrant', { kind, version: item.version_no + 1 });
      return view(tx, row);
    }, authContext);
  }
  async function review(ref, { kind, version, rowVersion, decision, reason } = {}) {
    if (!KINDS.includes(kind) || !['pending', 'approve', 'reject'].includes(decision)) throw fail('Invalid review');
    if (decision === 'reject' && !cleanText(reason, 1000)) throw fail('A rejection reason is required');
    return withRow(ref, async (tx, row) => {
      const item = await itemForUpdate(tx, row, kind);
      if (!Number.isInteger(version) || !item.current_version_id || (!Number.isInteger(rowVersion) || rowVersion !== item.row_version)) throw fail('The material changed; refresh before reviewing', 409, 'VERSION_CONFLICT');
      const target = (await tx.query("SELECT id FROM material_versions WHERE item_id=? AND version_no=? AND status<>'deleted' FOR UPDATE", [item.id, version]))[0];
      if (!target) throw fail('The material changed; refresh before reviewing', 409, 'VERSION_CONFLICT');
      if (decision !== 'approve' && kind !== 'card') {
        const entry = (await tx.query('SELECT published_version_id,enabled FROM showcase_entries WHERE item_id=?', [item.id]))[0];
        if (entry?.enabled && entry.published_version_id === target.id) await takeDown(tx, [item], row.event_key);
      }
      await tx.query('UPDATE material_versions SET status=?,reason=?,reviewed_at=UTC_TIMESTAMP(3),reviewer=? WHERE id=?', [{ pending: 'pending', approve: 'approved', reject: 'rejected' }[decision], decision === 'reject' ? cleanText(reason, 1000) : '', 'administrator', target.id]);
      const approved = (await tx.query("SELECT id FROM material_versions WHERE item_id=? AND status='approved' ORDER BY version_no DESC LIMIT 1", [item.id]))[0];
      await tx.query('UPDATE material_items SET approved_version_id=?,row_version=row_version+1 WHERE id=?', [approved?.id || null, item.id]);
      await audit(tx, row.id, decision, 'administrator', { kind, version, reason: decision === 'reject' ? cleanText(reason, 1000) : '' });
      return view(tx, row, true);
    });
  }
  async function unpublish(ref, kind) {
    if (!PUBLIC_KINDS.includes(kind)) throw fail('Only public materials may be unpublished');
    return withRow(ref, async (tx, row) => {
      const item = await itemForUpdate(tx, row, kind);
      await takeDown(tx, [item], row.event_key);
      await tx.query('UPDATE material_items SET row_version=row_version+1 WHERE id=?', [item.id]);
      await audit(tx, row.id, 'unpublish', 'administrator', { kind, version: item.version_no });
      return view(tx, row, true);
    });
  }
  function validatedConfig(values) {
    const config = {};
    if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).some(key => !['name', 'title', 'company', 'crop', 'rowVersion'].includes(key))) throw fail('Invalid display configuration');
    for (const key of ['name', 'title', 'company']) if (Object.hasOwn(values, key)) {
      if (typeof values[key] !== 'string' || values[key].length > 200) throw fail('Display text must be a string of at most 200 characters');
      config[key] = values[key].trim();
    }
    if (Object.hasOwn(values, 'crop')) {
      if (!values.crop || typeof values.crop !== 'object' || Array.isArray(values.crop) || Object.keys(values.crop).some(kind => !PUBLIC_KINDS.includes(kind))) throw fail('Invalid crop');
      config.crop = {};
      for (const [kind, point] of Object.entries(values.crop)) {
        config.crop[kind] = validateCrop(point);
      }
    }
    return config;
  }
  async function configure(ref, values) {
    const changes = validatedConfig(values);
    return withRow(ref, async (tx, row) => {
      if (!Number.isInteger(values.rowVersion) || values.rowVersion !== row.row_version) throw fail('Registration changed; refresh before saving', 409, 'VERSION_CONFLICT');
      await lockItems(tx, [row.id]);
      for (const entry of await entries(tx, row.id)) {
        const config = objectJSON(entry.config_json), draft = { ...(config.draft || {}), ...changes };
        if (changes.crop) draft.crop = { ...(config.draft?.crop || {}), ...changes.crop };
        await tx.query('UPDATE showcase_entries SET config_json=? WHERE id=?', [JSON.stringify({ ...config, draft }), entry.id]);
        await tx.query('UPDATE material_items SET row_version=row_version+1 WHERE id=?', [entry.item_id]);
      }
      await tx.query('UPDATE registrations SET row_version=row_version+1 WHERE id=?', [row.id]); row.row_version++;
      await audit(tx, row.id, 'configure', 'administrator');
      return view(tx, row, true);
    });
  }
  async function setOwner(ref, values) {
    if (!values || typeof values !== 'object' || typeof values.owner !== 'string' || values.owner.length > 120 || typeof values.note !== 'string' || values.note.length > 5000) throw fail('Invalid owner or follow-up note');
    return withRow(ref, async (tx, row) => {
      if (!Number.isInteger(values.rowVersion) || values.rowVersion !== row.row_version) throw fail('Registration changed; refresh before saving', 409, 'VERSION_CONFLICT');
      row.owner = values.owner.trim(); row.follow_up_note = values.note.trim();
      await tx.query('UPDATE registrations SET owner=?,follow_up_note=?,row_version=row_version+1 WHERE id=?', [row.owner, row.follow_up_note, row.id]); row.row_version++;
      await audit(tx, row.id, 'owner', 'administrator', { owner: row.owner, note: row.follow_up_note });
      return view(tx, row, true);
    });
  }
  async function resend(ref) {
    return withRow(ref, async (tx, row) => {
      if (!mail?.enqueue || (mail.configured && !mail.configured())) throw fail('Supplement email is not configured', 503, 'MAIL_NOT_CONFIGURED');
      await tx.query('UPDATE supplement_tokens SET revoked_at=UTC_TIMESTAMP(3) WHERE registration_id=? AND revoked_at IS NULL', [row.id]);
      // Claimed messages may already be in flight. Clearing their lease prevents stale delivery results or retries from reviving them.
      await tx.query("UPDATE mail_jobs SET status='failed',encrypted_payload=NULL,last_error='SUPERSEDED',lease_token=NULL,lease_until=NULL WHERE registration_id=? AND kind IN ('registration','supplement') AND status IN ('pending','processing')", [row.id]);
      const url = await newToken(tx, row);
      const payload = composeSupplement({ to: row.email, fullName: row.full_name, language: row.language || 'en', url, ref: row.ref });
      const queued = await mail.enqueue(tx, row.id, 'supplement', payload, 'supplement:' + row.id + ':' + crypto.randomUUID());
      if (!queued?.queued) throw fail('Supplement email could not be queued', 503, 'MAIL_NOT_CONFIGURED');
      await audit(tx, row.id, 'resend', 'administrator');
      return { ...await view(tx, row, true), queued: true };
    });
  }
  async function adminPage(options = {}) {
    requireReady();
    const pageValue = Number(options.page), sizeValue = Number(options.pageSize);
    const page = Number.isFinite(pageValue) && pageValue >= 1 ? Math.min(1000000, Math.floor(pageValue)) : 1;
    const pageSize = Number.isFinite(sizeValue) && sizeValue >= 1 ? Math.min(100, Math.floor(sizeValue)) : 50;
    const where = ['r.event_key=?', 'r.is_deleted=0', 'r.deleted_at IS NULL', 'EXISTS(SELECT 1 FROM material_items m WHERE m.registration_id=r.id)'], args = [EVENT];
    if (options.ref) { where.push('r.ref=?'); args.push(cleanText(options.ref, 100)); }
    if (options.q) { where.push('(r.ref LIKE ? OR r.full_name LIKE ? OR r.company LIKE ? OR r.email LIKE ?)'); args.push(...Array(4).fill('%' + cleanText(options.q, 180).replace(/[\\%_]/g, '\\$&') + '%')); }
    if (options.status) { where.push('r.status=?'); args.push(cleanText(options.status, 30)); }
    if (options.owner) { where.push('r.owner=?'); args.push(cleanText(options.owner, 120)); }
    if (options.package) { where.push('r.package_id=?'); args.push(cleanText(options.package, 100)); }
    if (KINDS.includes(options.kind) && ['pending', 'approved', 'rejected', 'missing', 'received'].includes(options.materialStatus)) {
      where.push('EXISTS(SELECT 1 FROM material_items i LEFT JOIN material_versions v ON v.id=i.current_version_id WHERE i.registration_id=r.id AND i.kind=? AND ' + (options.materialStatus === 'missing' ? 'i.current_version_id IS NULL)' : 'v.status=?)'));
      args.push(options.kind); if (options.materialStatus !== 'missing') args.push(options.materialStatus === 'received' ? 'pending' : options.materialStatus);
    }
    const clause = where.join(' AND ');
    const total = Number((await db.query('SELECT COUNT(*) AS total FROM registrations r WHERE ' + clause, args))[0].total);
    const records = await db.query('SELECT r.* FROM registrations r WHERE ' + clause + ' ORDER BY r.submitted_at DESC,r.id DESC LIMIT ? OFFSET ?', [...args, pageSize, (page - 1) * pageSize]);
    return { rows: await Promise.all(records.map(row => view(db, row, true))), total, page, pageSize };
  }
  async function adminList(ref = '', options = {}) {
    if (ref) return [await view(db, await find(ref), true)];
    return (await adminPage(options)).rows;
  }
  const publicSelect = `SELECT s.id,s.kind,s.published_version_id,s.config_json,s.org_key,s.sort_order,v.version_no,f.storage_key,r.option_id,r.language,r.full_name,r.job_title,r.company FROM showcase_entries s
    JOIN material_items m ON m.id=s.item_id
    JOIN registrations r ON r.id=m.registration_id
    JOIN material_versions v ON v.id=s.published_version_id AND v.item_id=m.id
    JOIN material_files f ON f.id=v.file_id
    JOIN publication_consents c ON c.registration_id=r.id AND c.kind=s.kind
    WHERE s.event_key=? AND r.event_key=s.event_key AND s.enabled=1 AND r.is_deleted=0 AND r.deleted_at IS NULL
    AND r.status='Approved' AND c.granted=1 AND v.status='approved'
    AND (s.kind='logo' OR (s.kind='portrait' AND r.option_id IN ('speaking','panel')))`;
  const manualPublicSelect = `SELECT s.id,s.kind,s.file_id AS published_version_id,s.config_json,s.id AS org_key,s.sort_order,
    1 AS version_no,f.storage_key,'speaking' AS option_id,'en' AS language,'' AS full_name,'' AS job_title,'' AS company
    FROM showcase_manual_entries s JOIN material_files f ON f.id=s.file_id WHERE s.event_key=? AND s.enabled=1`;
  async function showcase() {
    if (!ready()) return { ok: true, enabled: false, speakers: [], organisations: [] };
    const rows = await db.query('SELECT * FROM (' + publicSelect + ' UNION ALL ' + manualPublicSelect + ') published ORDER BY sort_order,id', [EVENT,EVENT]);
    const speakers = [], organisations = [];
    for (const row of rows) {
      const published = objectJSON(row.config_json).published;
      if (!published) continue;
      const imageUrl = deploymentPrefix(env.PUBLIC_BASE_URL) + '/api/public/media/' + row.id + '/' + row.version_no;
      if (row.kind === 'portrait') speakers.push({ id: row.id, imageUrl, ...profile(row, published), kind: row.option_id });
      else organisations.push({ id: row.id, imageUrl, name: text(published.company, row.language, row.company) });
    }
    return { ok: true, enabled: true, speakers, organisations };
  }
  async function publishedRow(id, version) {
    const row = (await db.query(publicSelect + ' AND s.id=? AND v.version_no=? UNION ALL ' + manualPublicSelect + ' AND s.id=? AND ?=1', [EVENT,id,version,EVENT,id,version]))[0];
    if (!row || !objectJSON(row.config_json).published) throw imageMissing();
    return row;
  }
  async function publicMedia(id, version) {
    requireReady();
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !Number.isInteger(version) || version < 1) throw imageMissing();
    const row = await publishedRow(id, version), published = objectJSON(row.config_json).published;
    const result = await imageCache(JSON.stringify({ renderer: 7, source: row.storage_key, kind: row.kind, version, crop: published.crop?.[row.kind] }), async () => derivative(await fileStore.read({ storage: 'local', key: row.storage_key }), row.kind, published.crop?.[row.kind]));
    // The byte cache is never an authority. Repeat the indexed rights query after every asynchronous image read.
    const latest = await publishedRow(id, version);
    if (latest.published_version_id !== row.published_version_id || latest.storage_key !== row.storage_key || JSON.stringify(objectJSON(latest.config_json).published) !== JSON.stringify(published)) throw imageMissing();
    return result;
  }
  async function publicImage(ref, kind, version) {
    requireReady();
    if (!PUBLIC_KINDS.includes(kind) || !Number.isInteger(version) || version < 1) throw imageMissing();
    const row = (await db.query('SELECT s.id FROM showcase_entries s JOIN material_items m ON m.id=s.item_id JOIN registrations r ON r.id=m.registration_id WHERE r.event_key=? AND r.ref=? AND m.kind=?', [EVENT, ref, kind]))[0];
    if (!row) throw imageMissing();
    return publicMedia(row.id, version);
  }
  async function preview(ref, kind, { published = false, authContext, versionId, fit } = {}) {
    kindCheck(kind);
    if (published && kind === 'card') throw imageMissing();
    if (fit && fit !== 'contain') throw fail('Invalid preview fit');
    if (versionId && (typeof versionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(versionId))) throw imageMissing();
    const build = async (connection, row) => {
      const image = (await connection.query('SELECT f.storage_key,s.config_json FROM material_items m LEFT JOIN showcase_entries s ON s.item_id=m.id JOIN material_versions v ON v.id=' + (versionId ? '?' : published ? 's.published_version_id' : 'm.current_version_id') + ' AND v.item_id=m.id JOIN material_files f ON f.id=v.file_id WHERE m.registration_id=? AND m.kind=? AND v.status<>\'deleted\'' + (published ? ' AND s.enabled=1' : ''), [...(versionId ? [versionId] : []), row.id, kind]))[0];
      if (!image) throw imageMissing();
      const config = image.config_json ? objectJSON(image.config_json) : {};
      const crop = (published ? config.published : config.draft)?.crop?.[kind];
      return derivative(await fileStore.read({ storage: 'local', key: image.storage_key }), fit === 'contain' ? 'card' : kind, crop);
    };
    if (authContext) return withRow(ref, build, authContext);
    return build(db, await find(ref));
  }
  return { storageMode, ready, initialize, uploadGrant, authenticate, me, upload, setConsents, remove, review, configure, unpublish, setOwner, resend, adminList, adminPage, showcase, publicMedia, publicImage, preview };
}
module.exports = { createMaterialService, MAX_BYTES, MAX_PIXELS, decodeImage };
