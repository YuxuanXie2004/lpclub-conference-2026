'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

for (const host of ['127.0.0.1', undefined]) {
  test(`服务监听 ${host || '默认地址'}`, () => {
    const filename = path.resolve(__dirname, '../server/index.js');
    const realRequire = createRequire(filename), module = { exports: {} };
    let args;
    const requireStub = name => {
      if (name === 'http') return { createServer() { return { listen(...value) { args = value; } }; } };
      if (name === 'fs') return { ...fs, existsSync(file) { return String(file).endsWith('/server/.env') ? false : fs.existsSync(file); } };
      if (name === './vip-store') return { getStore() { throw Error('test storage disabled'); } };
      return realRequire(name);
    };
    requireStub.main = module;
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
      module, require: requireStub, __dirname: path.dirname(filename),
      process: { env: { PORT: '18877', ...(host ? { HOST: host } : {}) } },
      console: { log() {} }, Buffer, URL, setTimeout, clearTimeout
    }, { filename });
    assert.equal(args[0], 18877);
    assert.equal(args[1], host || '0.0.0.0');
    assert.equal(typeof args[2], 'function');
  });
}
