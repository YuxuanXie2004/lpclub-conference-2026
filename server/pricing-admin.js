'use strict';

const { helpers: languageHelpers } = require('./admin-i18n');
const { BASE_PRICES, IDENTITIES, OPTION_LABELS, clonePrices } = require('./packages');

function renderPricingPage(token) {
  const back = '';
  const current = clonePrices(BASE_PRICES);

  // Column definitions: Options
  const columns = Object.entries(OPTION_LABELS).map(([optId, [label]]) => ({
    id: optId,
    label
  }));

  // Row definitions: Identities
  const rows = Object.values(IDENTITIES);

  return String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>LP CLUB · Registration Pricing</title><style>
:root{--ink:#10261a;--mut:#64776b;--line:#dfe8e2;--brand:#205f40;--light:#eef5f0;--bg:#f5f8f6;--bad:#9d3f36;--warn:#94600d;--warn-bg:#fff4da}
*{box-sizing:border-box}body{margin:0;padding:26px 20px 60px;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:var(--ink);background:var(--bg)}
.wrap{max-width:1500px;margin:auto}
header{display:flex;gap:18px;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;margin-bottom:18px}
h1{margin:0;font-size:23px}
.sub{color:var(--mut);font-size:12.5px;margin-top:4px}
.actions{display:flex;gap:9px;align-items:center;flex-wrap:wrap}
.btn{border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:9px;padding:9px 13px;font-weight:700;text-decoration:none;cursor:pointer;font-size:13px;display:inline-flex;align-items:center;gap:6px}
.btn:hover{background:#f9fbf9}
.btn.primary{background:var(--brand);color:#fff;border-color:var(--brand)}
.btn.primary:hover{background:#184a32}
.btn.bad{color:var(--bad)}
.btn.bad:hover{background:#faeeee}
.btn:disabled{opacity:.45;cursor:not-allowed}
.tabs{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}
.tab{display:inline-block;color:var(--ink);text-decoration:none;border:1px solid var(--line);background:#fff;border-radius:999px;padding:8px 13px;font-weight:700;cursor:pointer}
.tab.on{background:var(--brand);color:#fff;border-color:var(--brand)}
.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:0 0 16px}
.stat{background:#fff;border:1px solid var(--line);border-radius:12px;padding:13px}
.stat small{display:block;color:var(--mut)}
.stat b{font-size:22px;color:var(--brand)}
.stat.warning b{color:var(--warn)}
.panel{background:#fff;border:1px solid var(--line);border-radius:12px;padding:20px;margin-bottom:16px}
.hint{color:var(--mut);font-size:13px;margin:0 0 16px}
.pricing-table-wrap{overflow:visible;border:1px solid var(--line);border-radius:12px;background:#fff}
table{border-collapse:collapse;table-layout:fixed;width:100%;min-width:0;font-size:12.5px}
th,td{padding:10px 8px;text-align:left;border-bottom:1px solid var(--line);vertical-align:middle;overflow-wrap:anywhere}
thead th{background:#edf4ef;font-weight:700}
thead th:first-child{width:23%}
tbody td:first-child{background:#fff;font-weight:600;border-right:1px solid var(--line)}
tbody tr:hover{background:#fafcfb}
tbody tr:hover td:first-child{background:#fafcfb}
.price-box{display:flex;flex-direction:column;gap:5px;min-width:0}
.price-input-wrap{display:flex;align-items:center;position:relative}
.currency{position:absolute;left:8px;color:var(--mut);font-size:10.5px;font-weight:700;pointer-events:none}
.price-input{width:100%;padding:7px 7px 7px 37px;border:1px solid var(--line);border-radius:7px;font:inherit;font-weight:700;color:var(--ink);background:#fff;font-size:12.5px}
.price-input:focus{outline:2px solid var(--brand);outline-offset:2px;border-color:var(--brand)}
.price-input.dirty{border-color:var(--warn);background:var(--warn-bg)}
.admin-language{display:inline-flex;border:1px solid var(--line);border-radius:9px;overflow:hidden;background:#fff}
.admin-language button{border:0;padding:9px 12px;background:transparent;color:var(--ink);font:inherit;font-weight:700;cursor:pointer}
.admin-language button[aria-pressed="true"]{background:var(--brand);color:#fff}
.admin-language button:focus-visible{outline:2px solid var(--brand);outline-offset:-3px}
.toast{position:fixed;right:20px;bottom:20px;max-width:min(520px,calc(100vw - 40px));background:var(--ink);color:white;padding:12px 15px;border-radius:9px;opacity:0;transform:translateY(8px);transition:.2s;pointer-events:none;z-index:30}
.toast.on{opacity:1;transform:none}
.toast.bad{background:var(--bad)}
.status-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:14px}
.dirty-indicator{display:inline-flex;align-items:center;gap:6px;color:var(--warn);font-size:13px;font-weight:700}
.dirty-indicator::before{content:'';display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--warn)}
@media(max-width:900px){.stats{grid-template-columns:repeat(2,1fr)}.wrap{padding:16px 10px 40px}th,td{padding:8px 5px;font-size:11px}.price-input{padding-left:6px}.currency{display:none}}
</style></head><body><main class="wrap">
<header>
  <div>
    <h1 data-admin-i18n="Registration Pricing · 报名价格设置">Registration Pricing · 报名价格设置</h1>
    <div class="sub" data-admin-i18n="Conference registration pricing · 竖向为报名身份，横向为参会方式">Conference registration pricing · 竖向为报名身份，横向为参会方式</div>
  </div>
  <div class="actions">
    <button class="btn" id="refresh" data-admin-i18n="Refresh">Refresh</button>
    <button class="btn bad" id="resetDefaults" data-admin-i18n="Reset to Defaults">Reset to Defaults</button>
    <button class="btn primary" id="savePrices" data-admin-i18n="Save Prices">Save Prices</button>
  </div>
</header>

<div class="tabs" role="tablist" aria-label="Operations sections">
  <a id="activeTab" class="tab" href="table${back}" data-admin-i18n="Active Registrations">Active Registrations</a>
  <a id="deletedTab" class="tab" href="table${back ? back + '&mode=deleted' : '?mode=deleted'}" data-admin-i18n="Deleted / 回收站">Deleted / 回收站</a>
  <a id="vipTab" class="tab" href="vip-codes${back}" data-admin-i18n="VIP Codes">VIP Codes</a>
  <a id="materialsTab" class="tab" href="materials-admin${back}" data-admin-i18n="Materials / 资料审核">Materials / 资料审核</a>
  <a id="pricingTab" class="tab on" aria-current="page" href="pricing-admin${back}" data-admin-i18n="Pricing / 价格设置">Pricing / 价格设置</a>
</div>

<div class="stats" id="stats" aria-label="Pricing matrix statistics">
  <div class="stat"><small data-admin-i18n="Total Packages">Total Packages</small><b id="statTotal">20</b></div>
  <div class="stat"><small data-admin-i18n="Identities">Identities</small><b id="statIdentities">5</b></div>
  <div class="stat"><small data-admin-i18n="Participation Options">Participation Options</small><b id="statOptions">4</b></div>
  <div class="stat"><small data-admin-i18n="Complimentary Packages">Complimentary Packages</small><b id="statFree">0</b></div>
  <div class="stat" id="statDirtyWrap"><small data-admin-i18n="Unsaved changes">Unsaved changes</small><b id="statDirty">0</b></div>
</div>

<div class="panel">
  <p class="hint" data-admin-i18n="竖向为报名身份，横向为参会方式。支持直接编辑各套餐的报名价格（USD），点击保存后实时生效。">竖向为报名身份，横向为参会方式。支持直接编辑各套餐的报名价格（USD），点击保存后实时生效。</p>
  <div class="pricing-table-wrap">
    <table id="pricingTable" aria-label="Registration Pricing Matrix">
      <thead>
        <tr>
          <th data-admin-i18n="Registration Identity / 报名身份">Registration Identity / 报名身份</th>
          ${columns.map(c => `<th><span data-admin-i18n="${c.label}">${c.label}</span></th>`).join('')}
        </tr>
      </thead>
      <tbody id="pricingBody">
        ${rows.map(row => `
        <tr data-identity="${row.id}">
          <td>
            <div data-admin-i18n="${row.name}">${row.name}</div>
          </td>
          ${columns.map(col => {
            const val = current[row.id]?.[col.id] ?? 0;
            return `
            <td>
              <div class="price-box">
                <div class="price-input-wrap">
                  <span class="currency">USD</span>
                  <input type="number" min="0" step="100" class="price-input"
                    data-identity="${row.id}" data-option="${col.id}"
                    data-original="${val}" value="${val}"
                    aria-label="${row.name} - ${col.label}">
                </div>
              </div>
            </td>`;
          }).join('')}
        </tr>`).join('')}
      </tbody>
    </table>
  </div>
  <div class="status-bar">
    <div id="dirtyNotice" class="dirty-indicator" style="display:none;" data-admin-i18n="Unsaved changes">Unsaved changes</div>
    <div style="flex:1"></div>
    <button class="btn primary" id="bottomSavePrices" data-admin-i18n="Save Prices">Save Prices</button>
  </div>
</div>
</main>

<div class="toast" id="toast" role="status" aria-live="polite"></div>

<script>

const $ = id => document.getElementById(id);
${languageHelpers}

let initialPrices = ${JSON.stringify(current).replace(/</g, '\\u003c')};
let activePrices = JSON.parse(JSON.stringify(initialPrices));
let toastTimer = null;
let currentRevision = null;
let pricingRequest = 0;

function e(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}

function toast(message, isBad = false) {
  const el = $('toast');
  setText(el, message);
  el.classList.toggle('bad', Boolean(isBad));
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 3500);
}

function hasDirtyInputs() {
  return Array.from(document.querySelectorAll('.price-input')).some(input =>
    String(input.value).trim() !== String(input.dataset.original)
  );
}

function recalculateStats() {
  const inputs = document.querySelectorAll('.price-input');
  let freeCount = 0;
  let dirtyCount = 0;

  inputs.forEach(input => {
    const val = Number(input.value);
    const orig = Number(input.dataset.original);
    const isDirty = val !== orig;

    if (val === 0) freeCount++;
    if (isDirty) dirtyCount++;

    input.classList.toggle('dirty', isDirty);
  });

  $('statFree').textContent = freeCount;
  $('statDirty').textContent = dirtyCount;
  const hasDirty = dirtyCount > 0;
  $('dirtyNotice').style.display = hasDirty ? 'inline-flex' : 'none';
  $('statDirtyWrap').classList.toggle('warning', hasDirty);
}

function collectPricesFromInputs() {
  const result = {};
  const inputs = document.querySelectorAll('.price-input');
  for (const input of inputs) {
    const identity = input.dataset.identity;
    const option = input.dataset.option;
    const raw = String(input.value ?? '').trim();
    const val = Number(raw);
    if (!raw || !Number.isFinite(val) || val < 0 || !Number.isInteger(val)) {
      input.focus();
      throw new Error(t('Price must be a non-negative integer'));
    }
    if (!result[identity]) result[identity] = {};
    result[identity][option] = val;
  }
  return result;
}

function applyPricesToDOM(prices, revision) {
  const inputs = document.querySelectorAll('.price-input');
  inputs.forEach(input => {
    const identity = input.dataset.identity;
    const option = input.dataset.option;
    const val = Number(prices[identity]?.[option] ?? 0);
    input.value = val;
    input.dataset.original = val;
  });
  initialPrices = JSON.parse(JSON.stringify(prices));
  activePrices = JSON.parse(JSON.stringify(prices));
  currentRevision = Number(revision);
  recalculateStats();
}

async function fetchPricing({ preserveDirty = false, silent = false } = {}) {
  if (preserveDirty && hasDirtyInputs()) return;
  if (!preserveDirty && hasDirtyInputs() && !confirm(t('Discard unsaved price changes?'))) return;
  const request = ++pricingRequest;
  try {
    const res = await fetch('api/admin/pricing', {
      credentials: 'same-origin'
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load pricing');
    if (request !== pricingRequest || (preserveDirty && hasDirtyInputs())) return;
    applyPricesToDOM(data.prices, data.revision);
    if (!silent) toast('Loaded pricing configuration');
  } catch (err) {
    if (request !== pricingRequest) return;
    toast(err.message, true);
  }
}

async function savePrices() {
  let payload;
  try {
    payload = collectPricesFromInputs();
  } catch (err) {
    toast(err.message, true);
    return;
  }
  if (currentRevision === null) {
    toast(t('Pricing is loading. Please wait.'), true);
    return;
  }

  const buttons = [$('savePrices'), $('bottomSavePrices')];
  buttons.forEach(b => { b.disabled = true; setText(b, 'Saving…'); });

  try {
    const res = await fetch('api/admin/pricing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prices: payload, revision: currentRevision })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      const error = new Error(data.error || 'Failed to save prices');
      error.code = data.code;
      throw error;
    }
    applyPricesToDOM(data.prices, data.revision);
    toast('Prices saved successfully');
  } catch (err) {
    toast(err.code === 'VERSION_CONFLICT'
      ? t('Pricing was changed by another administrator. Refresh before saving.')
      : err.message, true);
  } finally {
    buttons.forEach(b => { b.disabled = false; setText(b, 'Save Prices'); });
  }
}

async function resetDefaults() {
  if (!confirm(t('Reset all prices to the initial base prices?'))) return;
  if (currentRevision === null) {
    toast(t('Pricing is loading. Please wait.'), true);
    return;
  }
  const btn = $('resetDefaults');
  btn.disabled = true;
  try {
    const res = await fetch('api/admin/pricing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reset: true, revision: currentRevision })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      const error = new Error(data.error || 'Failed to reset prices');
      error.code = data.code;
      throw error;
    }
    applyPricesToDOM(data.prices, data.revision);
    toast('Reset to default prices successfully');
  } catch (err) {
    toast(err.code === 'VERSION_CONFLICT'
      ? t('Pricing was changed by another administrator. Refresh before saving.')
      : err.message, true);
  } finally {
    btn.disabled = false;
  }
}

document.querySelectorAll('.price-input').forEach(input => {
  input.addEventListener('input', recalculateStats);
  input.addEventListener('change', recalculateStats);
});

$('savePrices').onclick = savePrices;
$('bottomSavePrices').onclick = savePrices;
$('resetDefaults').onclick = resetDefaults;
$('refresh').onclick = () => fetchPricing();

window.addEventListener('beforeunload', event => {
  const dirty = document.querySelectorAll('.price-input.dirty').length;
  if (dirty > 0) {
    event.preventDefault();
    event.returnValue = '';
  }
});

recalculateStats();
window.LPClubOpsPricing = { refresh: () => fetchPricing({ preserveDirty: true, silent: true }) };
</script>
</body></html>`;
}

module.exports = { renderPricingPage };
