'use strict';
const { deploymentPrefix } = require('./public-paths');
const { EVENT, PUBLIC_KINDS, fail, objectJSON, profile, lockItems, bumpBoards } = require('./showcase-state');
const { validateCrop } = require('../assets/image-crop');
const conflict = message => fail(message || 'The showcase changed; refresh before saving', 409, 'VERSION_CONFLICT');
function createShowcaseService({ db, env = process.env, materials } = {}) {
  function ready(kind) {
    if (!PUBLIC_KINDS.includes(kind)) throw fail('Invalid showcase kind');
    if (!materials?.ready()) throw fail('Materials are not configured', 503);
  }
  const select = `SELECT s.*,m.registration_id,m.row_version AS material_revision,m.approved_version_id,m.current_version_id,
    r.ref,r.status AS admission_status,r.is_deleted,r.deleted_at,r.option_id,r.language,r.full_name,r.job_title,r.company,
    c.granted,v.id AS version_id,v.version_no,v.status AS version_status,g.ref AS organisation_ref
    FROM showcase_entries s JOIN material_items m ON m.id=s.item_id JOIN registrations r ON r.id=m.registration_id
    LEFT JOIN publication_consents c ON c.registration_id=r.id AND c.kind=s.kind
    LEFT JOIN material_versions v ON v.id=VERSION_COLUMN AND v.item_id=m.id
    LEFT JOIN registrations g ON g.id=s.org_key AND g.event_key=s.event_key
    WHERE s.event_key=? AND r.event_key=s.event_key AND s.kind=?`;
  async function rows(connection, kind, published, extra = '', args = [], locking = false) {
    const query = locking ? select.replace('g.ref AS organisation_ref', 'NULL AS organisation_ref').replace(/    LEFT JOIN registrations g[^\n]+\n/, '') : select;
    return connection.query(query.replace('VERSION_COLUMN', published ? 's.published_version_id' : 'm.approved_version_id') + extra + (locking ? ' FOR UPDATE' : ''), [EVENT, kind, ...args]);
  }
  function card(row, published = false) {
    const config = objectJSON(row.config_json), configValue = published ? config.published || {} : config.draft || {};
    const draft = config.draft || {}, publishedText = profile(row, config.published || {});
    const draftText = profile(row, Object.fromEntries(['name', 'title', 'company'].map(key => [key, Object.hasOwn(draft, key) ? draft[key] : config.published?.[key]])));
    const blockedReasons = [];
    if (row.is_deleted || row.deleted_at) blockedReasons.push('REGISTRATION_DELETED');
    if (row.admission_status !== 'Approved') blockedReasons.push(['Cancelled', 'Rejected'].includes(row.admission_status) ? 'REGISTRATION_INACTIVE' : 'ADMISSION_PENDING');
    if (row.granted !== 1) blockedReasons.push('CONSENT_REQUIRED');
    if (row.kind === 'portrait' && !['speaking', 'panel'].includes(row.option_id)) blockedReasons.push('PACKAGE_INELIGIBLE');
    if (!row.version_id || row.version_status !== 'approved') blockedReasons.push('MATERIAL_NOT_APPROVED');
    return { entryId: row.id, ref: row.ref, registrationId: row.registration_id, materialRevision: row.material_revision,
      versionId: row.version_id || null, version: row.version_no || 0, latestApprovedVersionId: row.approved_version_id || null,
      hasNewVersion: published && !!row.approved_version_id && row.approved_version_id !== row.version_id,
      ...profile(row, configValue), ...(published ? { draftText, hasTextChanges: ['name', 'title', 'company'].some(key => draftText[key] !== publishedText[key]) } : {}), crop: configValue.crop?.[row.kind] || { x: .5, y: .5 },
      eligible: blockedReasons.length === 0, blockedReasons,
      previewUrl: row.version_id ? deploymentPrefix(env.PUBLIC_BASE_URL) + '/api/admin/materials/' + encodeURIComponent(row.ref) + '/preview/' + row.kind + '?versionId=' + encodeURIComponent(row.version_id) + '&fit=contain' : '',
      published: !!row.enabled && !!row.published_version_id, ...(row.kind === 'logo' && row.organisation_ref ? { organisationRef: row.organisation_ref } : {}) };
  }
  async function board(kind) {
    ready(kind);
    const state = (await db.query('SELECT revision FROM showcase_boards WHERE event_key=? AND kind=?', [EVENT, kind]))[0];
    if (!state) throw fail('Showcase data needs administrator repair', 503);
    return { kind, revision: state.revision, items: (await rows(db, kind, true, ' AND s.enabled=1 ORDER BY s.sort_order,s.id')).map(row => card(row, true)) };
  }
  async function candidates(kind, options = {}) {
    ready(kind);
    const page = Math.max(1, Math.min(1000000, Math.floor(Number(options.page) || 1))), pageSize = Math.max(1, Math.min(100, Math.floor(Number(options.pageSize) || 50)));
    const where = ["r.is_deleted=0", "r.deleted_at IS NULL", "r.status NOT IN ('Cancelled','Rejected')", "v.status='approved'"], args = [];
    if (options.q && String(options.q).trim()) {
      const query = '%' + String(options.q).trim().slice(0, 180).replace(/[\\%_]/g, '\\$&') + '%';
      const columns = ['r.ref', 'r.full_name', 'r.company', 'r.job_title', "JSON_UNQUOTE(JSON_EXTRACT(s.config_json,'$.draft.name'))", "JSON_UNQUOTE(JSON_EXTRACT(s.config_json,'$.draft.company'))"];
      where.push('(' + columns.map(column => column + ' LIKE ?').join(' OR ') + ')'); args.push(...columns.map(() => query));
    }
    const clause = ' AND ' + where.join(' AND ');
    const countQuery = select.replace(/^SELECT[\s\S]*?FROM showcase_entries/, 'SELECT COUNT(*) AS total FROM showcase_entries').replace('VERSION_COLUMN', 'm.approved_version_id');
    const total = Number((await db.query(countQuery + clause, [EVENT, kind, ...args]))[0].total);
    const result = await rows(db, kind, false, clause + ' ORDER BY r.submitted_at DESC,r.id LIMIT ? OFFSET ?', [...args, pageSize, (page - 1) * pageSize]);
    return { kind, rows: result.map(row => card(row)), total, page, pageSize };
  }

  async function save(kind, payload) {
    ready(kind);
    if (!payload || !Number.isInteger(payload.revision) || !Array.isArray(payload.items) || payload.items.length > 1000) throw fail('Invalid showcase board');
    const ids = new Set();
    for (const value of payload.items) {
      if (!value || typeof value.entryId !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.entryId) || typeof value.versionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.versionId) || !Number.isInteger(value.materialRevision)) throw fail('Invalid showcase item');
      if (ids.has(value.entryId)) throw fail('Duplicate showcase item'); ids.add(value.entryId);
      for (const key of ['name', 'title', 'company']) if (typeof value[key] !== 'string' || value[key].length > 200) throw fail('Display text must be a string of at most 200 characters');
      validateCrop(value.crop);
      if (value.organisationRef !== undefined && (kind !== 'logo' || typeof value.organisationRef !== 'string' || !value.organisationRef || value.organisationRef.length > 100)) throw fail('Invalid organisation reference');
    }
    try {
      await db.transaction(async tx => {
        // Enumerate without locks, then lock every registration before any material and the board last.
        const involved = await tx.query('SELECT m.registration_id FROM showcase_entries s JOIN material_items m ON m.id=s.item_id WHERE s.event_key=? AND s.kind=? AND (s.enabled=1' + (ids.size ? ' OR s.id IN (?)' : '') + ')', [EVENT, kind, ...(ids.size ? [[...ids]] : [])]);
        const organisationRefs = [...new Set(payload.items.map(item => item.organisationRef).filter(Boolean))];
        const groups = organisationRefs.length ? await tx.query('SELECT id FROM registrations WHERE event_key=? AND ref IN (?)', [EVENT, organisationRefs]) : [];
        const registrationIds = [...new Set([...involved.map(row => row.registration_id), ...groups.map(row => row.id)])].sort();
        for (const id of registrationIds) await tx.query('SELECT id FROM registrations WHERE id=? FOR UPDATE', [id]);
        const locked = await lockItems(tx, registrationIds);
        const boardRow = (await tx.query('SELECT revision FROM showcase_boards WHERE event_key=? AND kind=? FOR UPDATE', [EVENT, kind]))[0];
        if (!boardRow || boardRow.revision !== payload.revision) throw conflict();
        const selected = ids.size ? await rows(tx, kind, false, ' AND s.id IN (?)', [[...ids]], true) : [];
        if (selected.length !== ids.size) throw fail('Showcase item not found', 404);
        const selectedMap = new Map(selected.map(row => [row.id, row])), locks = new Map(locked.map(item => [item.id, item]));
        const next = [];
        for (const input of payload.items) {
          const row = selectedMap.get(input.entryId);
          if (locks.get(row.item_id)?.row_version !== input.materialRevision) throw conflict('The material changed; refresh before saving');
          const version = (await tx.query('SELECT id,version_no,status FROM material_versions WHERE id=? AND item_id=? FOR UPDATE', [input.versionId, row.item_id]))[0];
          if (!version || version.status !== 'approved') throw conflict('This version is no longer approved');
          const candidate = card({ ...row, version_id: version.id, version_no: version.version_no, version_status: version.status });
          if (!candidate.eligible) throw fail('This material is not eligible for publication', 409, candidate.blockedReasons[0]);
          let orgKey = row.org_key || row.registration_id;
          if (input.organisationRef) {
            const group = (await tx.query("SELECT s.org_key,m.registration_id,r.status,r.is_deleted,r.deleted_at FROM showcase_entries s JOIN material_items m ON m.id=s.item_id JOIN registrations r ON r.id=m.registration_id WHERE s.event_key=? AND s.kind='logo' AND r.ref=? FOR UPDATE", [EVENT, input.organisationRef]))[0];
            if (!group) throw fail('Organisation registration not found', 400);
            const existingAssociation = group.registration_id === row.org_key;
            const inactive = group.is_deleted || group.deleted_at || ['Rejected', 'Cancelled'].includes(group.status);
            if (inactive && !existingAssociation) throw fail('Organisation registration not found', 400);
            // A group's identity survives its original registration's admission lifecycle.
            orgKey = existingAssociation ? row.org_key : group.org_key || group.registration_id;
          }
          next.push({ input, row, orgKey });
        }
        if (kind === 'logo' && new Set(next.map(item => item.orgKey)).size !== next.length) throw fail('Only one logo per organisation may be published', 409, 'ORGANISATION_ALREADY_PUBLISHED');
        const previousEntries = await tx.query('SELECT item_id FROM showcase_entries WHERE event_key=? AND kind=? AND enabled=1 FOR UPDATE', [EVENT, kind]);
        // Disable first so swapping representatives of an organisation cannot hit the generated unique key mid-save.
        await tx.query('UPDATE showcase_entries SET enabled=0,published_version_id=NULL WHERE event_key=? AND kind=? AND enabled=1', [EVENT, kind]);
        for (const [index, { input, row, orgKey }] of next.entries()) {
          const config = objectJSON(row.config_json), published = { name: input.name.trim(), title: input.title.trim(), company: input.company.trim(), crop: { [kind]: validateCrop(input.crop) }, orgKey };
          const oldText = profile(row, config.published || {}), draft = { ...(config.draft || {}) };
          for (const key of ['name', 'title', 'company']) {
            // A reorder must not discard review edits that the administrator has not adopted yet.
            if (!Object.hasOwn(draft, key) || published[key] !== oldText[key] || profile(row, draft)[key] === oldText[key]) draft[key] = published[key];
          }
          const oldCrop = config.published?.crop?.[kind] || { x: .5, y: .5 }, draftCrop = draft.crop?.[kind] || oldCrop;
          const equalPoint = (a, b) => a.x === b.x && a.y === b.y && (a.zoom || 1) === (b.zoom || 1);
          if (!draft.crop?.[kind] || !equalPoint(input.crop, oldCrop) || equalPoint(draftCrop, oldCrop)) draft.crop = { ...(draft.crop || {}), [kind]: published.crop[kind] };
          await tx.query('UPDATE showcase_entries SET enabled=1,published_version_id=?,config_json=?,sort_order=?,org_key=? WHERE id=?', [input.versionId, JSON.stringify({ ...config, draft, published }), index, orgKey, row.id]);
          await tx.query('UPDATE registrations SET row_version=row_version+1 WHERE id=?', [row.registration_id]);
          await tx.query('UPDATE material_items SET row_version=row_version+1 WHERE id=?', [row.item_id]);
          await tx.query('INSERT INTO audit_events(registration_id,action,actor,detail) VALUES (?,?,?,?)', [row.registration_id, 'publish', 'administrator', JSON.stringify({ kind, versionId: input.versionId, sort: index })]);
        }
        // Removed entries also invalidate stale saved cards.
        const removed = previousEntries.filter(item => !next.some(value => value.row.item_id === item.item_id));
        for (const item of removed) await tx.query('UPDATE material_items SET row_version=row_version+1 WHERE id=?', [item.item_id]);
        await bumpBoards(tx, [kind]);
      });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw fail('Only one logo per organisation may be published', 409, 'ORGANISATION_ALREADY_PUBLISHED');
      throw error;
    }
    return board(kind);
  }
  return { board, candidates, save };
}
module.exports = { createShowcaseService };
