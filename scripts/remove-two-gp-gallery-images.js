'use strict';

const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'index.html');
let html = fs.readFileSync(file, 'utf8');

const targets = [
  'images/lp-gp-forum-01.jpg',
  'images/lp-gp-forum-02.jpg'
];

for (const src of targets) {
  const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('\\s*<figure class="shot" data-cat="gp">[\\s\\S]*?<img src="' + escaped + '"[\\s\\S]*?<\\/figure>', 'i');
  if (re.test(html)) {
    html = html.replace(re, '');
    console.log('✓ Removed ' + src);
  } else {
    console.log('• Already absent or not found: ' + src);
  }
}

fs.writeFileSync(file, html);
console.log('✓ Gallery updated');
