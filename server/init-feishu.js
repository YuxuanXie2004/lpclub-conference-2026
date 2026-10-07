'use strict';
const fs = require('fs');
const path = require('path');
(function loadDotEnv(){
  const file=path.join(__dirname,'.env');
  if(!fs.existsSync(file)) return;
  fs.readFileSync(file,'utf8').split(/\r?\n/).forEach(line=>{
    const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(!m) return;
    const val=m[2].replace(/^['"]|['"]$/g,'').trim(); if(!process.env[m[1]]) process.env[m[1]]=val;
  });
})();
const feishu=require('./feishu');
(async()=>{
  console.log('LP CLUB · Initialising Feishu registration database schema…');
  const c=feishu.config();
  console.log(`Target Base: ${c.appToken || '(missing)'} · Table: ${c.tableId || '(missing)'}`);
  const result=await feishu.ensureSchema(console.log);
  console.log(`\nDone. Required fields: ${result.totalRequired}. Changes this run: ${result.changes.length}.`);
  console.log('You can run this command again safely; existing fields are not duplicated.');
})().catch(err=>{console.error('\nFAILED:',err.message);process.exit(1)});
