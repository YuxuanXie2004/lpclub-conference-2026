(function(){
  'use strict';
  const panel=document.getElementById('feishuStatusPanel');
  if(!panel)return;
  const $=id=>document.getElementById(id),base='api/admin/integrations/feishu';
  const t=(key,params)=>window.LPClubAdminI18n?.text(key,params)||key;
  function beijingTime(value){
    const stamp=typeof value==='string'&&/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)?value.replace(' ','T')+'Z':value;
    const date=new Date(stamp);
    return Number.isNaN(date.getTime())?'—':date.toLocaleString(window.LPClubAdminI18n?.language==='zh'?'zh-CN':'en-GB',{timeZone:'Asia/Shanghai',hour12:false});
  }
  let busy=false,lastData,lastError='';
  async function request(path,body){
    const response=await fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Request failed');return data;
  }
  const count=(rows,status)=>rows.filter(row=>status.includes(row.status)).reduce((n,row)=>n+Number(row.count),0);
  function draw(){
    if(!lastData){if(lastError)$('feishuErrors').textContent=t(lastError);return;}
    const data=lastData,jobs=data.jobs||[],sync=data.sync||[];
    $('feishuStatusText').textContent=t('Notifications: {enabled} ({configured}) · Pending {pending} · Failed {failed}',{enabled:t(data.notifyEnabled?'Enabled':'Paused'),configured:t(data.notifyConfigured?'Configured':'Configuration incomplete'),pending:count(jobs,['pending','processing']),failed:count(jobs,['failed','blocked'])})+'; '+t('Table: {enabled} ({configured}) · Pending {pending} · Failed {failed}',{enabled:t(data.syncEnabled?'Enabled':'Paused'),configured:t(data.syncConfigured?'Configured':'Configuration incomplete'),pending:count(sync,['pending','processing']),failed:count(sync,['failed','blocked'])});
    const lines=[];
    for(const item of data.failures||[])lines.push([t(item.channel==='通知'?'Feishu notifications':'Table sync'),item.ref,item.jobId||'',item.error].filter(Boolean).join(' · '));
    if(data.reconciliation){const r=data.reconciliation;lines.push(t('Last reconciliation (Beijing time): {time}{queued}{error}',{time:r.lastReconcile?beijingTime(r.lastReconcile):t('Not yet run'),queued:r.requested?t(' (queued)'):'',error:r.lastError?' · '+r.lastError:''}));}
    const oldest=[...jobs,...sync].filter(row=>['pending','processing'].includes(row.status)&&row.oldest).map(row=>row.oldest).sort()[0];
    if(oldest)lines.push(t('Oldest pending (Beijing time): {time}',{time:beijingTime(oldest)}));
    const latest=sync.map(row=>row.lastSuccess).filter(Boolean).sort().at(-1);if(latest)lines.push(t('Last successful sync (Beijing time): {time}',{time:beijingTime(latest)}));
    if(lastError)lines.push(t(lastError));
    $('feishuErrors').textContent=lines.join('\n');
  }
  async function refresh(){lastData=await request('');lastError='';draw();}
  async function act(fn){if(busy)return;busy=true;const buttons=['feishuRefreshStatus','feishuReconcile','feishuRetry'];buttons.forEach(id=>$(id).disabled=true);try{await fn();}catch(error){lastError=error.message;draw();}finally{busy=false;buttons.forEach(id=>$(id).disabled=false);}}
  window.LPClubFeishuStatus={refresh:()=>act(refresh),translate:draw};
  $('feishuRefreshStatus').onclick=()=>act(refresh);
  $('feishuReconcile').onclick=()=>act(async()=>{await request('/reconcile',{});await refresh();});
  $('feishuRetry').onclick=()=>act(async()=>{const value=$('feishuRetryRef').value.trim();if(!value)throw Error('Enter a registration reference or failed job ID');await request('/retry',/^[0-9a-f-]{36}$/i.test(value)?{jobId:value}:{ref:value});await refresh();window.LPClubNotifications?.activate('feishu');});
})();
