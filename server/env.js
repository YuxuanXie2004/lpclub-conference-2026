'use strict';
const fs = require('node:fs');
const path = require('node:path');
function loadEnv(env = process.env) {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !Object.hasOwn(env, match[1])) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}
module.exports = { loadEnv };
