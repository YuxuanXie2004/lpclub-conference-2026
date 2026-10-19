// Isolated server: real HTTP, VIP service and SQLite; no local credentials, Feishu or SMTP traffic.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const {VipStore}=require('../../server/vip-store');
module.exports=async function localServer(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lpclub-browser-'));
 const store=new VipStore({filename:path.join(dir,'vip.sqlite'),key:crypto.randomBytes(32).toString('base64')});
 const state={records:[],messages:[],saveMode:'success'};
 const feishu={assertConfigured(){},deletedValue:r=>r.fields['Is Deleted / 已删除']===true,
  async findActiveRecordByEmail(email){return state.records.find(r=>r.fields['Business Email / 企业邮箱']===email&&!r.fields['Is Deleted / 已删除'])||null;},
  async findRecordByReference(ref){return state.records.find(r=>r.fields['Registration Reference / 报名编号']===ref)||null;},
  async createRecord(fields){const record={record_id:'rec-'+crypto.randomUUID(),fields};if(state.saveMode==='confirmed-fail')throw Object.assign(Error('explicit rejection'),{definitelyNotSaved:true});state.records.push(record);if(state.saveMode==='ambiguous')throw Error('response timed out');return record;},
  async updateRecord(id,fields){Object.assign(state.records.find(r=>r.record_id===id).fields,fields);},
  async softDelete(id,actor,reason){await this.updateRecord(id,{'Is Deleted / 已删除':true,'Deleted By / 删除人':actor,'Deletion Reason / 删除原因':reason});},
  async restore(id){await this.updateRecord(id,{'Is Deleted / 已删除':false});},
  async listActiveRecords(){return state.records.filter(r=>!r.fields['Is Deleted / 已删除']);},async listDeletedRecords(){return state.records.filter(r=>r.fields['Is Deleted / 已删除']);}
 };
 const file=path.resolve(__dirname,'../../server/index.js'),realRequire=createRequire(file),module={exports:{}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,__dirname:path.dirname(file),process:{env:{ADMIN_TOKEN:'local-test-admin',SMTP_PASS:'test-only',RATE_LIMIT_MAX:'1000'}},console,Buffer,URL,setTimeout,clearTimeout,
  require(name){if(name==='fs')return {...fs,existsSync:f=>String(f).endsWith('/server/.env')?false:fs.existsSync(f)};if(name==='./vip-store')return {getStore:()=>store};if(name==='./feishu')return feishu;if(name==='nodemailer')return {createTransport:()=>({async sendMail(message){state.messages.push(message);return {messageId:'local-mail'};}})};return realRequire(name);}
 },{filename:file});
 const server=module.exports.server;await new Promise(r=>server.listen(0,'127.0.0.1',r));
 return {base:'http://127.0.0.1:'+server.address().port,store,state,backend:module.exports,async close(){await new Promise(r=>server.close(r));store.close();fs.rmSync(dir,{recursive:true,force:true});}};
};
