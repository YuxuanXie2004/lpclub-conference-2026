'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {VipStore,error}=require('./vip-store');

function initVip({envFile=path.join(__dirname,'.env'),defaultDatabase=path.resolve(__dirname,'../data/vip-codes.sqlite'),env=process.env}={}) {
  const original=fs.existsSync(envFile)?fs.readFileSync(envFile,'utf8'):'';
  const configured={};
  for(const line of original.split(/\r?\n/)) {
    const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if(m)configured[m[1]]=m[2].replace(/^['"]|['"]$/g,'').trim();
  }
  const filename=path.resolve(env.VIP_DB_PATH||configured.VIP_DB_PATH||defaultDatabase);
  let key=env.VIP_CODE_ENCRYPTION_KEY||configured.VIP_CODE_ENCRYPTION_KEY;
  const createdKey=!key;
  if(!key&&fs.existsSync(filename)&&fs.statSync(filename).size>0)throw error('VIP_STORAGE_UNAVAILABLE','Existing VIP database requires its original encryption key; restore the key before initialization.',503);
  if(!key)key=crypto.randomBytes(32).toString('base64');
  const bytes=Buffer.from(key,'base64');
  if(bytes.length!==32||bytes.toString('base64')!==key)throw error('VIP_STORAGE_UNAVAILABLE','VIP encryption key must be a base64-encoded 32-byte key.',503);
  const existing=fs.existsSync(filename)&&fs.statSync(filename).size>0;
  // Validate existing storage before changing configuration; do not recover active attempts.
  if(existing){const store=new VipStore({filename,key});store.close();}
  let content=original;
  function configure(name,value) {
    if(env[name]||configured[name])return;
    const line=name+'='+value;
    const existing=new RegExp('^\\s*'+name+'\\s*=.*$','m');
    if(existing.test(content))content=content.replace(existing,()=>line);
    else content+=(content&&!content.endsWith('\n')?'\n':'')+line+'\n';
  }
  configure('VIP_CODE_ENCRYPTION_KEY',key);
  configure('VIP_DB_PATH',filename);
  if(content!==original) {
    fs.mkdirSync(path.dirname(envFile),{recursive:true});
    const temporary=envFile+'.'+crypto.randomUUID()+'.tmp';
    try {fs.writeFileSync(temporary,content,{flag:'wx',mode:0o600});fs.renameSync(temporary,envFile);}
    finally {if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
  }
  // Save the key before creating a new database so an interrupted setup can be retried.
  if(!existing){const store=new VipStore({filename,key});store.close();}
  return {filename,createdKey};
}
if(require.main===module) {
  try {initVip();console.log('VIP storage initialized. Keep server/.env secure and restart the conference server.');}
  catch(e) {console.error(e.message);process.exitCode=1;}
}
module.exports={initVip};
