'use strict';
const {loadEnv}=require('./env');
const {createDatabase}=require('./database');
const {createFeishuClient}=require('./feishu-client');
const {createFeishuIntegration,machineCode}=require('./feishu-integration');
async function main(args=process.argv.slice(2)) {
  const [command,...flags]=args,env=loadEnv({...process.env}),client=createFeishuClient({env});
  if(command==='schema'){
    const apply=flags.includes('--apply');
    const result=await client.schema(apply);
    if(apply&&result.ready)await client.ensureViews();
    console.log(JSON.stringify({mode:apply?'applied':'preview',...result},null,2));return;
  }
  if(!['backfill','reconcile','status','retry'].includes(command))throw Object.assign(Error('Use schema [--apply], backfill, reconcile, status, or retry <ref>'),{code:'INVALID_COMMAND'});
  const db=createDatabase(env),service=createFeishuIntegration({db,env,client});
  try {
    let result;
    if(command==='status')result=await service.status();
    else if(command==='retry')result=await service.retry({ref:flags[0]});
    else if(command==='reconcile')result=await service.requestReconcile();
    else {await service.backfill();result={queued:true};}
    console.log(JSON.stringify(result,null,2));
  }finally{await db.close();}
}
if(require.main===module)main().catch(error=>{console.error(machineCode(error));process.exitCode=1;});
module.exports={main};
