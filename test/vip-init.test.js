const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lpclub-init-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {envFile:path.join(dir,'.env'),defaultDatabase:path.join(dir,'vip.sqlite'),env:{}};}
test('initialization preserves existing credentials and produces stable working storage',t=>{
 const init=require('../server/init-vip').initVip,options=fixture(t),original='ADMIN_TOKEN=test-private-token\nSMTP_PASS=test-private-password\n';fs.writeFileSync(options.envFile,original);
 const first=init(options),content=fs.readFileSync(options.envFile,'utf8');assert.ok(content.startsWith(original));assert.ok(content.includes('VIP_CODE_ENCRYPTION_KEY='));assert.equal(first.createdKey,true);assert.ok(fs.existsSync(options.defaultDatabase));
 const second=init(options);assert.equal(second.createdKey,false);assert.equal(fs.readFileSync(options.envFile,'utf8'),content);
});
test('invalid existing key never rotates or overwrites the environment file',t=>{
 const init=require('../server/init-vip').initVip,options=fixture(t),content='VIP_CODE_ENCRYPTION_KEY=invalid\n';fs.writeFileSync(options.envFile,content);assert.throws(()=>init(options),e=>e.code==='VIP_STORAGE_UNAVAILABLE');assert.equal(fs.readFileSync(options.envFile,'utf8'),content);
});
test('existing database without its key is refused rather than silently generating a replacement',t=>{
 const init=require('../server/init-vip').initVip,options=fixture(t);fs.writeFileSync(options.defaultDatabase,'existing database');assert.throws(()=>init(options),/encryption key/i);assert.equal(fs.existsSync(options.envFile),false);
});
test('configuration write failure does not leave a new database with a lost key',t=>{
 const init=require('../server/init-vip').initVip,options=fixture(t),blocked=path.join(path.dirname(options.envFile),'not-a-directory');fs.writeFileSync(blocked,'file');options.envFile=path.join(blocked,'.env');
 assert.throws(()=>init(options));assert.equal(fs.existsSync(options.defaultDatabase),false);
});
