'use strict';

const { FEISHU_FIELDS } = require('./feishu-schema');

let tokenCache = { value: '', expiresAt: 0 };

function config() {
  return {
    appId: process.env.FEISHU_APP_ID || '',
    appSecret: process.env.FEISHU_APP_SECRET || '',
    appToken: process.env.FEISHU_APP_TOKEN || '',
    tableId: process.env.FEISHU_TABLE_ID || ''
  };
}

function assertConfigured() {
  const c = config();
  const missing = Object.entries(c).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    const e = new Error('Missing Feishu configuration: ' + missing.join(', '));
    e.code = 'FEISHU_NOT_CONFIGURED';
    throw e;
  }
  return c;
}

async function tenantToken() {
  const c = assertConfigured();
  if (tokenCache.value && Date.now() < tokenCache.expiresAt) return tokenCache.value;
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: c.appId, app_secret: c.appSecret })
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`Feishu token error ${data.code}: ${data.msg || 'unknown'}`);
  tokenCache = {
    value: data.tenant_access_token,
    expiresAt: Date.now() + Math.max(60, (Number(data.expire) || 7200) - 60) * 1000
  };
  return tokenCache.value;
}

async function api(path, options = {}) {
  const token = await tenantToken();
  const res = await fetch('https://open.feishu.cn/open-apis' + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  const data = await res.json();
  if (data.code !== 0) {
    const e = new Error(`Feishu API error ${data.code}: ${data.msg || 'unknown'}`);
    e.feishuCode = data.code;
    throw e;
  }
  return data.data || {};
}

async function listFields() {
  const c = assertConfigured();
  const data = await api(`/bitable/v1/apps/${encodeURIComponent(c.appToken)}/tables/${encodeURIComponent(c.tableId)}/fields?page_size=100`);
  return data.items || [];
}

async function updateField(fieldId, fieldName, type = 1) {
  const c = assertConfigured();
  const data = await api(`/bitable/v1/apps/${encodeURIComponent(c.appToken)}/tables/${encodeURIComponent(c.tableId)}/fields/${encodeURIComponent(fieldId)}`, {
    method: 'PUT', body: JSON.stringify({ field_name: fieldName, type })
  });
  return data.field;
}

async function createField(fieldName, type = 1) {
  const c = assertConfigured();
  const data = await api(`/bitable/v1/apps/${encodeURIComponent(c.appToken)}/tables/${encodeURIComponent(c.tableId)}/fields`, {
    method: 'POST', body: JSON.stringify({ field_name: fieldName, type })
  });
  return data.field;
}

async function ensureSchema(log = console.log) {
  const existing = await listFields();
  const byName = new Map(existing.map(f => [f.field_name, f]));
  const primary = existing.find(f => f.is_primary) || existing[0];
  const primarySpec = FEISHU_FIELDS.find(f => f.primary);
  const changes = [];
  if (!primary) throw new Error('No fields found in target Feishu table.');

  if (primarySpec && primary.field_name !== primarySpec.name) {
    if (!byName.has(primarySpec.name)) {
      const updated = await updateField(primary.field_id, primarySpec.name, 1);
      changes.push({ action: 'renamed-primary', field: primarySpec.name });
      byName.delete(primary.field_name);
      byName.set(primarySpec.name, updated || { field_name: primarySpec.name, type: 1 });
      log(`✓ Primary field → ${primarySpec.name}`);
    }
  }

  for (const spec of FEISHU_FIELDS.filter(f => !f.primary)) {
    if (byName.has(spec.name)) { log(`• Exists: ${spec.name}`); continue; }
    const created = await createField(spec.name, spec.type);
    byName.set(spec.name, created || { field_name: spec.name, type: spec.type });
    changes.push({ action: 'created', field: spec.name, type: spec.type });
    log(`✓ Created: ${spec.name}`);
    await new Promise(r => setTimeout(r, 140));
  }
  return { ok: true, totalRequired: FEISHU_FIELDS.length, changes, fields: await listFields() };
}

async function createRecord(fields) {
  const c = assertConfigured();
  const data = await api(`/bitable/v1/apps/${encodeURIComponent(c.appToken)}/tables/${encodeURIComponent(c.tableId)}/records`, {
    method: 'POST', body: JSON.stringify({ fields })
  });
  return data.record || null;
}

async function updateRecord(recordId, fields) {
  const c = assertConfigured();
  const data = await api(`/bitable/v1/apps/${encodeURIComponent(c.appToken)}/tables/${encodeURIComponent(c.tableId)}/records/${encodeURIComponent(recordId)}`, {
    method: 'PUT', body: JSON.stringify({ fields })
  });
  return data.record || null;
}

async function listRecords() {
  const c = assertConfigured();
  const out = [];
  let pageToken = '';
  do {
    const qs = new URLSearchParams({ page_size: '500' });
    if (pageToken) qs.set('page_token', pageToken);
    const data = await api(`/bitable/v1/apps/${encodeURIComponent(c.appToken)}/tables/${encodeURIComponent(c.tableId)}/records?${qs}`);
    out.push(...(data.items || []));
    pageToken = data.has_more ? (data.page_token || '') : '';
  } while (pageToken);
  return out;
}

function deletedValue(record) {
  const v = record && record.fields ? record.fields['Is Deleted / 已删除'] : false;
  return v === true || String(v).toLowerCase() === 'true' || String(v) === '1';
}

async function listActiveRecords() {
  const records = await listRecords();
  return records.filter(r => !deletedValue(r));
}

async function listDeletedRecords() {
  const records = await listRecords();
  return records.filter(deletedValue);
}

async function findRecordByReference(ref, includeDeleted = true) {
  const records = await listRecords();
  return records.find(r => r && r.fields && r.fields['Registration Reference / 报名编号'] === ref && (includeDeleted || !deletedValue(r))) || null;
}

async function findActiveRecordByEmail(email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return null;
  const records = await listActiveRecords();
  return records.find(r => String((r.fields || {})['Business Email / 企业邮箱'] || '').trim().toLowerCase() === target) || null;
}

async function softDelete(recordId, actor = 'admin', reason = '') {
  return updateRecord(recordId, {
    'Is Deleted / 已删除': true,
    'Deleted At / 删除时间': new Date().toISOString(),
    'Deleted By / 删除人': String(actor || 'admin').slice(0, 120),
    'Deletion Reason / 删除原因': String(reason || '').slice(0, 500)
  });
}

async function restore(recordId) {
  return updateRecord(recordId, {
    'Is Deleted / 已删除': false,
    'Deleted At / 删除时间': '',
    'Deleted By / 删除人': '',
    'Deletion Reason / 删除原因': ''
  });
}

module.exports = {
  config, assertConfigured, tenantToken, listFields, ensureSchema,
  createRecord, updateRecord, listRecords, listActiveRecords, listDeletedRecords,
  findRecordByReference, findActiveRecordByEmail, deletedValue, softDelete, restore
};
