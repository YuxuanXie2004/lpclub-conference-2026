const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {createRequire}=require('node:module');
function client(response,{tokenError=false}={}) {
  const file=path.resolve(__dirname,'../server/feishu.js'),module={exports:{}};let writes=0;
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,require:createRequire(file),process:{env:{FEISHU_APP_ID:'test',FEISHU_APP_SECRET:'test',FEISHU_APP_TOKEN:'test',FEISHU_TABLE_ID:'test'}},URLSearchParams,AbortSignal,
    fetch:async url=>{if(url.includes('/auth/')){if(tokenError)throw Error('token network');return {json:async()=>({code:0,tenant_access_token:'test',expire:7200})};}writes++;if(response instanceof Error)throw response;return {ok:true,json:async()=>response};}
  },{filename:file});return {app:module.exports,writes:()=>writes};
}
test('token failure and explicit invalid-field rejection confirm no write; timeout/internal error do not',async()=>{
  const auth=client(null,{tokenError:true});await assert.rejects(auth.app.createRecord({}),e=>e.definitelyNotSaved===true);assert.equal(auth.writes(),0);
  const invalid=client({code:1254015,msg:'wrong type'});await assert.rejects(invalid.app.createRecord({}),e=>e.definitelyNotSaved===true);
  for(const response of [Error('network'),{code:1255001,msg:'internal'},{code:1255040,msg:'timeout'},{msg:'malformed'}]) {
    await assert.rejects(client(response).app.createRecord({}),e=>e.definitelyNotSaved!==true);
  }
});
