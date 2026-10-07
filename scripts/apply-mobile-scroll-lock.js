'use strict';

const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'index.html');
let html = fs.readFileSync(file, 'utf8');

const markerStart = '<style id="mobile-scroll-lock">';
const markerEnd = '</style>';

const css = `${markerStart}
/* Final mobile horizontal-overflow lock */
html, body {
  width: 100% !important;
  max-width: 100% !important;
  overflow-x: clip !important;
  overscroll-behavior-x: none;
}

.reg-backdrop,
.reg-panel,
.reg-body,
.reg-screen,
#regForm,
.reg-grid,
.reg-field,
.reg-field.full,
.reg-choice-grid,
.reg-summary,
.reg-consent,
.reg-privacy {
  min-width: 0 !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
}

.reg-body {
  overflow-y: auto !important;
  overflow-x: hidden !important;
  -webkit-overflow-scrolling: touch;
}

#regForm,
.reg-grid {
  width: 100% !important;
  overflow-x: hidden !important;
}

.reg-field > *,
.reg-field input,
.reg-field select,
.reg-field textarea,
.reg-summary > *,
.reg-consent > *,
.reg-privacy > * {
  min-width: 0 !important;
  max-width: 100% !important;
}

/* iOS form controls can carry an intrinsic minimum width. */
.reg-field input[type="date"],
.reg-field input[type="email"],
.reg-field input[type="tel"],
.reg-field input[type="number"],
.reg-field select {
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
}

/* The inline phone row must also be allowed to shrink. */
.reg-field div[style*="grid-template-columns"] {
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
  grid-template-columns: minmax(74px, 90px) minmax(0, 1fr) !important;
}

/* Keep the consent control tiny on iOS Safari. */
.reg-consent > input[type="checkbox"] {
  -webkit-appearance: none !important;
  appearance: none !important;
  width: 16px !important;
  height: 16px !important;
  inline-size: 16px !important;
  block-size: 16px !important;
  min-width: 16px !important;
  min-height: 16px !important;
  max-width: 16px !important;
  max-height: 16px !important;
  flex: 0 0 16px !important;
  aspect-ratio: 1 / 1 !important;
  padding: 0 !important;
}

@media (max-width: 720px) {
  .reg-backdrop {
    inset: 0 !important;
    width: 100dvw !important;
    max-width: 100dvw !important;
    overflow: hidden !important;
  }

  .reg-panel {
    width: 100% !important;
    max-width: 100% !important;
    overflow: hidden !important;
  }

  .reg-body {
    width: 100% !important;
    padding-left: 16px !important;
    padding-right: 16px !important;
  }

  .reg-grid {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  .reg-field,
  .reg-field.full {
    grid-column: 1 / -1 !important;
    width: 100% !important;
  }

  .reg-choice-grid {
    display: flex !important;
    flex-wrap: wrap !important;
    width: 100% !important;
  }

  .reg-chip,
  .reg-chip span {
    min-width: 0 !important;
    max-width: 100% !important;
  }
}
${markerEnd}`;

const start = html.indexOf(markerStart);
if (start !== -1) {
  const end = html.indexOf(markerEnd, start);
  html = html.slice(0, start) + css + html.slice(end + markerEnd.length);
} else {
  html = html.replace('</head>', css + '\n</head>');
}

fs.writeFileSync(file, html);
console.log('✓ Mobile horizontal scroll locked');
console.log('- registration body is vertical-scroll only');
console.log('- iOS intrinsic input widths constrained');
console.log('- phone row can shrink to viewport');
console.log('- checkbox remains 16x16');
