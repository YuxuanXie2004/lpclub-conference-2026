/** LP CLUB conference API. MySQL is the authoritative business store; originals stay private on disk. */
'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {loadEnv}=require('./env');
const sheet=require('./sheet');
const orderData=require('./order');
const packagesModule=require('./packages');
const {PACKAGES}=packagesModule;
const {createDatabase}=require('./database');
const {createMysqlPricingStore}=require('./mysql-pricing-store');
const {createMysqlVipStore}=require('./mysql-vip-store');
const {createRegistrationService}=require('./registration-service');
const {createMaterialService}=require('./materials');
const {createShowcaseService}=require('./showcase');
const {createMailOutbox}=require('./mail-outbox');
const {createMailer}=require('./mailer');
const {stripPrefix}=require('./public-paths');
const ROOT=path.join(__dirname,'..');
function createBackend({env=loadEnv({...process.env}),db:providedDatabase,pricingStore:providedPricingStore,sendMail,logger=console}={}) {
  let actualDatabase=providedDatabase,vipStore;
  const database=()=>actualDatabase||(actualDatabase=createDatabase(env));
  const db={query:(...args)=>database().query(...args),transaction:(...args)=>database().transaction(...args),withNamedLock:(...args)=>database().withNamedLock(...args),health:(...args)=>database().health(...args),close:()=>actualDatabase?.close()};
  const vip=()=>vipStore||(vipStore=createMysqlVipStore(db,env));
  const pricingStore=providedPricingStore||createMysqlPricingStore(db);
  const ADMIN_TOKEN=env.ADMIN_TOKEN||'',ALLOW_ORIGIN=env.ALLOW_ORIGIN||'';
  const integrations=require('./feishu-integration').createFeishuIntegration({db,env,logger});
  const mailer=createMailer(env),outbox=createMailOutbox({db,env,send:sendMail||mailer.send,integrations,logger});
  const materials=createMaterialService({db,packages:PACKAGES,env,mail:outbox,integrations,composeSupplement:mailer.composeSupplement});
  const showcaseAdmin=createShowcaseService({db,env,materials});
  const registrations=createRegistrationService({db,pricing:pricingStore,normaliseOrder:orderData.normaliseOrder,vip:{previewCode:(...a)=>vip().previewCode(...a),redeem:(...a)=>vip().redeem(...a)},materials,mail:outbox,integrations,composeMail:mailer.composeRegistration});
  const rateBuckets=new Map();
  function rateAllowed(ip) {
    const now=Date.now(),windowMs=Number(env.RATE_LIMIT_WINDOW_MS||600000),max=Number(env.RATE_LIMIT_MAX||8);
    if(rateBuckets.size>2000)for(const [key,b]of rateBuckets)if(now-b.start>=windowMs)rateBuckets.delete(key);
    let b=rateBuckets.get(ip);if(!b||now-b.start>=windowMs){b={start:now,count:0};rateBuckets.set(ip,b);}return ++b.count<=max;
  }
  function clientIp(req){return env.TRUST_PROXY==='true'?String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim():req.socket?.remoteAddress||'unknown';}
  async function validateVip(input){const code=await vip().previewCode(input?.vipCode);if(input?.packageId){const catalogue=await pricingStore.packages();const p=orderData.registrationPackage(input,catalogue.packages);if(p.optionId!=='ticket')throw Object.assign(new Error('VIP Code applies to delegate passes only. Please select a Delegate Pass.'),{statusCode:400,code:'VIP_TICKET_ONLY'});return{valid:true,package:{...p,originalPrice:p.price,price:0,displayPrice:'Complimentary / VIP Code',vipApplied:true}};}return{valid:true};}
  const processOrder=input=>registrations.submit(input);
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) { reject(new Error('payload too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (_) { reject(new Error('invalid json')); } });
    req.on('error', reject);
  });
}
function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
}
function json(res, code, payload) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token, Authorization, X-Registration-Ref, Idempotency-Key', 'Access-Control-Allow-Methods': 'POST,GET,PUT,DELETE,PATCH,OPTIONS' };
  if (ALLOW_ORIGIN) headers['Access-Control-Allow-Origin'] = ALLOW_ORIGIN;
  if (typeof res.setHeader === 'function') { Object.entries(headers).forEach(([k,v]) => res.setHeader(k,v)); setSecurityHeaders(res); }
  if (typeof res.status === 'function' && typeof res.json === 'function') return res.status(code).json(payload);
  res.writeHead(code); res.end(JSON.stringify(payload));
}
function mime(file) {
  const e = path.extname(file).toLowerCase();
  return ({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'}[e] || 'application/octet-stream');
}
function serveFile(res, file) {
  const abs = path.resolve(file);
  if (!abs.startsWith(ROOT + path.sep) && abs !== path.join(ROOT, 'index.html')) return false;
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return false;
  setSecurityHeaders(res);
  res.writeHead(200, { 'Content-Type': mime(abs), 'Cache-Control': abs.endsWith('.html') ? 'no-cache' : 'public, max-age=86400' });
  fs.createReadStream(abs).pipe(res); return true;
}

function secureEquals(a, b) {
  const aa = Buffer.from(String(a || '')), bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && aa.length > 0 && crypto.timingSafeEqual(aa, bb);
}

  function failure(res,error,fallback='Request failed') {
    const code=error.statusCode||503;
    return json(res,code,{ok:false,code:error.code&&error.statusCode?error.code:'DATABASE_UNAVAILABLE',error:error.statusCode?error.message:fallback,ref:error.ref||undefined,retryable:error.retryable||undefined,currentPrice:error.currentPrice,currentRevision:error.currentRevision});
  }
  async function health(){let state;try{state=await db.health()}catch(_){state={ok:false,schemaReady:false}}let vipReady=false,pricingReady=false;try{vip();vipReady=true}catch(_){}try{await pricingStore.get();pricingReady=true}catch(_){}return{...state,ok:Boolean(state.ok&&pricingReady),service:'lpclub-conference',database:'mysql',email:outbox.configured(),admin:Boolean(ADMIN_TOKEN),vipReady,pricingReady,materialsReady:materials.ready(),materialsStorage:'local',packagesReady:pricingReady,feishu:integrations.configured()};}
  const materialHandler=require('./materials-http').createMaterialsHandler({service:materials,showcase:showcaseAdmin,json,readBody,setSecurityHeaders,adminToken:ADMIN_TOKEN,logger});
  const server=http.createServer(async(req,res)=>{
    try {
      if(req.method==='OPTIONS')return json(res,204,{});
      const url=new URL(req.url,'http://localhost');url.pathname=stripPrefix(url.pathname,env.PUBLIC_BASE_URL);const pathname=url.pathname;
      const token=String(req.headers['x-admin-token']||url.searchParams.get('token')||'');const allowed=()=>Boolean(ADMIN_TOKEN)&&secureEquals(token,ADMIN_TOKEN);
      if(req.method==='GET'&&['/table','/vip-codes','/materials-admin','/pricing-admin','/pricing'].includes(pathname)){
        if(!allowed())return json(res,401,{ok:false,error:'unauthorised'});
        const tab=pathname==='/vip-codes'?'vip':pathname==='/materials-admin'?'materials':['/pricing-admin','/pricing'].includes(pathname)?'pricing':url.searchParams.get('tab');
        setSecurityHeaders(res);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
        return res.end(sheet.renderTablePage(ADMIN_TOKEN,url.searchParams.get('mode'),{tab,ref:url.searchParams.get('ref')||''}));
      }
      if(await materialHandler(req,res,url,{allowed}))return;
      if(req.method==='GET'&&['/health','/api/health'].includes(pathname)){const result=await health();return json(res,result.ok?200:503,result);}
      if(pathname==='/api/admin/integrations/feishu'||pathname.startsWith('/api/admin/integrations/feishu/')){
        if(!allowed())return json(res,401,{ok:false,error:'unauthorised'});
        const base='/api/admin/integrations/feishu';
        if(req.method==='GET'&&pathname===base)return json(res,200,{ok:true,...await integrations.status()});
        if(req.method==='POST'&&pathname===base+'/retry')return json(res,200,{ok:true,...await integrations.retry(await readBody(req))});
        if(req.method==='POST'&&pathname===base+'/reconcile')return json(res,200,{ok:true,...await integrations.requestReconcile()});
        return json(res,405,{ok:false,error:'Method not allowed'});
      }
      if(req.method==='GET'&&pathname==='/api/packages'){const catalogue=await pricingStore.packages();return json(res,200,{ok:true,packages:Object.values(catalogue.packages),revision:catalogue.revision});}
      if(pathname==='/api/admin/pricing'||pathname==='/api/pricing'){
        if(!allowed())return json(res,401,{ok:false,error:'unauthorised'});
        if(req.method==='GET'){const current=await pricingStore.get();return json(res,200,{ok:true,...current,defaultPrices:packagesModule.BASE_PRICES,identities:packagesModule.IDENTITIES,options:packagesModule.OPTION_LABELS});}
        if(req.method==='POST'){
          const body=await readBody(req);
          if(body?.reset===true)return json(res,200,{ok:true,...await pricingStore.reset(body?.revision)});
          return json(res,200,{ok:true,...await pricingStore.update(body?.prices,body?.revision)});
        }
        return json(res,405,{ok:false,error:'Method not allowed'});
      }
      if(pathname.startsWith('/api/admin/vip-codes')){
        if(!allowed())return json(res,401,{ok:false,error:'unauthorised'});
        const store=vip(),base='/api/admin/vip-codes';
        if(pathname===base&&req.method==='GET')return json(res,200,{ok:true,...await store.list(Object.fromEntries(url.searchParams))});
        if(pathname===base&&req.method==='POST')return json(res,201,{ok:true,items:await store.generate(await readBody(req))});
        if(pathname===base+'/revoke'&&req.method==='POST')return json(res,200,{ok:true,...await store.revoke(await readBody(req))});
        if(pathname===base+'/export'&&req.method==='GET'){
          const items=await store.export((url.searchParams.get('ids')||'').split(',').filter(Boolean));
          const cell=v=>'"'+String(v??'').replace(/^[\s]*[=+@-]|^[\t\r\n]/,m=>"'"+m).replace(/"/g,'""')+'"';
          setSecurityHeaders(res);res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Cache-Control':'no-store','Content-Disposition':'attachment; filename="vip-codes.csv"'});return res.end('\uFEFF'+['VIP Code',...items.map(r=>r.code)].map(cell).join('\r\n'));
        }
        const match=pathname.match(/^\/api\/admin\/vip-codes\/([a-zA-Z0-9-]+)(?:\/(reconcile|resolve))?$/);
        if(match){const id=match[1];if(match[2])return json(res,409,{ok:false,code:'VIP_NOT_EDITABLE',error:'MySQL redemptions commit atomically; reconciliation is not required.'});if(req.method==='GET')return json(res,200,{ok:true,...await store.detail(id)});if(req.method==='PATCH')return json(res,200,{ok:true,item:await store.update(id,await readBody(req))});}
        return json(res,404,{ok:false,error:'not found'});
      }
      if(req.method==='GET'&&pathname==='/api/registrations'){
        if(!allowed())return json(res,401,{ok:false,error:'unauthorised'});
        if(url.searchParams.get('ref'))return json(res,200,{ok:true,row:await registrations.detail(url.searchParams.get('ref')),source:'mysql'});
        return json(res,200,{ok:true,source:'mysql',mode:url.searchParams.get('mode')==='deleted'?'deleted':'active',columns:sheet.COLUMNS,...await registrations.list(Object.fromEntries(url.searchParams))});
      }
      if(req.method==='GET'&&pathname==='/export.csv'){
        if(!allowed())return json(res,401,{ok:false,error:'unauthorised'});
        // Fetch the first batch before sending headers so database failures can be reported.
        const batches=registrations.exportBatches(Object.fromEntries(url.searchParams)),first=await batches.next();setSecurityHeaders(res);res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="lpclub-registrations.csv"','Cache-Control':'no-store'});
        res.write(sheet.toCsv(first.done?[]:first.value));for await(const rows of batches)res.write('\r\n'+sheet.toCsv(rows).split('\r\n').slice(1).join('\r\n'));return res.end();
      }
      const lifecycle=pathname.match(/^\/api\/admin\/(status|delete|restore)$/);
      if(req.method==='POST'&&lifecycle){if(!allowed())return json(res,401,{ok:false,error:'unauthorised'});return json(res,200,{ok:true,...await registrations.lifecycle(lifecycle[1],await readBody(req)),source:'mysql'});}
      if(req.method==='POST'&&['/api/vip','/api/order'].includes(pathname)){
        if(!rateAllowed((pathname==='/api/vip'?'vip:':'')+clientIp(req)))return json(res,429,{ok:false,code:'RATE_LIMITED',error:'Too many attempts. Please try again later.'});
        const input=await readBody(req);return json(res,200,{ok:true,...await(pathname==='/api/vip'?validateVip(input):processOrder(input))});
      }
      if(req.method==='GET'&&(pathname==='/'||pathname==='/index.html'))return serveFile(res,path.join(ROOT,'index.html'))||json(res,404,{ok:false});
      if(req.method==='GET'&&(pathname.startsWith('/images/')||/^\/assets\/[a-z0-9-]+\.(js|css)$/.test(pathname)))return serveFile(res,path.join(ROOT,pathname))||json(res,404,{ok:false});
      return json(res,404,{ok:false,error:'not found'});
    }catch(error){if(!res.headersSent)return failure(res,error,'Service temporarily unavailable');if(!res.writableEnded)res.end();}
  });
  return {server,db,pricingStore,materials,showcaseAdmin,registrations,outbox,integrations,health,processOrder,validateVip,json,rateAllowed};
}
const backend=createBackend();
if(require.main===module){
  const PORT=Number(process.env.PORT||8787),HOST=process.env.HOST||'0.0.0.0';
  // .env settings are loaded into the isolated backend environment, including host/port.
  const env=loadEnv({...process.env});
  backend.server.listen(Number(env.PORT||PORT),env.HOST||HOST,()=>{console.log('LP CLUB conference listening on port '+(env.PORT||PORT));console.log('database: MySQL; admin: '+(env.ADMIN_TOKEN?'enabled':'disabled'));backend.outbox.start();backend.integrations.start();});
  const shutdown=()=>{backend.outbox.stop();backend.integrations.stop();backend.server.close(()=>backend.db.close().then(()=>process.exit(0)));setTimeout(()=>process.exit(1),10000).unref();};
  process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
}
module.exports={...orderData,...backend,createBackend,sheet};
