'use strict';

const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'index.html');
let html = fs.readFileSync(file, 'utf8');

const startMarker = '<style id="rankings-mobile-fix">';
const endMarker = '</style>';
const css = `${startMarker}
/* Mobile rankings / timeline responsive fix */
@media (max-width: 760px) {
  .rk,
  .rk * {
    box-sizing: border-box;
  }

  .rk {
    width: 100% !important;
    max-width: 100% !important;
    overflow: hidden !important;
    padding: 24px 18px 22px !important;
  }

  .rk-head,
  .rk-title,
  .rk-lead {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
  }

  .rk-timeline {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    gap: 0 !important;
    margin-top: 26px !important;
  }

  .rk-timeline::before {
    display: none !important;
  }

  .rk-item,
  .rk-item:last-child {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    padding: 0 0 22px 30px !important;
    margin: 0 !important;
    position: relative !important;
    border-left: 1px solid var(--green-200);
  }

  .rk-item:last-child {
    padding-bottom: 0 !important;
    border-left-color: transparent;
  }

  .rk-item::before {
    position: absolute !important;
    left: -9px !important;
    top: 4px !important;
    width: 18px !important;
    height: 18px !important;
    margin: 0 !important;
    z-index: 1;
  }

  .rk-year {
    font-size: 20px !important;
    line-height: 1.2 !important;
    margin: 0 0 8px !important;
    white-space: normal !important;
  }

  .rk-item ul,
  .rk-item li {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
  }

  .rk-item li {
    font-size: 13px !important;
    line-height: 1.55 !important;
    overflow-wrap: anywhere !important;
    word-break: normal !important;
    padding-right: 0 !important;
  }
}
${endMarker}`;

const oldStart = html.indexOf(startMarker);
if (oldStart !== -1) {
  const oldEnd = html.indexOf(endMarker, oldStart);
  if (oldEnd !== -1) {
    html = html.slice(0, oldStart) + css + html.slice(oldEnd + endMarker.length);
  }
} else {
  html = html.replace('</head>', css + '\n</head>');
}

fs.writeFileSync(file, html);
console.log('✓ Rankings mobile layout fixed');
console.log('- timeline switches to one column on phones');
console.log('- no horizontal overflow');
console.log('- years and ranking items wrap naturally');
console.log('- vertical timeline retained for mobile');
