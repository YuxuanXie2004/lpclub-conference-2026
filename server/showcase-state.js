'use strict';
const EVENT = 'conference-2026';
const PUBLIC_KINDS = ['logo', 'portrait'];
const fail = (message, statusCode = 400, code) => Object.assign(new Error(message), { statusCode, ...(code ? { code } : {}) });
function objectJSON(value) {
  let result;
  try { result = typeof value === 'string' ? JSON.parse(value) : value; } catch (_) {}
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw fail('Materials data needs administrator repair', 503);
  return result;
}
function text(value, language = 'en', fallback = '') {
  if (typeof value === 'string') return value.trim().slice(0, 200);
  if (value && typeof value === 'object') {
    for (const key of [language, language === 'zh' ? 'en' : 'zh']) if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim().slice(0, 200);
  }
  return String(fallback || '').trim().slice(0, 200);
}
function profile(row, draft = {}) {
  return { name: text(draft.name, row.language, row.full_name), title: text(draft.title, row.language, row.job_title), company: text(draft.company, row.language, row.company) };
}
async function lockItems(tx, registrationIds) {
  if (!registrationIds.length) return [];
  const ids = (await tx.query('SELECT id FROM material_items WHERE registration_id IN (?)', [registrationIds])).map(item => item.id).sort();
  const items = [];
  // Primary-key reads avoid relying on the optimiser's scan and filesort lock order.
  for (const id of ids) {
    const item = (await tx.query('SELECT * FROM material_items WHERE id=? FOR UPDATE', [id]))[0];
    if (item) items.push(item);
  }
  return items;
}
async function bumpBoards(tx, kinds, event = EVENT) {
  for (const kind of PUBLIC_KINDS.filter(kind => kinds.includes(kind))) {
    await tx.query('SELECT revision FROM showcase_boards WHERE event_key=? AND kind=? FOR UPDATE', [event, kind]);
    await tx.query('UPDATE showcase_boards SET revision=revision+1 WHERE event_key=? AND kind=?', [event, kind]);
  }
}
async function takeDown(tx, items, event = EVENT) {
  const ids = items.filter(item => PUBLIC_KINDS.includes(item.kind)).map(item => item.id);
  if (!ids.length) return;
  await bumpBoards(tx, items.map(item => item.kind), event);
  await tx.query('UPDATE showcase_entries SET enabled=0,published_version_id=NULL WHERE item_id IN (?)', [ids]);
}
module.exports = { EVENT, PUBLIC_KINDS, fail, objectJSON, text, profile, lockItems, bumpBoards, takeDown };
