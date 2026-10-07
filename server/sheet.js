'use strict';

const STATUSES = ['Received', 'Under Review', 'Approved', 'Waitlisted', 'Rejected', 'Cancelled'];

const COLUMNS = [
  ['ref', 'Registration Reference / 报名编号'],
  ['status', 'Status / 状态'],
  ['createdAt', 'Submitted At / 提交时间'],
  ['salutation', 'Salutation / 称谓'],
  ['fullName', 'Full Name / 姓名'],
  ['company', 'Company / Organization / 公司机构'],
  ['jobTitle', 'Job Title / 职位'],
  ['department', 'Department / 部门'],
  ['companyType', 'Organization Type / 机构类型'],
  ['country', 'Country / Region / 国家地区'],
  ['city', 'City / 城市'],
  ['email', 'Business Email / 企业邮箱'],
  ['mobile', 'Mobile Number / 手机号码'],
  ['whatsappSame', 'Same as WhatsApp/WeChat / 是否同号'],
  ['whatsappNumber', 'WhatsApp / WeChat Number / 微信号码'],
  ['focus', 'Investment Focus / 投资方向'],
  ['purpose', 'Purpose of Attendance / 参会目的'],
  ['matchmaking', '1-on-1 Matchmaking / 一对一洽谈'],
  ['arrivalDate', 'Expected Arrival / 预计抵达日期'],
  ['guests', 'Accompanying Guests / 同行人数'],
  ['visaLetter', 'Visa Invitation Letter / 签证邀请函'],
  ['consent', 'Privacy Consent / 隐私授权'],
  ['items', 'Registration Package / 报名项目'],
  ['total', 'Fee (USD) / 报名费用'],
  ['pricingBasis', 'Pricing Basis / 计价说明'],
  ['source', 'Source / 来源']
];

function csvEscape(v) {
  const s = v === undefined || v === null ? '' : String(v);
  return '"' + s.replace(/"/g, '""') + '"';
}

function toCsv(rows = []) {
  const head = COLUMNS.map(c => csvEscape(c[1])).join(',');
  const body = rows.map(r => COLUMNS.map(c => csvEscape(r[c[0]])).join(',')).join('\r\n');
  return '\ufeff' + head + (body ? '\r\n' + body : '');
}

function esc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function renderTablePage(token) {
  const q = token ? `?token=${encodeURIComponent(token)}` : '';
  const statusOptions = STATUSES.map(s => `<option>${esc(s)}</option>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>LP CLUB · Registration Operations</title><style>
:root{--ink:#10261a;--mut:#64776b;--line:#dfe8e2;--brand:#205f40;--light:#eef5f0;--bg:#f5f8f6;--bad:#9d3f36}
*{box-sizing:border-box}body{margin:0;padding:26px 20px 60px;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:var(--ink);background:var(--bg)}.wrap{max-width:1500px;margin:auto}
header{display:flex;gap:18px;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;margin-bottom:18px}h1{margin:0;font-size:23px}.sub{color:var(--mut);font-size:12.5px;margin-top:4px}.actions{display:flex;gap:9px;flex-wrap:wrap}.btn{border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:9px;padding:9px 13px;font-weight:700;text-decoration:none;cursor:pointer}.btn.primary{background:var(--brand);color:#fff;border-color:var(--brand)}.btn.bad{color:var(--bad)}
.tabs{display:flex;gap:8px;margin:0 0 14px}.tab{border:1px solid var(--line);background:#fff;border-radius:999px;padding:8px 13px;font-weight:700;cursor:pointer}.tab.on{background:var(--brand);color:#fff;border-color:var(--brand)}
.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:0 0 14px}.stat{background:#fff;border:1px solid var(--line);border-radius:12px;padding:13px}.stat small{color:var(--mut);display:block}.stat b{font-size:21px;color:var(--brand)}
.filters{display:grid;grid-template-columns:minmax(220px,1fr) 180px 180px;gap:10px;margin-bottom:12px}.filters input,.filters select{width:100%;padding:10px 11px;border:1px solid var(--line);border-radius:9px;background:#fff}.scroll{overflow:auto;border:1px solid var(--line);border-radius:12px;background:#fff;max-height:70vh}table{border-collapse:collapse;width:100%;font-size:12.5px;white-space:nowrap}th,td{padding:10px 11px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}thead th{position:sticky;top:0;background:#edf4ef;z-index:2}tbody tr:hover{background:#fafcfb}.status{border:1px solid var(--line);border-radius:7px;padding:6px;background:#fff;font-size:12px}.detail{cursor:pointer;color:var(--brand);font-weight:700}.empty{text-align:center;color:var(--mut);padding:40px}.row-actions{display:flex;gap:7px}.mini{border:1px solid var(--line);background:#fff;border-radius:7px;padding:6px 9px;cursor:pointer;font-size:12px}.mini.bad{color:var(--bad)}.toast{position:fixed;right:20px;bottom:20px;background:var(--ink);color:white;padding:11px 14px;border-radius:9px;opacity:0;transform:translateY(8px);transition:.2s;pointer-events:none}.toast.on{opacity:1;transform:none}
.modal{position:fixed;inset:0;background:#0007;display:none;place-items:center;padding:20px;z-index:10}.modal.on{display:grid}.card{width:min(720px,100%);max-height:85vh;overflow:auto;background:#fff;border-radius:16px;padding:22px}.card h2{margin:0 0 16px}.kv{display:grid;grid-template-columns:190px 1fr;gap:8px 15px;border-top:1px solid var(--line);padding-top:14px}.kv b{font-size:12px}.kv span{color:var(--mut);word-break:break-word}.close{float:right;border:0;background:var(--light);border-radius:50%;width:34px;height:34px;cursor:pointer}
@media(max-width:900px){.stats{grid-template-columns:repeat(2,1fr)}.filters{grid-template-columns:1fr}.kv{grid-template-columns:1fr}.kv b{margin-top:7px}}
</style></head><body><div class="wrap"><header><div><h1>Registration Operations · 报名管理</h1><div class="sub">Feishu Base is the only source of truth · 删除采用软删除，可随时恢复</div></div><div class="actions"><a class="btn primary" id="export" href="/export.csv${q}">Export CSV</a><button class="btn" onclick="load()">Refresh</button></div></header>
<div class="tabs"><button id="activeTab" class="tab on" onclick="setMode('active')">Active Registrations</button><button id="deletedTab" class="tab" onclick="setMode('deleted')">Deleted / 回收站</button></div>
<div class="stats" id="stats"></div><div class="filters"><input id="search" placeholder="Search name, company, email or reference"><select id="statusFilter"><option value="">All statuses</option>${statusOptions}</select><select id="packageFilter"><option value="">All packages</option></select></div>
<div class="scroll"><table><thead><tr><th>Reference</th><th>Status</th><th>Submitted</th><th>Name</th><th>Company</th><th>Title</th><th>Email</th><th>Package</th><th>Fee</th><th>Country</th><th>Actions</th></tr></thead><tbody id="body"></tbody></table></div></div>
<div class="modal" id="modal"><div class="card"><button class="close" onclick="closeModal()">×</button><h2 id="modalTitle">Registration</h2><div class="kv" id="detail"></div></div></div><div class="toast" id="toast"></div>
<script>
const TOKEN=${JSON.stringify(token || '')};const STATUSES=${JSON.stringify(STATUSES)};const $=id=>document.getElementById(id);let ROWS=[];let mode='active';
function e(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}function toast(t){$('toast').textContent=t;$('toast').classList.add('on');setTimeout(()=>$('toast').classList.remove('on'),1800)}
function fmtDate(v){try{return v?new Date(v).toLocaleString():''}catch(_){return v||''}}function selectStatus(r){return '<select class="status" data-ref="'+e(r.ref)+'" '+(mode==='deleted'?'disabled':'')+'>'+STATUSES.map(s=>'<option '+(s===r.status?'selected':'')+'>'+e(s)+'</option>').join('')+'</select>'}
async function load(){try{const res=await fetch('/api/registrations?mode='+mode+'&token='+encodeURIComponent(TOKEN));const d=await res.json();if(!res.ok)throw Error(d.error||'Load failed');ROWS=d.rows||[];stats();render()}catch(err){toast(err.message)}}
function setMode(m){mode=m;$('activeTab').classList.toggle('on',m==='active');$('deletedTab').classList.toggle('on',m==='deleted');$('export').href='/export.csv?mode='+m+'&token='+encodeURIComponent(TOKEN);load()}
function render(){const q=$('search').value.toLowerCase();const sf=$('statusFilter').value;const pf=$('packageFilter').value;const filtered=ROWS.filter(r=>(!q||[r.ref,r.fullName,r.company,r.email,r.jobTitle].join(' ').toLowerCase().includes(q))&&(!sf||r.status===sf)&&(!pf||r.items===pf));$('body').innerHTML=filtered.length?filtered.map(r=>'<tr><td><span class="detail" data-ref="'+e(r.ref)+'">'+e(r.ref)+'</span></td><td>'+selectStatus(r)+'</td><td>'+e(fmtDate(r.createdAt))+'</td><td>'+e(r.fullName)+'</td><td>'+e(r.company)+'</td><td>'+e(r.jobTitle)+'</td><td>'+e(r.email)+'</td><td>'+e(r.items)+'</td><td>'+e(r.total)+'</td><td>'+e(r.country)+'</td><td><div class="row-actions">'+(mode==='active'?'<button class="mini bad del" data-ref="'+e(r.ref)+'">Delete</button>':'<button class="mini restore" data-ref="'+e(r.ref)+'">Restore</button>')+'</div></td></tr>').join(''):'<tr><td class="empty" colspan="11">No matching registrations.</td></tr>';bind()}
function stats(){const count=s=>ROWS.filter(r=>r.status===s).length;$('stats').innerHTML=[['Total',ROWS.length],['Received',count('Received')],['Under Review',count('Under Review')],['Approved',count('Approved')],['Waitlisted',count('Waitlisted')]].map(x=>'<div class="stat"><small>'+x[0]+'</small><b>'+x[1]+'</b></div>').join('');const ps=[...new Set(ROWS.map(r=>r.items).filter(Boolean))];$('packageFilter').innerHTML='<option value="">All packages</option>'+ps.map(x=>'<option>'+e(x)+'</option>').join('')}
function bind(){document.querySelectorAll('.detail').forEach(x=>x.onclick=()=>openDetail(x.dataset.ref));document.querySelectorAll('.status').forEach(x=>x.onchange=async()=>{const r=ROWS.find(r=>r.ref===x.dataset.ref),old=r.status;try{const res=await fetch('/api/admin/status?token='+encodeURIComponent(TOKEN),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:x.dataset.ref,status:x.value})});const d=await res.json();if(!res.ok)throw Error(d.error||'Update failed');r.status=x.value;stats();toast('Status updated')}catch(err){x.value=old;toast(err.message)}});document.querySelectorAll('.del').forEach(x=>x.onclick=async()=>{if(!confirm('Move this registration to Deleted / Recycle Bin?'))return;const reason=prompt('Deletion reason (optional):','')||'';try{const res=await fetch('/api/admin/delete?token='+encodeURIComponent(TOKEN),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:x.dataset.ref,reason})});const d=await res.json();if(!res.ok)throw Error(d.error||'Delete failed');toast('Moved to Deleted');load()}catch(err){toast(err.message)}});document.querySelectorAll('.restore').forEach(x=>x.onclick=async()=>{try{const res=await fetch('/api/admin/restore?token='+encodeURIComponent(TOKEN),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:x.dataset.ref})});const d=await res.json();if(!res.ok)throw Error(d.error||'Restore failed');toast('Restored');load()}catch(err){toast(err.message)}})}
function openDetail(ref){const r=ROWS.find(x=>x.ref===ref);if(!r)return;$('modalTitle').textContent=r.fullName+' · '+r.ref;const labels={status:'Status',createdAt:'Submitted',company:'Company',jobTitle:'Job title',department:'Department',companyType:'Organisation type',country:'Country / Region',city:'City',email:'Business email',mobile:'Mobile',whatsappNumber:'WhatsApp / WeChat',focus:'Investment focus',purpose:'Purpose',matchmaking:'1-on-1 matchmaking',arrivalDate:'Expected arrival',guests:'Guests',visaLetter:'Visa letter',items:'Package',total:'Fee (USD)',statusNote:'Status note',deletedAt:'Deleted at',deletedBy:'Deleted by',deletionReason:'Deletion reason'};$('detail').innerHTML=Object.keys(labels).filter(k=>r[k]!==undefined&&r[k]!==''&&r[k]!==null).map(k=>'<b>'+labels[k]+'</b><span>'+e((k==='createdAt'||k==='deletedAt')?fmtDate(r[k]):r[k])+'</span>').join('');$('modal').classList.add('on')}function closeModal(){$('modal').classList.remove('on')}
$('modal').onclick=e=>{if(e.target===$('modal'))closeModal()};['search','statusFilter','packageFilter'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',render));load();setInterval(load,120000);
</script></body></html>`;
}

module.exports = { COLUMNS, STATUSES, toCsv, renderTablePage };
