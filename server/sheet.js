'use strict';

const { markup, script: languageScript, helpers: languageHelpers } = require('./admin-i18n');
const { vipPanel, materialsPanel, pricingPanel, styles: panelStyles } = require('./admin-panels');

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
  let s = v === undefined || v === null ? '' : String(v);
  if (/^[\s]*[=+@-]|^[\t\r\n]/.test(s)) s = "'" + s;
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

function renderTablePage(token, initialMode, options = {}) {
  const vip = vipPanel(token), materials = materialsPanel(token, options.ref || ''), pricing = pricingPanel(token);
  const initialTab = ['active','deleted','vip','materials','pricing'].includes(options.tab) ? options.tab : (initialMode === 'deleted' ? 'deleted' : 'active');
  const deleted = initialMode === 'deleted';
  const q = token ? `?token=${encodeURIComponent(token)}` : '';
  const statusOptions = STATUSES.map(s => `<option value="${esc(s)}" data-admin-i18n="${esc(s)}">${esc(s)}</option>`).join('');
  return markup(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>LP CLUB · Registration Operations</title><style>
:root{--ink:#10261a;--mut:#64776b;--line:#dfe8e2;--brand:#205f40;--light:#eef5f0;--bg:#f5f8f6;--bad:#9d3f36}
*{box-sizing:border-box}body{margin:0;padding:26px 20px 60px;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:var(--ink);background:var(--bg)}.wrap{max-width:1500px;margin:auto}
header{display:flex;gap:18px;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;margin-bottom:18px}h1{margin:0;font-size:23px}.sub{color:var(--mut);font-size:12.5px;margin-top:4px}.actions{display:flex;gap:9px;flex-wrap:wrap}.btn{border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:9px;padding:9px 13px;font-weight:700;text-decoration:none;cursor:pointer}.btn.primary{background:var(--brand);color:#fff;border-color:var(--brand)}.btn.bad{color:var(--bad)}
.tabs{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}.tab{display:inline-block;color:var(--ink);text-decoration:none;border:1px solid var(--line);background:#fff;border-radius:999px;padding:8px 13px;font-weight:700;cursor:pointer}.tab.on{background:var(--brand);color:#fff;border-color:var(--brand)}
.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:0 0 14px}.stat{background:#fff;border:1px solid var(--line);border-radius:12px;padding:13px}.stat small{color:var(--mut);display:block}.stat b{font-size:21px;color:var(--brand)}
.filters{display:grid;grid-template-columns:minmax(220px,1fr) 180px 180px;gap:10px;margin-bottom:12px}.filters input,.filters select{width:100%;padding:10px 11px;border:1px solid var(--line);border-radius:9px;background:#fff}.scroll{overflow:auto;border:1px solid var(--line);border-radius:12px;background:#fff;max-height:70vh}table{border-collapse:collapse;width:100%;font-size:12.5px;white-space:nowrap}th,td{padding:10px 11px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}thead th{position:sticky;top:0;background:#edf4ef;z-index:2}tbody tr:hover{background:#fafcfb}.status{border:1px solid var(--line);border-radius:7px;padding:6px;background:#fff;font-size:12px}.detail{cursor:pointer;color:var(--brand);font-weight:700}.empty{text-align:center;color:var(--mut);padding:40px}.row-actions{display:flex;gap:7px}.mini{border:1px solid var(--line);background:#fff;border-radius:7px;padding:6px 9px;cursor:pointer;font-size:12px}.mini.bad{color:var(--bad)}.toast{position:fixed;right:20px;bottom:20px;background:var(--ink);color:white;padding:11px 14px;border-radius:9px;opacity:0;transform:translateY(8px);transition:.2s;pointer-events:none}.toast.on{opacity:1;transform:none}
.modal{position:fixed;inset:0;background:#0007;display:none;place-items:center;padding:20px;z-index:10}.modal.on{display:grid}.card{width:min(720px,100%);max-height:85vh;overflow:auto;background:#fff;border-radius:16px;padding:22px}.card h2{margin:0 0 16px}.kv{display:grid;grid-template-columns:190px 1fr;gap:8px 15px;border-top:1px solid var(--line);padding-top:14px}.kv b{font-size:12px}.kv span{color:var(--mut);word-break:break-word}.close{float:right;border:0;background:var(--light);border-radius:50%;width:34px;height:34px;cursor:pointer}
@media(max-width:900px){.stats{grid-template-columns:repeat(2,1fr)}.filters{grid-template-columns:1fr}.kv{grid-template-columns:1fr}.kv b{margin-top:7px}}
.kv b span{color:inherit}.admin-language{display:inline-flex;border:1px solid var(--line);border-radius:9px;overflow:hidden;background:#fff}.admin-language button{border:0;padding:9px 12px;background:transparent;color:var(--ink);font:inherit;font-weight:700;cursor:pointer}.admin-language button[aria-pressed="true"]{background:var(--brand);color:#fff}.admin-language button:focus-visible{outline:2px solid var(--brand);outline-offset:-3px}
${panelStyles}
</style></head><body><div class="wrap"><header><div><h1>Registration Operations · 报名管理</h1><div class="sub">MySQL is the source of truth · 删除采用软删除，可随时恢复</div></div><div class="actions"><a class="btn primary" id="export" href="export.csv${q}">Export CSV</a><button class="btn" id="registrationRefresh" onclick="load()">Refresh</button><div class="admin-language" role="group" aria-label="Language / 语言"><button type="button" id="adminLangZh" aria-pressed="false" lang="zh">中文</button><button type="button" id="adminLangEn" aria-pressed="false" lang="en">EN</button></div></div></header>
<div class="tabs" role="tablist" aria-label="Operations sections"><button type="button" id="activeTab" class="tab" role="tab" aria-controls="registrationPanel" onclick="setTab('active')">Active Registrations</button><button type="button" id="deletedTab" class="tab" role="tab" aria-controls="registrationPanel" onclick="setTab('deleted')">Deleted / 回收站</button><button type="button" id="vipTab" class="tab" role="tab" aria-controls="vipPanel" onclick="setTab('vip')">VIP Codes</button><button type="button" id="materialsTab" class="tab" role="tab" aria-controls="materialsPanel" onclick="setTab('materials')">Materials / 资料审核</button><button type="button" id="pricingTab" class="tab" role="tab" aria-controls="pricingPanel" onclick="setTab('pricing')" data-admin-i18n="Pricing / 价格设置">Pricing / 价格设置</button></div>
<div id="registrationPanel" role="tabpanel">
<div class="stats" id="stats"></div><div class="filters"><input id="search" placeholder="Search name, company, email or reference"><select id="statusFilter"><option value="">All statuses</option>${statusOptions}</select><select id="packageFilter"><option value="">All packages</option></select></div>
<div class="scroll"><table><thead><tr><th>Reference</th><th>Status</th><th>Submitted</th><th>Name</th><th>Company</th><th>Title</th><th>Email</th><th>Package</th><th>Fee</th><th>Country</th><th>Actions</th></tr></thead><tbody id="body"></tbody></table></div><div class="actions" style="justify-content:flex-end;margin-top:14px"><button class="btn" id="registrationPrevious">Previous</button><span id="registrationPageInfo"></span><button class="btn" id="registrationNext">Next</button></div></div><div id="vipPanel" class="ops-panel" role="tabpanel" aria-labelledby="vipTab" hidden>${vip.html}</div><div id="materialsPanel" class="ops-panel" role="tabpanel" aria-labelledby="materialsTab" hidden>${materials.html}</div><div id="pricingPanel" class="ops-panel" role="tabpanel" aria-labelledby="pricingTab" hidden>${pricing.html}</div></div>
<div class="modal" id="modal"><div class="card"><button class="close" onclick="closeModal()">×</button><h2 id="modalTitle">Registration</h2><div class="kv" id="detail"></div></div></div><div class="toast" id="toast"></div>
<script>${languageScript}</script>
<script>
${languageHelpers}
const TOKEN=${JSON.stringify(token || '').replace(/</g, '\\u003c')};const STATUSES=${JSON.stringify(STATUSES)};const $=id=>document.getElementById(id);let ROWS=[],registrationStats={},registrationPackages=[],registrationPage=1,registrationTotal=0,registrationPageSize=50,registrationSearchTimer;let mode=${JSON.stringify(deleted ? 'deleted' : 'active')},currentTab='',registrationSequence=0;const filtersByMode={active:{q:'',status:'',package:''},deleted:{q:'',status:'',package:''}};
function e(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}function toast(text){setText($('toast'),text);$('toast').classList.add('on');setTimeout(()=>$('toast').classList.remove('on'),1800)}
function fmtDate(v){try{return v?new Date(v).toLocaleString():''}catch(_){return v||''}}
function panelDocument(id,prefix){const root=document.getElementById(id);return {getElementById:key=>root.querySelector('[id="'+prefix+key+'"]')||root.querySelector('[id="'+key+'"]'),querySelector:selector=>root.querySelector(selector),querySelectorAll:selector=>root.querySelectorAll(selector),addEventListener:(...args)=>root.addEventListener(...args),createElement:(...args)=>document.createElement(...args),get activeElement(){return document.activeElement},get body(){return document.body}}}
async function load(){const requestMode=mode,sequence=++registrationSequence;const params=new URLSearchParams({mode:requestMode,q:$('search').value,status:$('statusFilter').value,package:$('packageFilter').value,page:String(registrationPage),pageSize:String(registrationPageSize)});$('export').href='export.csv?'+params+'&token='+encodeURIComponent(TOKEN);try{const res=await fetch('api/registrations?'+params,{headers:{'X-Admin-Token':TOKEN}});const d=await res.json();if(!res.ok)throw Error(d.error||'Load failed');if(sequence!==registrationSequence||mode!==requestMode||!['active','deleted'].includes(currentTab))return;ROWS=d.rows||[];registrationStats=d.stats||{};registrationPackages=d.packages||[...new Set(ROWS.map(r=>r.items).filter(Boolean))];registrationTotal=d.total??ROWS.length;if(registrationPage>1&&!ROWS.length&&registrationTotal<=(registrationPage-1)*registrationPageSize){registrationPage=Math.max(1,Math.ceil(registrationTotal/registrationPageSize));return load()}stats();render();setText($('registrationPageInfo'),'Page {page} / {pages} · Total {total}',{page:registrationPage,pages:Math.max(1,Math.ceil(registrationTotal/registrationPageSize)),total:registrationTotal});$('registrationPrevious').disabled=registrationPage<=1;$('registrationNext').disabled=registrationPage*registrationPageSize>=registrationTotal}catch(err){if(sequence===registrationSequence&&mode===requestMode&&['active','deleted'].includes(currentTab)){ROWS=[];$('stats').innerHTML='';$('body').innerHTML='<tr><td class="empty" colspan="11">'+e(err.message)+'</td></tr>';toast(err.message)}}}

function setMode(m){filtersByMode[mode]={q:$('search').value,status:$('statusFilter').value,package:$('packageFilter').value};mode=m;registrationPage=1;const filter=filtersByMode[m];$('search').value=filter.q;$('statusFilter').value=filter.status;$('packageFilter').innerHTML='<option value="" data-admin-i18n="All packages">'+t('All packages')+'</option>'+(filter.package?'<option selected>'+e(filter.package)+'</option>':'');$('packageFilter').value=filter.package;ROWS=[];$('stats').innerHTML='';$('body').innerHTML='<tr><td class="empty" colspan="11">'+l("Loading…")+'</td></tr>';$('export').href='export.csv?mode='+m+'&token='+encodeURIComponent(TOKEN);load()}
function setTab(tab,ref){if(!['active','deleted','vip','materials','pricing'].includes(tab))return;closeModal();window.LPClubOpsMaterials?.close();window.LPClubOpsVip?.close();currentTab=tab;registrationSequence++;['active','deleted','vip','materials','pricing'].forEach(name=>{const button=$(name+'Tab');button.classList.toggle('on',name===tab);button.setAttribute('aria-selected',String(name===tab));button.tabIndex=name===tab?0:-1});const registrations=tab==='active'||tab==='deleted';$('registrationPanel').hidden=!registrations;$('vipPanel').hidden=tab!=='vip';$('materialsPanel').hidden=tab!=='materials';$('pricingPanel').hidden=tab!=='pricing';$('export').hidden=!registrations;$('registrationRefresh').hidden=!registrations;if(registrations)setMode(tab);else if(tab==='vip')window.LPClubOpsVip?.refresh();else if(tab==='pricing')window.LPClubOpsPricing?.refresh();else window.LPClubOpsMaterials?.activate(ref)}
function render(){const filtered=ROWS;$('body').innerHTML=filtered.length?filtered.map(r=>'<tr><td><span class="detail" data-ref="'+e(r.ref)+'">'+e(r.ref)+'</span></td><td>'+l(r.status)+'</td><td>'+e(fmtDate(r.createdAt))+'</td><td>'+e(r.fullName)+'</td><td>'+e(r.company)+'</td><td>'+e(r.jobTitle)+'</td><td>'+e(r.email)+'</td><td>'+e(r.items)+'</td><td>'+e(r.total)+'</td><td>'+e(r.country)+'</td><td><div class="row-actions">'+(mode==='active'?'<button class="mini bad del" data-ref="'+e(r.ref)+'">'+l("Delete")+'</button>':'<button class="mini restore" data-ref="'+e(r.ref)+'">'+l("Restore")+'</button>')+'</div></td></tr>').join(''):'<tr><td class="empty" colspan="11">'+l("No matching registrations.")+'</td></tr>';bind()}
function stats(){const count=s=>registrationStats[s]??ROWS.filter(r=>r.status===s).length;$('stats').innerHTML=[['Total',registrationStats.Total??registrationTotal],['Received',count('Received')],['Under Review',count('Under Review')],['Approved',count('Approved')],['Waitlisted',count('Waitlisted')]].map(x=>'<div class="stat"><small>'+l(x[0])+'</small><b>'+x[1]+'</b></div>').join('');const ps=registrationPackages,selectedPackage=$('packageFilter').value||filtersByMode[mode].package;$('packageFilter').innerHTML='<option value="" data-admin-i18n="All packages">'+t('All packages')+'</option>'+ps.map(x=>'<option>'+e(x)+'</option>').join('');$('packageFilter').value=ps.includes(selectedPackage)?selectedPackage:''}

function bind(){$('registrationPanel').querySelectorAll('.detail').forEach(x=>x.onclick=()=>openDetail(x.dataset.ref));$('registrationPanel').querySelectorAll('.del').forEach(x=>x.onclick=async()=>{if(!confirm(t('Move this registration to Deleted / Recycle Bin?')))return;const reason=prompt(t('Deletion reason (optional):'),'')||'';try{const res=await fetch('api/admin/delete?token='+encodeURIComponent(TOKEN),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:x.dataset.ref,rowVersion:ROWS.find(r=>r.ref===x.dataset.ref)?.rowVersion,reason})});const d=await res.json();if(!res.ok)throw Error(d.error||'Delete failed');toast('Moved to Deleted');load()}catch(err){toast(err.message)}});$('registrationPanel').querySelectorAll('.restore').forEach(x=>x.onclick=async()=>{try{const res=await fetch('api/admin/restore?token='+encodeURIComponent(TOKEN),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:x.dataset.ref,rowVersion:ROWS.find(r=>r.ref===x.dataset.ref)?.rowVersion})});const d=await res.json();if(!res.ok)throw Error(d.error||'Restore failed');toast('Restored');load()}catch(err){toast(err.message)}})}
function openDetail(ref){const r=ROWS.find(x=>x.ref===ref);if(!r)return;$('modalTitle').textContent=r.fullName+' · '+r.ref;const labels={status:'Status',createdAt:'Submitted',company:'Company',jobTitle:'Job title',department:'Department',companyType:'Organisation type',country:'Country / Region',city:'City',email:'Business email',mobile:'Mobile',whatsappNumber:'WhatsApp / WeChat',focus:'Investment focus',purpose:'Purpose',matchmaking:'1-on-1 matchmaking',arrivalDate:'Expected arrival',guests:'Guests',visaLetter:'Visa letter',items:'Package',total:'Fee (USD)',statusNote:'Status note',deletedAt:'Deleted at',deletedBy:'Deleted by',deletionReason:'Deletion reason'};$('detail').innerHTML=Object.keys(labels).filter(k=>r[k]!==undefined&&r[k]!==''&&r[k]!==null).map(k=>'<b>'+l(labels[k])+'</b><span>'+(k==='status'?l(r[k]):e((k==='createdAt'||k==='deletedAt')?fmtDate(r[k]):r[k]))+'</span>').join('')+'<b>'+l("Materials / 资料")+'</b><span><button class="mini" id="reviewRegistrationMaterials">'+l("Review materials / 审核资料 →")+'</button></span>';$('reviewRegistrationMaterials').onclick=()=>setTab('materials',r.ref);$('modal').classList.add('on')}function closeModal(){$('modal').classList.remove('on')}
$('registrationPrevious').onclick=()=>{if(registrationPage>1){registrationPage--;load()}};$('registrationNext').onclick=()=>{if(registrationPage*registrationPageSize<registrationTotal){registrationPage++;load()}};$('modal').onclick=e=>{if(e.target===$('modal'))closeModal()};['search','statusFilter','packageFilter'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',()=>{registrationPage=1;clearTimeout(registrationSearchTimer);if(id==='search')registrationSearchTimer=setTimeout(load,250);else load()}));setInterval(()=>{if(['active','deleted'].includes(currentTab))load()},120000);document.querySelector('.tabs').addEventListener('keydown',event=>{const names=['active','deleted','vip','materials','pricing'];const index=names.indexOf(currentTab);let next;if(event.key==='ArrowRight')next=(index+1)%5;else if(event.key==='ArrowLeft')next=(index+4)%5;else if(event.key==='Home')next=0;else if(event.key==='End')next=4;else return;event.preventDefault();setTab(names[next]);$(names[next]+'Tab').focus()});
</script>
<script>(function(document){${vip.script}})(panelDocument('vipPanel','vip-'));</script>
<script>(function(document,history){${materials.script}})(panelDocument('materialsPanel','materials-'),{replaceState(){}});</script>
<script>(function(document){${pricing.script}})(panelDocument('pricingPanel','pricing-'));</script>
<script>setTab(${JSON.stringify(initialTab)},${JSON.stringify(options.ref || '').replace(/</g, '\\u003c')});</script></body></html>`);
}

module.exports = { COLUMNS, STATUSES, toCsv, renderTablePage };
