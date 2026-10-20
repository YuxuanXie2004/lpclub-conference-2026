'use strict';

const { renderVipPage } = require('./vip-admin');
const { renderMaterialsAdminParts } = require('./materials-pages');

// Reuse the existing operations controls in the shared shell. Each controller
// receives a panel-scoped document so its IDs and events cannot affect another tab.
function parts(page, prefix) {
  const match = page.match(/<body>([\s\S]*?)<script>([\s\S]*?)<\/script><\/body>/);
  if (!match) throw new Error('Operations panel template is incomplete');
  let html = match[1].replace(/<main[^>]*>/, '').replace('</main>', '');
  html = html.replace(/\bid="([^"]+)"/g, (_, id) => `id="${prefix}${id}"`)
    .replace(/\b(aria-labelledby|for)="([^"]+)"/g, (_, attr, id) => `${attr}="${prefix}${id}"`);
  return { html, script: match[2] };
}

function vipPanel(token) {
  const panel = parts(renderVipPage(token), 'vip-');
  panel.html = panel.html.replace(/<header>[\s\S]*?<div class="actions">([\s\S]*?)<\/div><\/header>/, '<div class="toolbar"><div class="actions">$1</div></div>')
    .replace(/<div class="tabs">[\s\S]*?<\/div>/, '');
  panel.script = panel.script.replace('function closeModal(id){', "function closeModal(id){id=id.replace(/^vip-/,'');")
    .replace(/load\(\);\s*$/, "window.LPClubOpsVip={refresh:load,close:()=>document.querySelectorAll('.modal.on').forEach(modal=>closeModal(modal.id))};");
  return panel;
}

function materialsPanel(token, initialRef = '') {
  const panel = renderMaterialsAdminParts(token, initialRef);
  panel.html = panel.html.replace(/\bid="([^"]+)"/g, (_, id) => `id="materials-${id}"`)
    .replace(/\b(aria-labelledby|for)="([^"]+)"/g, (_, attr, id) => `${attr}="materials-${id}"`);
  return panel;
}

const styles = `
[hidden],.hidden{display:none!important}.btn:disabled{opacity:.45;cursor:not-allowed}.tab:focus-visible,.btn:focus-visible,.mini:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
.ops-panel .toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap}.ops-panel .actions{align-items:center}.ops-panel .hint,.ops-panel .muted,.ops-panel small{color:var(--mut);font-size:12.5px}.ops-panel .hint{margin:8px 0}
.ops-panel input:not([type=checkbox]),.ops-panel select,.ops-panel textarea{font:inherit;border:1px solid var(--line);border-radius:9px;padding:10px 11px;background:#fff;color:var(--ink)}.ops-panel input:focus,.ops-panel textarea:focus,.ops-panel button:focus-visible{outline:2px solid var(--brand);outline-offset:2px}.ops-panel input[type=checkbox]{accent-color:var(--brand)}
.ops-panel button:not(.close){border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:9px;padding:9px 13px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}.ops-panel button.primary{background:var(--brand);color:#fff;border-color:var(--brand)}.ops-panel button.danger,.ops-panel button.bad{color:var(--bad)}.ops-panel .link{background:none!important;border:0!important;color:var(--brand)!important;padding:0!important;font-weight:700}.ops-panel .badge,.ops-panel .status{display:inline-block;border-radius:6px;padding:3px 7px;background:var(--light);color:var(--brand)}.ops-panel .badge.review,.ops-panel .badge.redeeming{color:#94600d;background:#fff4da}.ops-panel .badge.used{color:#48668d;background:#edf2fa}.ops-panel .badge.revoked,.ops-panel .badge.expired{color:var(--bad);background:#faeeee}
#vipPanel .stats{grid-template-columns:repeat(6,1fr)}#vipPanel .filters{display:flex}#vipPanel .filters input{flex:1;min-width:150px}#vipPanel .filters select{min-width:150px}.ops-panel .selection{color:var(--mut);font-size:13px}.ops-panel .pager{display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-top:14px}.ops-panel .fields{display:grid;grid-template-columns:1fr 1fr;gap:13px}.ops-panel .fields label{display:flex;flex-direction:column;gap:6px;font-size:13px}.ops-panel .fields .wide{grid-column:1/-1}.ops-panel .fields input,.ops-panel .fields textarea{width:100%}.ops-panel .card.small{max-width:480px}.ops-panel .card .actions{margin-top:16px}.ops-panel .kv dt{color:var(--mut);font-size:12px}.ops-panel .kv dd{margin:0}.ops-panel .codebox{padding:12px;border-radius:9px;background:var(--light);word-break:break-all;user-select:all;font:15px/1.6 ui-monospace,monospace}.ops-panel .notice{background:var(--light);color:var(--ink);padding:10px 12px;border-radius:9px;margin:10px 0}.ops-panel .error{color:var(--bad)}
#materialsPanel .panel{background:#fff;border:1px solid var(--line);border-radius:12px;padding:18px;margin-bottom:16px}#materialsPanel .panel.scroll{padding:0}#materialsPanel .actions input{flex:1;min-width:180px}#materialsPanel .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}#materialsPanel .grid>*{min-width:0}#materialsPanel .grid input,#materialsPanel textarea,#materialsPanel #materials-owner{width:100%}#materialsPanel label{display:block;font-size:13px;margin:10px 0}#materialsPanel h2{font-size:20px;margin:0 0 14px}#materialsPanel h3{font-size:15px;margin:12px 0 8px}#materialsPanel p{font-size:13px;overflow-wrap:anywhere}#materialsPanel .preview{display:block;width:100%;max-height:220px;object-fit:contain;margin:14px auto;background:var(--bg)}#materialsPanel pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 ui-monospace,monospace}#materialsPanel .review-card{width:min(1080px,100%);max-height:88vh}#materialsPanel .review-card>.close{position:sticky;top:0;z-index:2}#materialsPanel #materials-message:empty{display:none}#materialsPanel #materials-message{position:fixed;right:20px;bottom:20px;z-index:30;max-width:min(520px,calc(100vw - 40px));background:var(--ink);color:white;border-radius:9px;padding:11px 14px;white-space:pre-wrap}#materialsPanel .review-card .close{color:var(--ink)}.ops-panel .toast{z-index:30}
@media(max-width:900px){#vipPanel .stats{grid-template-columns:repeat(3,1fr)}#vipPanel .filters{flex-wrap:wrap}#vipPanel .filters input{flex-basis:100%}.ops-panel .fields{grid-template-columns:1fr}.ops-panel .fields .wide{grid-column:auto}#materialsPanel .grid{grid-template-columns:1fr}.ops-panel .modal{padding:10px}}`;

module.exports = { vipPanel, materialsPanel, styles };
