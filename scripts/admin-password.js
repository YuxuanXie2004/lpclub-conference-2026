'use strict';
const { hashPassword } = require('../server/admin-auth');
function finish(password) {
  try { process.stdout.write(hashPassword(password) + '\n'); }
  catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
if (!process.stdin.isTTY) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; if (Buffer.byteLength(input) > 1024) { process.stderr.write('Password input is too long\n'); process.exit(1); } });
  process.stdin.on('end', () => finish(input.replace(/\r?\n$/, '')));
} else {
  require('node:readline').emitKeypressEvents(process.stdin);
  process.stderr.write('Administrator password (at least 12 characters): ');
  process.stdin.setRawMode(true); process.stdin.resume();
  let input = '';
  process.stdin.on('keypress', (text, key) => {
    if (key.ctrl && key.name === 'c') { process.stdin.setRawMode(false); process.stderr.write('\n'); process.exit(130); }
    if (key.name === 'return' || key.name === 'enter') { process.stdin.setRawMode(false); process.stdin.pause(); process.stderr.write('\n'); finish(input); }
    else if (key.name === 'backspace') input = [...input].slice(0, -1).join('');
    else if (!key.ctrl && !key.meta && text && !/[\x00-\x1f]/.test(text) && Buffer.byteLength(input + text) <= 256) input += text;
  });
}
