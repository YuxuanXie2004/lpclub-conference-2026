'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');

let html = fs.readFileSync(INDEX, 'utf8');

const css = `
  /* Registration responsive polish */
  .reg-body{scroll-behavior:smooth;overscroll-behavior:contain;min-height:0}
  .reg-panel{max-height:min(92vh,920px);max-height:min(92dvh,920px)}
  .reg-field select{
    -webkit-appearance:none;
    appearance:none;
    padding-right:42px;
    background-image:
      linear-gradient(45deg,transparent 50%,var(--green-700) 50%),
      linear-gradient(135deg,var(--green-700) 50%,transparent 50%);
    background-position:
      calc(100% - 21px) 50%,
      calc(100% - 16px) 50%;
    background-size:5px 5px,5px 5px;
    background-repeat:no-repeat;
  }
  .reg-field input,.reg-field select,.reg-field textarea{min-height:46px}
  .reg-head,.reg-steps,.reg-body,.reg-foot{box-sizing:border-box}

  @media(max-width:1100px){
    .reg-backdrop{padding:18px}
    .reg-panel{width:min(940px,100%);max-height:calc(100dvh - 36px)}
  }
  @media(max-width:860px){
    .reg-panel{width:100%;max-height:calc(100dvh - 24px);border-radius:18px}
    .reg-backdrop{padding:12px}
    .reg-head{padding:20px 22px 16px}
    .reg-steps{padding:14px 22px}
    .reg-body{padding:20px 22px}
    .reg-foot{padding:14px 22px}
    .reg-summary{align-items:flex-start}
  }
  @media(max-width:720px){
    .reg-backdrop{padding:0;place-items:stretch}
    .reg-panel{height:100dvh;max-height:100dvh;border-radius:0;width:100%}
    .reg-head{padding:17px 18px 14px}
    .reg-head h3{font-size:20px;line-height:1.2}
    .reg-head p{font-size:12px;line-height:1.5}
    .reg-kicker{font-size:9.5px;letter-spacing:.16em}
    .reg-steps{padding:12px 18px;gap:7px;overflow-x:auto;scrollbar-width:none}
    .reg-steps::-webkit-scrollbar{display:none}
    .reg-step{font-size:11px;white-space:nowrap}
    .reg-step i{width:24px;height:24px;flex:0 0 auto}
    .reg-step span{display:inline}
    .reg-line{width:22px;flex:0 0 22px}
    .reg-body{padding:18px}
    .reg-grid{grid-template-columns:1fr;gap:13px}
    .reg-field.full{grid-column:auto}
    .reg-summary{flex-direction:column;gap:6px;margin-bottom:18px;padding:14px 15px}
    .reg-summary strong{white-space:normal}
    .reg-package{grid-template-columns:22px 1fr;padding:15px}
    .reg-price{grid-column:2;text-align:left;margin-top:2px}
    .reg-foot{padding:12px 18px calc(12px + env(safe-area-inset-bottom));flex-wrap:nowrap}
    .reg-actions{width:auto;flex:1}
    .reg-actions .btn{width:100%;min-width:0}
    .reg-back{padding-left:0;padding-right:12px;white-space:nowrap}
    .reg-close{width:36px;height:36px}
  }
  @media(max-width:430px){
    .reg-step span{font-size:10.5px}
    .reg-line{width:14px;flex-basis:14px}
    .reg-head{gap:12px}
    .reg-body{padding:16px 14px}
    .reg-foot{padding-left:14px;padding-right:14px}
  }
`;

if (!html.includes('/* Registration responsive polish */')) {
  html = html.replace('</style>', css + '\n</style>');
}

const needle = "showAlert('');if(n===2&&selectedPackage)";
const replacement = "showAlert('');requestAnimationFrame(function(){var body=document.querySelector('.reg-body');if(body)body.scrollTo({top:0,behavior:'smooth'})});if(n===2&&selectedPackage)";
if (html.includes(needle)) {
  html = html.replace(needle, replacement);
} else if (!html.includes("body.scrollTo({top:0,behavior:'smooth'})")) {
  console.warn('! Could not locate showStep scroll insertion point; CSS changes were still applied.');
}

fs.writeFileSync(INDEX, html);

console.log('✓ Registration responsive polish applied');
console.log('  - step changes scroll form content back to top');
console.log('  - select arrows moved inward and styled consistently');
console.log('  - tablet/mobile modal sizing improved');
console.log('  - single-column mobile form layout');
console.log('  - mobile footer and safe-area spacing improved');
