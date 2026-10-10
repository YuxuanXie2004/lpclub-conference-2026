'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const indexFile = path.join(root, 'index.html');
const imageFile = path.join(root, 'images', 'IMG_1456.JPG');

if (!fs.existsSync(imageFile)) {
  console.error('Missing images/IMG_1456.JPG. Upload the image to GitHub first, then git pull.');
  process.exit(1);
}

let html = fs.readFileSync(indexFile, 'utf8');

if (html.includes('images/IMG_1456.JPG')) {
  console.log('IMG_1456.JPG is already in the gallery. No changes made.');
  process.exit(0);
}

const anchor = `      <figure class="shot" data-cat="intl">\n        <img src="images/intl-pe-conf-1st-02.jpg" alt="The 1st International Private Equity Conference — networking" loading="lazy" />\n        <figcaption><b>International PE Conference · 1st Edition</b><span class="yr">HONG KONG</span></figcaption>\n      </figure>`;

if (!html.includes(anchor)) {
  console.error('Could not find the second International PE Conference image block.');
  process.exit(1);
}

const newShot = `\n      <figure class="shot" data-cat="intl">\n        <img src="images/IMG_1456.JPG" alt="International Private Equity Conference — speaker group photo" loading="lazy" />\n        <figcaption><b>International PE Conference · 2nd Edition</b><span class="yr">HONG KONG</span></figcaption>\n      </figure>`;

html = html.replace(anchor, anchor + newShot);
fs.writeFileSync(indexFile, html);

console.log('✓ IMG_1456.JPG added as the 3rd International PE Conference image');
console.log('- inserted after the first two International PE Conference images');
console.log('- existing third image and later images shifted right');
