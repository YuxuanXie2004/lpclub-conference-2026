'use strict';
const { decryptPayload } = require('./mail-outbox');
const { buildCard, millis } = require('./feishu-projection');
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const date = value => value ? new Date(millis(value)).toISOString() : null;
const sources = {
  mail: { from: 'mail_jobs j JOIN registrations r ON r.id=j.registration_id', kind: 'j.kind', time: 'j.created_at', success: 'j.sent_at', target: 'j.recipient', name: 'r.full_name', columns: 'j.id,j.kind,j.subject,j.recipient', statuses: ['pending', 'processing', 'sent', 'failed'] },
  feishu: { from: 'integration_jobs j JOIN registrations r ON r.id=j.registration_id JOIN integration_events e ON e.id=j.event_id', kind: 'e.kind', time: 'j.created_at', success: 'j.sent_at', target: "'Feishu bot'", name: "COALESCE(JSON_UNQUOTE(JSON_EXTRACT(e.snapshot,'$.full_name')),r.full_name)", columns: 'j.id,e.kind', statuses: ['pending', 'processing', 'sent', 'failed', 'blocked'] },
  sync: { from: 'feishu_sync_state j JOIN registrations r ON r.id=j.registration_id', kind: "'sync'", time: 'r.sync_changed_at', success: 'j.synced_at', target: 'j.record_id', name: 'r.full_name', columns: "j.registration_id AS id,'sync' AS kind,j.desired_version,j.synced_version", statuses: ['pending', 'processing', 'synced', 'failed', 'blocked'] }
};

function createNotificationAdmin({ db, env = process.env, integrations, mailConfigured = () => Boolean(env.SMTP_PASS && env.MAIL_PAYLOAD_KEY) }) {
  function source(channel) { if (!sources[channel]) throw fail('Unknown notification channel'); return sources[channel]; }
  const scope = channel => channel === 'sync' ? { sql: 'j.target_key=?', args: [integrations.target] } : channel === 'feishu' ? { sql: "j.channel='feishu_bot'", args: [] } : { sql: '1=1', args: [] };
  function conditions(channel, filters) {
    const s = source(channel), base = scope(channel), clauses = [base.sql], args = [...base.args];
    if (filters.status) {
      if (!s.statuses.includes(filters.status)) throw fail('Invalid notification status');
      clauses.push('j.status=?'); args.push(filters.status);
    }
    if (filters.kind) { clauses.push(s.kind + '=?'); args.push(String(filters.kind).slice(0, 100)); }
    if (filters.q) { clauses.push(`(r.ref LIKE ? OR ${s.name} LIKE ? OR ${s.target} LIKE ?)`); args.push(...Array(3).fill('%' + String(filters.q).slice(0, 200) + '%')); }
    for (const key of ['from', 'to']) if (filters[key]) {
      const value = String(filters[key]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw fail('Invalid date range');
      // Date filters use the conference's China timezone; database timestamps are UTC.
      const stamp = new Date(value + 'T00:00:00+08:00');
      if (key === 'to') stamp.setUTCDate(stamp.getUTCDate() + 1);
      clauses.push(s.time + (key === 'from' ? '>=?' : '<?')); args.push(stamp.toISOString().slice(0, 23).replace('T', ' '));
    }
    if (filters.from && filters.to && filters.from > filters.to) throw fail('Invalid date range');
    return { sql: clauses.join(' AND '), args };
  }
  function map(row) {
    return { ...row, attempts: Number(row.attempts || 0), createdAt: date(row.created_at), sentAt: date(row.sent_at), nextAttemptAt: date(row.next_attempt_at) };
  }
  async function list(channel, filters = {}) {
    const s = source(channel), where = conditions(channel, filters), base = scope(channel);
    const number = (value, fallback, max) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Math.min(Number(value), max) : fallback;
    const page = number(filters.page, 1, 100000), pageSize = number(filters.pageSize, 25, 100);
    const [rows, totals, counts, kinds] = await Promise.all([
      db.query(`SELECT ${s.columns},r.ref,${s.name} AS full_name,${s.target} AS target,j.status,j.attempts,j.last_error,${s.time} AS created_at,${s.success} AS sent_at,j.next_attempt_at FROM ${s.from} WHERE ${where.sql} ORDER BY ${s.time} DESC,${channel === 'sync' ? 'j.registration_id' : 'j.id'} DESC LIMIT ? OFFSET ?`, [...where.args, pageSize, (page - 1) * pageSize]),
      db.query(`SELECT COUNT(*) AS total FROM ${s.from} WHERE ${where.sql}`, where.args),
      db.query(`SELECT j.status,COUNT(*) AS count,MAX(${s.success}) AS last_success FROM ${s.from} WHERE ${base.sql} GROUP BY j.status`, base.args),
      db.query(`SELECT DISTINCT ${s.kind} AS kind FROM ${s.from} WHERE ${base.sql} ORDER BY kind`, base.args)
    ]);
    const stats = Object.fromEntries(counts.map(row => [row.status, Number(row.count)]));
    stats.total = counts.reduce((sum, row) => sum + Number(row.count), 0);
    return { rows: rows.map(map), total: Number(totals[0]?.total || 0), page, pageSize, stats, kinds: kinds.map(row => row.kind), lastSuccess: counts.map(row => date(row.last_success)).filter(Boolean).sort().at(-1) || null, configured: channel === 'mail' ? mailConfigured() : undefined };
  }
  async function detail(channel, id) {
    const s = source(channel); if (!uuid(id)) throw fail('Invalid notification ID');
    const base = scope(channel), key = channel === 'sync' ? 'j.registration_id' : 'j.id';
    const extra = channel === 'mail' ? ',j.encrypted_snapshot,j.encrypted_payload' : channel === 'feishu' ? ',e.id AS event_id,e.snapshot,e.occurred_at' : ',j.desired_version,j.synced_version';
    const [row] = await db.query(`SELECT ${s.columns},r.ref,${s.name} AS full_name,${s.target} AS target,j.status,j.attempts,j.last_error,${s.time} AS created_at,${s.success} AS sent_at,j.next_attempt_at${extra} FROM ${s.from} WHERE ${base.sql} AND ${key}=?`, [...base.args, id]);
    if (!row) throw fail('Notification not found', 404);
    let content = null, contentError = '';
    if (channel === 'mail') {
      const encrypted = row.encrypted_snapshot || row.encrypted_payload;
      if (encrypted) {
        try { const payload = decryptPayload(encrypted, env.MAIL_PAYLOAD_KEY); content = { to: payload.to, cc: payload.cc, subject: payload.subject, text: payload.text || '', html: payload.html || '' }; }
        catch (_) { contentError = 'Unable to decrypt saved email content'; }
      }
    } else if (channel === 'feishu') {
      content = buildCard({ id: row.event_id, kind: row.kind, snapshot: parse(row.snapshot), occurredAt: row.occurred_at }, env);
    }
    const retries = await db.query("SELECT detail,created_at FROM audit_events WHERE registration_id=(SELECT id FROM registrations WHERE ref=?) AND action='notification_retry' AND JSON_UNQUOTE(JSON_EXTRACT(detail,'$.channel'))=? AND JSON_UNQUOTE(JSON_EXTRACT(detail,'$.jobId'))=?" + (channel === 'sync' ? " AND JSON_UNQUOTE(JSON_EXTRACT(detail,'$.targetKey'))=?" : '') + ' ORDER BY id DESC LIMIT 100', [row.ref, channel, id, ...(channel === 'sync' ? [integrations.target] : [])]);
    const history = retries.map(item => ({ ...parse(item.detail), at: date(item.created_at) })).filter(item => item.channel === channel && item.jobId === id && (channel !== 'sync' || item.targetKey === integrations.target));
    const { encrypted_snapshot, encrypted_payload, snapshot, ...safe } = row;
    return { ...map(safe), content, contentAvailable: Boolean(content), contentError, history };
  }
  async function retry(channel, id) {
    source(channel); if (!uuid(id)) throw fail('Invalid notification ID');
    if (channel === 'mail' && !mailConfigured()) throw fail('Email sending is not configured', 503);
    return db.transaction(async tx => {
      const table = channel === 'mail' ? 'mail_jobs' : channel === 'feishu' ? 'integration_jobs' : 'feishu_sync_state';
      const key = channel === 'sync' ? 'registration_id' : 'id';
      const scoped = channel === 'sync' ? ' AND target_key=?' : channel === 'feishu' ? " AND channel='feishu_bot'" : '';
      const args = channel === 'sync' ? [id, integrations.target] : [id];
      const [job] = await tx.query(`SELECT * FROM ${table} WHERE ${key}=?${scoped} FOR UPDATE`, args);
      if (!job) throw fail('Notification not found', 404);
      if (!['failed', 'blocked'].includes(job.status)) throw fail('Only failed notifications can be retried', 409);
      if (channel === 'mail' && !job.encrypted_payload) throw fail('Original email payload is unavailable', 409);
      await tx.query(`UPDATE ${table} SET status='pending',attempts=0,next_attempt_at=UTC_TIMESTAMP(3),last_error='' WHERE ${key}=?${scoped}`, args);
      if (channel === 'mail' && job.kind === 'registration') await tx.query("UPDATE registrations SET email_status='Queued' WHERE id=?", [job.registration_id]);
      await tx.query("INSERT INTO audit_events(registration_id,action,actor,detail) VALUES (?,'notification_retry','admin',?)", [job.registration_id, JSON.stringify({ channel, jobId: id, ...(channel === 'sync' ? { targetKey: integrations.target } : {}), previousAttempts: Number(job.attempts || 0), previousError: job.last_error || '' })]);
      if (channel === 'mail') await integrations.capture(tx, job.registration_id);
      return { queued: true };
    });
  }
  async function retryFeishu(input = {}) {
    if (!input || (!input.jobId && !input.ref)) throw fail('Enter a registration reference or failed job ID');
    if (input.jobId && !uuid(String(input.jobId))) throw fail('Invalid notification ID');
    const ref = String(input.ref || '').trim().slice(0, 100);
    const jobs = await db.query("SELECT j.id,'feishu' AS channel FROM integration_jobs j JOIN registrations r ON r.id=j.registration_id WHERE j.channel='feishu_bot' AND j.status IN ('failed','blocked') AND (j.id=? OR r.ref=?)", [input.jobId || '', ref]);
    if (ref) jobs.push(...await db.query("SELECT j.registration_id AS id,'sync' AS channel FROM feishu_sync_state j JOIN registrations r ON r.id=j.registration_id WHERE j.target_key=? AND r.ref=? AND j.status IN ('failed','blocked')", [integrations.target, ref]));
    let count = 0;
    for (const job of jobs) {
      try { await retry(job.channel, job.id); count++; }
      catch (error) { if (error.statusCode !== 409) throw error; }
    }
    return { queued: count > 0, count };
  }
  return { list, detail, retry, retryFeishu, retryMail: id => retry('mail', id) };
}

function renderNotificationPanel(channel) {
  const name = channel === 'mail' ? 'mail' : 'feishu';
  return `<div class="notification-status" id="${name}Connection" role="status"></div>
  <div class="stats" id="${name}Stats"></div>
  ${name === 'feishu' ? require('./feishu-admin').renderFeishuStatus() : ''}
  <div class="filters notification-filters">
    <input id="${name}Search" aria-label="Search notifications" placeholder="Search notifications">
    ${name === 'feishu' ? '<select id="feishuChannel" aria-label="Notification channel"><option value="feishu">Feishu notifications</option><option value="sync">Table sync</option></select>' : ''}
    <select id="${name}Status" aria-label="Status"><option value="">All statuses</option></select>
    <select id="${name}Kind" aria-label="Notification type"><option value="">All types</option></select>
    <label>From date<input type="date" id="${name}From"></label><label>To date<input type="date" id="${name}To"></label>
    <button class="btn" id="${name}Refresh">Refresh</button>
  </div>
  <p id="${name}Message" class="notification-message" role="status"></p>
  <div class="scroll"><table><thead><tr><th>Reference</th><th>Name</th><th>Notification type</th><th>Recipient / target</th><th>Subject</th><th>Status</th><th>Triggered at</th><th>Sent / synced at</th><th>Attempts this cycle</th><th>Actions</th></tr></thead><tbody id="${name}Rows"></tbody></table></div>
  <div class="pager"><button id="${name}Previous">Previous</button><span id="${name}PageInfo"></span><button id="${name}Next">Next</button></div>
  <div class="notification-drawer" id="${name}Drawer" role="dialog" aria-modal="true" aria-labelledby="${name}DetailTitle" hidden><div class="notification-detail"><button class="close" id="${name}Close" aria-label="Close">×</button><h2 id="${name}DetailTitle">Notification details</h2><div id="${name}Detail"></div></div></div>`;
}
module.exports = { createNotificationAdmin, renderNotificationPanel };
