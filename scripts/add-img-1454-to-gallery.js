'use strict';

const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'index.html');
let html = fs.readFileSync(file, 'utf8');

if (html.includes('images/IMG_1454.JPG')) {
  console.log('IMG_1454.JPG is already in the gallery. No changes made.');
  process.exit(0);
}

const marker = `      <figure class="shot" data-cat="intl">\n        <img src="images/intl-pe-conf-2nd-03.jpg" alt="The 2nd International Private Equity Conference — networking reception" loading="lazy" />\n        <figcaption><b>International PE Conference · 2nd Edition</b><span class="yr">HONG KONG</span></figcaption>\n      </figure>`;

if (!html.includes(marker)) {
  console.error('Could not find the last International PE Conference gallery item.');
  process.exit(1);
}

const addition = marker + `\n      <figure class="shot" data-cat="intl">\n        <img src="images/IMG_1454.JPG" alt="International Private Equity Conference — networking exchange" loading="lazy" />\n        <figcaption><b>International PE Conference</b><span class="yr">HONG KONG</span></figcaption>\n      </figure>`;

html = html.replace(marker, addition);
fs.writeFileSync(file, html);

console.log('✓ IMG_1454.JPG added to Track Record');
console.log('- category: International PE Conference');
console.log('- position: after the existing International PE Conference photos');
