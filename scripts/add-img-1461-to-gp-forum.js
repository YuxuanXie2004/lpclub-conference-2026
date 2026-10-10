'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const indexFile = path.join(root, 'index.html');
let html = fs.readFileSync(indexFile, 'utf8');

if (html.includes('images/IMG_1461.JPG')) {
  console.log('IMG_1461.JPG is already in the gallery.');
  process.exit(0);
}

const anchor = `      <figure class="shot" data-cat="gp">\n        <img src="images/lp-gp-forum-05.jpg" alt="LP &amp; GP Investment Forum 2024 — main stage" loading="lazy" />\n        <figcaption><b>LP &amp; GP Investment Forum</b><span class="yr">2024</span></figcaption>\n      </figure>`;

if (!html.includes(anchor)) {
  throw new Error('Could not find the end of the LP & GP Investment Forum gallery group.');
}

const addition = anchor + `\n      <figure class="shot" data-cat="gp">\n        <img src="images/IMG_1461.JPG" alt="LP &amp; GP Investment Forum — event venue" loading="lazy" />\n        <figcaption><b>LP &amp; GP Investment Forum</b><span class="yr">2024</span></figcaption>\n      </figure>`;

html = html.replace(anchor, addition);
fs.writeFileSync(indexFile, html);

console.log('✓ IMG_1461.JPG added to LP & GP Investment Forum');
console.log('- label: 2024');
console.log('- position: after the existing LP & GP Investment Forum photos');
