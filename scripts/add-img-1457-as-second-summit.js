'use strict';

const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'index.html');
let html = fs.readFileSync(file, 'utf8');

const marker = `      <figure class="shot" data-cat="summit">\n        <img src="images/lp-summit-salon-01.jpg" alt="New Smart Productivity Investment Salon — session" loading="lazy" />\n        <figcaption><b>New Smart Productivity Investment Salon</b><span class="yr">HANGZHOU</span></figcaption>\n      </figure>`;

const insert = `${marker}\n      <figure class="shot" data-cat="summit">\n        <img src="images/IMG_1457.JPG" alt="LP Investment Summit — networking session in Hangzhou" loading="lazy" />\n        <figcaption><b>LP Investment Summit</b><span class="yr">HANGZHOU</span></figcaption>\n      </figure>`;

if (html.includes('images/IMG_1457.JPG')) {
  console.log('✓ IMG_1457.JPG is already in the gallery');
  process.exit(0);
}

if (!html.includes(marker)) {
  console.error('Could not find the first LP Investment Summit gallery item.');
  process.exit(1);
}

html = html.replace(marker, insert);
fs.writeFileSync(file, html);

console.log('✓ IMG_1457.JPG added as the 2nd LP Investment Summit image');
console.log('- location label: HANGZHOU');
console.log('- inserted after New Smart Productivity Investment Salon');
