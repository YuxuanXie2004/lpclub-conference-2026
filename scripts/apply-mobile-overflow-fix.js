'use strict';

const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'index.html');
let html = fs.readFileSync(file, 'utf8');

const markerStart = '<style id="mobile-overflow-fix">';
const markerEnd = '</style>';
const css = `${markerStart}
/* Cross-device overflow and mobile form fixes */
html, body {
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}

body {
  position: relative;
}

.wrap,
header,
footer,
section,
.hero,
.stats,
.cta-band,
.reg-backdrop,
.reg-panel,
.reg-head,
.reg-steps,
.reg-body,
.reg-foot,
.reg-screen,
.reg-grid,
.reg-field,
.reg-summary,
.reg-consent,
.reg-privacy {
  min-width: 0;
  max-width: 100%;
}

img, video, svg, canvas {
  max-width: 100%;
  height: auto;
}

input, select, textarea, button {
  max-width: 100%;
}

/* Prevent long text from forcing the viewport wider. */
.reg-consent span,
.reg-privacy,
.reg-section-lead,
.reg-package small,
.hero h1,
.hero .sub,
.hero-meta strong,
footer,
.card p {
  overflow-wrap: anywhere;
  word-break: normal;
}

/* Consent checkbox must stay a small square on every browser, including iOS Safari. */
.reg-consent > input[type="checkbox"] {
  -webkit-appearance: none !important;
  appearance: none !important;
  box-sizing: border-box !important;
  display: block !important;
  inline-size: 16px !important;
  block-size: 16px !important;
  width: 16px !important;
  height: 16px !important;
  min-width: 16px !important;
  min-height: 16px !important;
  max-width: 16px !important;
  max-height: 16px !important;
  flex: 0 0 16px !important;
  padding: 0 !important;
  margin: 3px 0 0 0 !important;
  border: 1.5px solid var(--green-400) !important;
  border-radius: 3px !important;
  background: #fff !important;
  box-shadow: none !important;
}

.reg-consent > input[type="checkbox"]:checked {
  background: var(--green-800) !important;
  border-color: var(--green-800) !important;
  box-shadow: inset 0 0 0 3px #fff !important;
}

.reg-consent {
  display: flex !important;
  align-items: flex-start !important;
  gap: 10px !important;
}

.reg-consent > span {
  flex: 1 1 auto;
  min-width: 0;
}

@media (max-width: 900px) {
  .wrap { width: 100%; padding-left: 18px; padding-right: 18px; }
  .nav { width: 100%; min-width: 0; gap: 10px; }
  .nav .brand { min-width: 0; }
  .nav .brand span { min-width: 0; }
  .nav-right { flex: 0 0 auto; }
  .hero { width: 100%; overflow: hidden; }
  .hero-grid { width: 100%; min-width: 0; }
  .hero h1 { white-space: normal !important; max-width: 100%; }
  .hero-meta { gap: 18px 24px; }
  .hero-meta > div { min-width: 0; max-width: 100%; }
}

@media (max-width: 720px) {
  .reg-backdrop {
    width: 100vw;
    max-width: 100vw;
    overflow-x: hidden;
  }

  .reg-panel {
    width: 100vw !important;
    max-width: 100vw !important;
    min-width: 0 !important;
  }

  .reg-head,
  .reg-steps,
  .reg-body,
  .reg-foot {
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }

  .reg-steps {
    gap: 7px;
    overflow-x: hidden;
  }

  .reg-step {
    min-width: 0;
    flex: 0 1 auto;
  }

  .reg-line {
    width: auto !important;
    min-width: 10px;
    flex: 1 1 20px;
  }

  .reg-grid {
    grid-template-columns: minmax(0, 1fr) !important;
    width: 100%;
  }

  .reg-field,
  .reg-field.full,
  .reg-summary,
  .reg-package,
  .reg-identity,
  .reg-consent,
  .reg-privacy {
    width: 100%;
    min-width: 0;
    max-width: 100%;
  }

  .reg-field input,
  .reg-field select,
  .reg-field textarea {
    width: 100% !important;
    min-width: 0 !important;
  }

  .reg-choice-grid {
    width: 100%;
    min-width: 0;
    gap: 7px;
  }

  .reg-chip {
    max-width: 100%;
  }

  .reg-chip span {
    max-width: 100%;
    white-space: normal;
  }

  .reg-foot {
    gap: 10px;
  }

  .reg-actions {
    min-width: 0;
  }

  .reg-actions .btn {
    min-width: 0 !important;
    white-space: nowrap;
  }
}

@media (max-width: 480px) {
  .wrap { padding-left: 16px; padding-right: 16px; }

  .nav { height: 64px; }
  .nav .brand small { display: none; }
  .nav .btn { padding: 9px 14px; font-size: 12px; }

  .hero { padding: 76px 0 68px; }
  .hero h1 { font-size: clamp(27px, 9vw, 38px) !important; }
  .hero .sub { font-size: 15.5px; }

  .reg-head { padding: 18px 16px 14px !important; }
  .reg-head h3 { font-size: 22px !important; }
  .reg-head p { font-size: 12.5px; }

  .reg-steps { padding: 12px 16px !important; }
  .reg-step { font-size: 11px; gap: 6px; }
  .reg-step i { width: 24px; height: 24px; flex: 0 0 24px; }

  .reg-body { padding: 16px !important; }
  .reg-foot { padding: 12px 16px calc(12px + env(safe-area-inset-bottom)) !important; }

  .reg-consent { padding: 12px !important; }
  .reg-privacy { padding: 12px !important; }
}
${markerEnd}`;

const existingStart = html.indexOf(markerStart);
if (existingStart !== -1) {
  const existingEnd = html.indexOf(markerEnd, existingStart);
  if (existingEnd !== -1) {
    html = html.slice(0, existingStart) + css + html.slice(existingEnd + markerEnd.length);
  }
} else {
  html = html.replace('</head>', css + '\n</head>');
}

fs.writeFileSync(file, html);
console.log('✓ Mobile overflow fix applied');
console.log('- horizontal page dragging disabled');
console.log('- wide elements constrained to viewport');
console.log('- mobile modal made fully responsive');
console.log('- iOS checkbox locked to 16x16 square');
console.log('- long text can wrap without widening the page');
