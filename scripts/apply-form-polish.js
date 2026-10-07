'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');

if (!fs.existsSync(INDEX)) throw new Error('index.html not found');

let html = fs.readFileSync(INDEX, 'utf8');

const marker = '/* Registration UX polish v1 */';
if (html.includes(marker)) {
  console.log('✓ Registration UX polish already applied');
  process.exit(0);
}

const css = `

  /* Registration UX polish v1 */
  /* Global section padding was leaking into the modal because .reg-screen is a <section>. */
  .reg-panel{font-family:var(--sans);}
  .reg-panel button,.reg-panel input,.reg-panel select,.reg-panel textarea{font-family:var(--sans);}

  .reg-screen{
    padding:0 !important;
    margin:0 !important;
    min-height:0;
  }

  .reg-body{
    padding:22px 28px 18px;
    overflow-y:auto;
    overscroll-behavior:contain;
    scrollbar-gutter:stable;
  }

  .reg-screen > :first-child{margin-top:0 !important;}
  .reg-screen > :last-child{margin-bottom:0 !important;}

  .reg-summary{
    margin:0 0 20px;
    padding:14px 16px;
  }

  .reg-section-title{
    font-family:var(--sans);
    font-size:17px;
    line-height:1.35;
    font-weight:700;
    letter-spacing:-.01em;
  }

  .reg-section-lead{
    margin:5px 0 18px;
    font-family:var(--sans);
    font-size:13.5px;
    line-height:1.55;
  }

  .reg-field label,.reg-group-label{
    font-family:var(--sans);
    font-size:12px;
    line-height:1.35;
    font-weight:700;
  }

  .reg-field input,.reg-field select,.reg-field textarea{
    font-family:var(--sans) !important;
    font-size:14px;
    line-height:1.4;
  }

  .reg-chip span,.reg-package,.reg-identity,.reg-note,.reg-privacy,.reg-consent,
  .reg-summary,.reg-alert,.reg-back,.reg-foot .btn{
    font-family:var(--sans);
  }

  .reg-grid{gap:14px 16px;}
  .reg-field{min-width:0;}
  .reg-note{margin-top:13px;}
  .reg-privacy{margin-top:8px;}
  .reg-consent{margin-top:1px;}

  .reg-head{padding:22px 28px 17px;}
  .reg-steps{padding:13px 28px;}
  .reg-foot{padding:13px 28px;}

  .reg-panel{
    max-height:min(92vh,860px);
  }

  @media(max-width:720px){
    .reg-body{padding:18px 18px 14px;scrollbar-gutter:auto;}
    .reg-head{padding:18px;}
    .reg-steps{padding:12px 18px;}
    .reg-foot{padding:12px 18px;}
    .reg-summary{margin-bottom:16px;}
    .reg-section-lead{margin-bottom:15px;}
  }
`;

if (!html.includes('</style>')) throw new Error('Could not find </style> in index.html');
html = html.replace('</style>', css + '\n</style>');
fs.writeFileSync(INDEX, html);

console.log('✓ Registration UX polish applied');
console.log('  - removed modal section top/bottom whitespace');
console.log('  - tightened form spacing');
console.log('  - unified registration typography with site font');
console.log('  - improved modal scrolling and footer/header spacing');
