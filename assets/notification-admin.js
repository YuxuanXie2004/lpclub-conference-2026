'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const t = (key, params) => window.LPClubAdminI18n?.text(key, params) || key;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const label = key => window.LPClubAdminI18n?.label(key) || escape(key);
  const setText = (el, key, params) => window.LPClubAdminI18n?.setText ? window.LPClubAdminI18n.setText(el, key, params) : el.textContent = t(key, params);
  const statusKeys = { pending: 'Pending notification', processing: 'Sending', sent: 'Accepted by channel', synced: 'Synced', failed: 'Failed', blocked: 'Blocked' };
  const kindKeys = { registration: 'Registration email', supplement: 'Materials email', registration_created: 'New registration', material_uploaded: 'Materials uploaded', sync: 'Table sync' };
  const kindLabel = key => label(kindKeys[key] || key);
  const date = value => value ? new Date(value).toLocaleString(window.LPClubAdminI18n?.language === 'zh' ? 'zh-CN' : 'en-GB', { timeZone: 'Asia/Shanghai', hour12: false }) : '—';
  async function request(path, options) {
    const response = await fetch('api/admin/notifications/' + path, options);
    const data = await response.json();
    if (!response.ok || data.ok === false) throw Error(data.error || 'Unable to load notifications');
    return data;
  }
  const controllers = {};
  let active = '', detailSequence = 0, returnFocus;
  function close() {
    detailSequence++;
    for (const name of ['mail', 'feishu']) $(name + 'Drawer').hidden = true;
    returnFocus?.focus(); returnFocus = null;
  }
  for (const name of ['mail', 'feishu']) {
    const state = { page: 1, total: 0, size: 25, sequence: 0, rows: [], data: null, detail: null, retrying: false };
    const el = suffix => $(name + suffix);
    const channel = () => name === 'mail' ? 'mail' : $('feishuChannel').value || 'feishu';
    function draw() {
      const data = state.data; if (!data) return;
      const stats = data.stats || {}, success = channel() === 'sync' ? 'synced' : 'sent';
      el('Stats').innerHTML = [['Total', stats.total || 0], ['Pending notification', stats.pending || 0], ['Sending', stats.processing || 0], [success === 'synced' ? 'Synced' : 'Accepted by channel', stats[success] || 0], ['Failed / blocked', (stats.failed || 0) + (stats.blocked || 0)]].map(([key, count]) => '<div class="stat"><small>' + label(key) + '</small><b>' + escape(count) + '</b></div>').join('');
      const status = el('Status').value, kind = el('Kind').value;
      const statuses = ['pending', 'processing', success, 'failed', ...(name === 'feishu' ? ['blocked'] : [])];
      el('Status').innerHTML = '<option value="">' + escape(t('All statuses')) + '</option>' + statuses.map(key => '<option value="' + key + '">' + escape(t(statusKeys[key])) + '</option>').join('');
      el('Status').value = status;
      el('Kind').innerHTML = '<option value="">' + escape(t('All types')) + '</option>' + (data.kinds || []).map(key => '<option value="' + escape(key) + '">' + escape(t(kindKeys[key] || key)) + '</option>').join('');
      el('Kind').value = kind;
      el('Rows').innerHTML = state.rows.length ? state.rows.map(row => '<tr><td><button class="link" data-detail="' + escape(row.id) + '">' + escape(row.ref) + '</button></td><td>' + escape(row.full_name) + '</td><td>' + kindLabel(row.kind) + '</td><td>' + (channel() === 'feishu' ? label('Feishu bot') : escape(row.target || '—')) + '</td><td>' + escape(row.subject || '—') + '</td><td><span class="notification-badge ' + escape(row.status) + '">' + label(statusKeys[row.status] || row.status) + '</span></td><td>' + escape(date(row.createdAt)) + '</td><td>' + escape(date(row.sentAt)) + '</td><td>' + escape(row.attempts || 0) + '</td><td><button class="mini" data-detail="' + escape(row.id) + '">' + label('Details') + '</button>' + (['failed', 'blocked'].includes(row.status) ? ' <button class="mini" data-retry="' + escape(row.id) + '">' + label('Retry failed notification') + '</button>' : '') + '</td></tr>').join('') : '<tr><td class="empty" colspan="10">' + label('No notification records') + '</td></tr>';
      el('Previous').disabled = state.page <= 1;
      el('Next').disabled = state.page * state.size >= state.total;
      setText(el('PageInfo'), 'Page {page} / {pages} · Total {total}', { page: state.page, pages: Math.max(1, Math.ceil(state.total / state.size)), total: state.total });
      el('Connection').innerHTML = label(name === 'mail' ? (data.configured ? 'Email configured · SMTP acceptance does not confirm delivery or reading' : 'Email sending is not configured') : 'Notification and table sync states are tracked separately');
      if (data.lastSuccess) el('Connection').innerHTML += ' · ' + label('Last success') + ': ' + escape(date(data.lastSuccess));
      if (state.detail && !el('Drawer').hidden) drawDetail(state.detail);
    }
    async function load() {
      const sequence = ++state.sequence, selectedChannel = channel();
      const params = new URLSearchParams({ q: el('Search').value, status: el('Status').value, kind: el('Kind').value, from: el('From').value, to: el('To').value, page: String(state.page), pageSize: String(state.size) });
      el('Rows').setAttribute('aria-busy', 'true');
      setText(el('Message'), 'Loading notifications…');
      try {
        const data = await request(selectedChannel + '?' + params);
        if (sequence !== state.sequence || selectedChannel !== channel()) return;
        state.rows = data.rows || []; state.total = data.total || 0; state.size = data.pageSize || 25;
        if (state.page > 1 && state.total <= (state.page - 1) * state.size) { state.page = Math.max(1, Math.ceil(state.total / state.size)); return load(); }
        state.data = data; draw(); setText(el('Message'), '');
      } catch (error) {
        if (sequence === state.sequence) {
          state.rows = []; state.data = null; el('Stats').innerHTML = ''; el('Rows').innerHTML = ''; el('PageInfo').textContent = '';
          el('Previous').disabled = el('Next').disabled = true; setText(el('Message'), error.message);
        }
      } finally { if (sequence === state.sequence) el('Rows').setAttribute('aria-busy', 'false'); }
    }
    function drawDetail(detail) {
      const fields = [['Reference', detail.ref], ['Name', detail.full_name], ['Recipient / target', detail.content?.to || detail.target], ['Status', t(statusKeys[detail.status] || detail.status || '')], ['Notification type', t(kindKeys[detail.kind] || detail.kind || '')], ['Triggered at', date(detail.createdAt)], ['Sent / synced at', date(detail.sentAt)], ['Attempts this cycle', detail.attempts || 0], ['Next attempt', date(detail.nextAttemptAt)], ['Error reason', detail.last_error || '—']];
      if (channel() === 'sync') fields.push(['Desired version', detail.desired_version], ['Synced version', detail.synced_version]);
      if (detail.content?.subject) fields.push(['Subject', detail.content.subject]);
      if (detail.content?.cc) fields.push(['CC', detail.content.cc]);
      const card = detail.content?.card;
      const content = channel() === 'mail' ? detail.content?.text : card ? [card.header?.title?.content, ...(card.elements || []).map(item => item.text?.content)].filter(Boolean).join('\n\n') : '';
      const missing = channel() === 'sync' ? 'Sync records reflect the current sync state' : detail.contentError || 'Historical content is unavailable';
      el('Detail').innerHTML = '<div class="kv">' + fields.map(([key, value]) => '<b>' + label(key) + '</b><span>' + escape(typeof value === 'object' ? JSON.stringify(value) : value ?? '—') + '</span>').join('') + '</div><h3>' + label('Notification content') + '</h3><pre>' + (content ? escape(content) : label(missing)) + '</pre><h3>' + label('Manual retry history') + '</h3>' + (detail.history?.length ? '<ul>' + detail.history.map(item => '<li>' + escape(date(item.at)) + ' · ' + label('Attempts before retry') + ': ' + escape(item.previousAttempts) + ' · ' + escape(item.previousError || '—') + '</li>').join('') + '</ul>' : '<p>' + label('No manual retries recorded') + '</p>') + '<button class="btn" data-registration="' + escape(detail.ref) + '">' + label('View registration') + '</button>';
    }
    async function details(id, button) {
      const sequence = ++detailSequence, selectedChannel = channel();
      try {
        const detail = await request(selectedChannel + '/' + encodeURIComponent(id));
        if (sequence !== detailSequence || active !== name || selectedChannel !== channel()) return;
        state.detail = detail; returnFocus = button; drawDetail(detail); el('Drawer').hidden = false; el('Close').focus();
      } catch (error) { if (sequence === detailSequence) setText(el('Message'), error.message); }
    }
    async function retry(id, button) {
      if (state.retrying) return;
      state.retrying = true; button.disabled = true;
      try {
        await request(channel() + '/' + encodeURIComponent(id) + '/retry', { method: 'POST' });
        await load(); setText(el('Message'), 'Notification queued for retry');
        if (name === 'feishu') window.LPClubFeishuStatus?.refresh();
      } catch (error) { setText(el('Message'), error.message); }
      finally { state.retrying = false; button.disabled = false; }
    }
    el('Rows').addEventListener('click', event => {
      const button = event.target.closest('button'); if (!button) return;
      if (button.dataset.detail) return details(button.dataset.detail, button);
      if (button.dataset.retry) return retry(button.dataset.retry, button);
    });
    el('Detail').addEventListener('click', event => {
      const button = event.target.closest('[data-registration]');
      if (button) { close(); window.LPClubOpenRegistration?.(button.dataset.registration); }
    });
    el('Close').onclick = close;
    el('Drawer').addEventListener('click', event => { if (event.target === el('Drawer')) close(); });
    el('Drawer').addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.stopPropagation(); close(); }
      if (event.key === 'Tab') {
        const nodes = [el('Close'), ...el('Detail').querySelectorAll('button')], first = nodes[0], last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    el('Refresh').onclick = () => { state.page = 1; return load(); };
    el('Previous').onclick = () => { if (state.page > 1) { state.page--; return load(); } };
    el('Next').onclick = () => { if (state.page * state.size < state.total) { state.page++; return load(); } };
    let timer;
    el('Search').addEventListener('input', () => { clearTimeout(timer); state.page = 1; timer = setTimeout(load, 250); });
    for (const suffix of ['Status', 'Kind', 'From', 'To']) el(suffix).addEventListener('change', () => { state.page = 1; return load(); });
    if (name === 'feishu') $('feishuChannel').addEventListener('change', () => { close(); state.page = 1; el('Status').value = el('Kind').value = ''; return load(); });
    controllers[name] = { load, draw };
  }
  window.LPClubNotifications = {
    activate(name) { if (!controllers[name]) return; close(); active = name; controllers[name].load(); if (name === 'feishu') window.LPClubFeishuStatus?.refresh(); },
    close,
    translate() { for (const controller of Object.values(controllers)) controller.draw(); window.LPClubFeishuStatus?.translate?.(); }
  };
})();
