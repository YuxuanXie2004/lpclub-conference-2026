'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {VipStore}=require('./vip-store');
const dotenv=path.join(__dirname,'.env');
if(fs.existsSync(dotenv))for(const line of fs.readFileSync(dotenv,'utf8').split(/\r?\n/)) {
  const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'').trim();
}
(async()=>{
  const source=path.resolve(process.env.VIP_DB_PATH||path.join(__dirname,'../data/vip-codes.sqlite'));
  const destination=process.argv[2]&&path.resolve(process.argv[2]);
  if(!destination||destination===source||fs.existsSync(destination)||!fs.existsSync(source))throw Error('Specify a new backup path and an existing VIP database: npm run vip:backup -- /secure/path/vip-backup.sqlite');
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.closeSync(fs.openSync(destination,'wx',0o600));
  const store=new VipStore({filename:source,key:process.env.VIP_CODE_ENCRYPTION_KEY});
  try{await store.backup(destination);console.log('VIP database backup completed. Store the encryption key separately.');}finally{store.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
