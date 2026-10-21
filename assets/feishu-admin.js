(function(){
  'use strict';
  const panel=document.getElementById('feishuStatusPanel');
  if(!panel)return;
  const $=id=>document.getElementById(id),base='api/admin/integrations/feishu';
  let busy=false;
  async function request(path,body){
    const token=new URLSearchParams(location.search).get('token')||'';
    const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'X-Admin-Token':token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();if(!response.ok)throw Error(data.error||'请求失败');return data;
  }
  const count=(rows,status)=>rows.filter(row=>status.includes(row.status)).reduce((n,row)=>n+Number(row.count),0);
  async function refresh(){
    const data=await request('');
    $('feishuStatusText').textContent='通知：'+(data.notifyEnabled?'已启用':'已暂停')+'（'+(data.notifyConfigured?'已配置':'配置未完成')+'） 待处理 '+count(data.jobs,['pending','processing'])+'，失败 '+count(data.jobs,['failed','blocked'])+'；表格：'+(data.syncEnabled?'已启用':'已暂停')+'（'+(data.syncConfigured?'已配置':'配置未完成')+'） 待同步 '+count(data.sync,['pending','processing'])+'，失败 '+count(data.sync,['failed','blocked']);
    const lines=[];
    for(const item of data.failures||[])lines.push([item.channel,item.ref,item.jobId||'',item.error].filter(Boolean).join(' · '));
    if(data.reconciliation){const r=data.reconciliation;lines.push('最近对账：'+(r.lastReconcile?new Date(r.lastReconcile).toLocaleString():'尚未执行')+(r.requested?'（已排队）':'')+(r.lastError?' · '+r.lastError:''));}
    const oldest=[...data.jobs,...data.sync].filter(row=>['pending','processing'].includes(row.status)&&row.oldest).map(row=>row.oldest).sort()[0];
    if(oldest)lines.push('最早待处理时间（UTC）：'+oldest);
    const latest=data.sync.map(row=>row.lastSuccess).filter(Boolean).sort().at(-1);if(latest)lines.push('最近成功同步（UTC）：'+latest);
    $('feishuErrors').textContent=lines.join('\n');
  }
  async function act(fn){if(busy)return;busy=true;try{await fn();}catch(error){$('feishuErrors').textContent=error.message;}finally{busy=false;}}
  panel.addEventListener('toggle',()=>{if(panel.open)act(refresh);});
  $('feishuRefresh').onclick=()=>act(refresh);
  $('feishuReconcile').onclick=()=>act(async()=>{await request('/reconcile',{});await refresh();});
  $('feishuRetry').onclick=()=>act(async()=>{const value=$('feishuRetryRef').value.trim();if(!value)throw Error('请输入报名编号或失败任务ID');await request('/retry',/^[0-9a-f-]{36}$/i.test(value)?{jobId:value}:{ref:value});await refresh();});
})();
