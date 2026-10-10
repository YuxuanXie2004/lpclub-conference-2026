'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const indexFile = path.join(root, 'index.html');
const imagePath = 'images/IMG_1462.JPG';

let html = fs.readFileSync(indexFile, 'utf8');

if (html.includes(imagePath)) {
  console.log('IMG_1462.JPG is already present in the gallery.');
  process.exit(0);
}

const gpBlocks = [...html.matchAll(/<figure class="shot" data-cat="gp">[\s\S]*?<\/figure>/g)];
if (!gpBlocks.length) {
  throw new Error('Could not find LP & GP Investment Forum gallery items.');
}

const last = gpBlocks[gpBlocks.length - 1];
const insertAt = last.index + last[0].length;

const block = `\n      <figure class="shot" data-cat="gp">\n        <img src="images/IMG_1462.JPG" alt="LP & GP Investment Forum 2024 — conference venue and audience" loading="lazy" />\n        <figcaption><b>LP & GP Investment Forum</b><span class="yr">2024</span></figcaption>\n      </figure>`;

html = html.slice(0, insertAt) + block + html.slice(insertAt);
fs.writeFileSync(indexFile, html);

console.log('✓ IMG_1462.JPG added to LP & GP Investment Forum');
console.log('- label: 2024');
console.log('- position: after the existing LP & GP Investment Forum photos');
