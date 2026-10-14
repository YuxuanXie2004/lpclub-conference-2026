'use strict';

const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'index.html');
let html = fs.readFileSync(file, 'utf8');

const newCopy = 'Investors explore frontier technology, new energy &amp; power, AI, high-growth emerging and digital infrastructure opportunities.';

html = html.replace(
  /<div class="theme-body"><span class="tnum">05<\/span><h3>AI(?:\s*&amp;\s*Healthcare|\s*&amp;\s*Frontier Tech\s*&amp;\s*New Energy)<\/h3><p>.*?<\/p><\/div>/,
  '<div class="theme-body"><span class="tnum">05</span><h3>AI &amp; Frontier Tech &amp; New Energy</h3><p>' + newCopy + '</p></div>'
);

html = html.replace(
  /(<img[^>]*src="images\/theme-05\.jpg"[^>]*alt=")[^"]*(")/,
  '$1AI &amp; Frontier Tech &amp; New Energy$2'
);

fs.writeFileSync(file, html);
console.log('✓ Theme 05 description updated');
console.log('- title: AI & Frontier Tech & New Energy');
console.log('- copy: Investors explore frontier technology, new energy & power, AI, high-growth emerging and digital infrastructure opportunities.');
