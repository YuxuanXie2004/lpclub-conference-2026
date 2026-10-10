'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const indexFile = path.join(root, 'index.html');
const imageFile = path.join(root, 'images', '4f223690b23a576464d4523be1d1c9.JPG');

if (!fs.existsSync(imageFile)) {
  console.error('Missing image: images/4f223690b23a576464d4523be1d1c9.JPG');
  console.error('Upload the image to GitHub images/ first, then git pull and run this script again.');
  process.exit(1);
}

let html = fs.readFileSync(indexFile, 'utf8');

if (html.includes('images/4f223690b23a576464d4523be1d1c9.JPG')) {
  console.log('✓ Image is already in the LP & GP Investment Forum gallery');
  process.exit(0);
}

const anchor = `      <figure class="shot" data-cat="gp">\n        <img src="images/lp-gp-forum-05.jpg" alt="LP &amp; GP Investment Forum 2024 — main stage" loading="lazy" />\n        <figcaption><b>LP &amp; GP Investment Forum</b><span class="yr">2024</span></figcaption>\n      </figure>`;

if (!html.includes(anchor)) {
  console.error('Could not find the last LP & GP Investment Forum gallery item.');
  process.exit(1);
}

const addition = `${anchor}\n      <figure class="shot" data-cat="gp">\n        <img src="images/4f223690b23a576464d4523be1d1c9.JPG" alt="LP &amp; GP Investment Forum 2024 — venue" loading="lazy" />\n        <figcaption><b>LP &amp; GP Investment Forum</b><span class="yr">2024</span></figcaption>\n      </figure>`;

html = html.replace(anchor, addition);
fs.writeFileSync(indexFile, html);

console.log('✓ New photo added to LP & GP Investment Forum');
console.log('- category: LP & GP Investment Forum');
console.log('- label: 2024');
console.log('- position: after the existing LP & GP Investment Forum photos');
