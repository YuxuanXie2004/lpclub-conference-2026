'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const PACKAGES = path.join(ROOT, 'server', 'packages.js');

function backup(file) {
  const backupPath = file + '.bak-registration-v2';
  if (!fs.existsSync(backupPath)) fs.copyFileSync(file, backupPath);
  return backupPath;
}

backup(INDEX);
backup(PACKAGES);

const packagesSource = `'use strict';

/**
 * Registration catalogue v2.
 * Flow: identity -> ONE participation option.
 * Speaking / Panel / 1-on-1 already include one delegate pass.
 */

const GP_CURRENT = 1800;
const GP_ORIGINAL = 2000;
const OPTION_MULTIPLIERS = {
  ticket: 1,
  speaking: 2,
  panel: 1.5,
  matchmaking: 2.5
};

const IDENTITIES = {
  lp: {
    id: 'lp', name: 'Limited Partner (LP)', currentTicket: 0, originalTicket: 0,
    note: 'Complimentary delegate pass, subject to LP qualification review.',
    organisationType: 'Limited Partner (LP)', needsVerification: false
  },
  gp: {
    id: 'gp', name: 'General Partner (GP)', currentTicket: 1800, originalTicket: 2000,
    note: 'For fund managers and investment firms.',
    organisationType: 'General Partner (GP)', needsVerification: false
  },
  gp_early: {
    id: 'gp_early', name: 'GP Early', currentTicket: 1800, originalTicket: 2000,
    note: 'Early-bird GP rate. Final approved ratio still needs confirmation.',
    organisationType: 'General Partner (GP)', needsVerification: true
  },
  investment_company: {
    id: 'investment_company', name: 'Other Investment Company', currentTicket: 3150, originalTicket: 3500,
    note: 'For investment-related organisations outside the LP/GP categories.',
    organisationType: 'Investment Company', needsVerification: true
  },
  standard: {
    id: 'standard', name: 'Standard', currentTicket: 3150, originalTicket: 3500,
    note: 'Standard conference registration.',
    organisationType: 'Other', needsVerification: false
  }
};

const OPTION_LABELS = {
  ticket: ['Delegate Pass', 'Conference admission for 1 attendee.'],
  speaking: ['Speaking Package', 'Includes 1 delegate pass + speaking opportunity.'],
  panel: ['Panel Discussion Package', 'Includes 1 delegate pass + panel participation.'],
  matchmaking: ['1-on-1 LP Matchmaking Package', 'Includes 1 delegate pass + curated LP matchmaking.']
};

function money(n) {
  return 'USD ' + Number(n).toLocaleString('en-US');
}

function makePackage(identity, optionId) {
  const [optionName, optionNote] = OPTION_LABELS[optionId];

  // LP delegate pass is free. LP paid-service pricing was not provided,
  // so those options remain visible but unavailable until the approved rate is supplied.
  if (identity.id === 'lp' && optionId !== 'ticket') {
    return {
      id: identity.id + '_' + optionId,
      identityId: identity.id,
      identityName: identity.name,
      organisationType: identity.organisationType,
      optionId,
      name: identity.name,
      ticketName: optionName,
      price: 0,
      originalPrice: null,
      displayPrice: 'Paid · rate to be confirmed',
      note: optionNote,
      available: false,
      needsVerification: true
    };
  }

  if (identity.id === 'lp' && optionId === 'ticket') {
    return {
      id: 'lp_ticket', identityId: 'lp', identityName: identity.name,
      organisationType: identity.organisationType, optionId,
      name: identity.name, ticketName: optionName, price: 0, originalPrice: 0,
      displayPrice: 'Complimentary / By invitation', note: identity.note,
      available: true, needsVerification: false
    };
  }

  const ratio = identity.currentTicket / GP_CURRENT;
  const originalRatio = identity.originalTicket / GP_ORIGINAL;
  const currentPrice = Math.round(GP_CURRENT * OPTION_MULTIPLIERS[optionId] * ratio);
  const originalPrice = Math.round(GP_ORIGINAL * OPTION_MULTIPLIERS[optionId] * originalRatio);

  return {
    id: identity.id + '_' + optionId,
    identityId: identity.id,
    identityName: identity.name,
    organisationType: identity.organisationType,
    optionId,
    name: identity.name,
    ticketName: optionName,
    price: currentPrice,
    originalPrice,
    displayPrice: money(currentPrice),
    originalDisplayPrice: money(originalPrice),
    note: optionNote,
    available: true,
    needsVerification: identity.needsVerification
  };
}

const PACKAGES = {};
for (const identity of Object.values(IDENTITIES)) {
  for (const optionId of Object.keys(OPTION_MULTIPLIERS)) {
    const p = makePackage(identity, optionId);
    PACKAGES[p.id] = p;
  }
}

module.exports = { PACKAGES, IDENTITIES, OPTION_MULTIPLIERS };
`;

fs.writeFileSync(PACKAGES, packagesSource);

let html = fs.readFileSync(INDEX, 'utf8');

// API paths under the production sub-path.
html = html.replaceAll("fetch('/api/packages')", "fetch('/2026-pe-conference/api/packages')");
html = html.replaceAll("fetch('/api/order'", "fetch('/2026-pe-conference/api/order'");

// Step label.
html = html.replace('<div class="reg-step active" data-step-indicator="1"><i>1</i><span>Package</span></div>', '<div class="reg-step active" data-step-indicator="1"><i>1</i><span>Registration</span></div>');

// Step 1 markup: identity first, then exactly one participation option.
const oldStep = `<h4 class="reg-section-title">Choose your registration category</h4>\n        <p class="reg-section-lead">Select the category that best represents you. Your registration package and fee update automatically.</p>\n        <div class="reg-packages" id="regPackages"><div class="reg-note">Loading registration packages…</div></div>\n        <p class="reg-note">LP CLUB reviews attendee eligibility. Selecting a category does not constitute payment or final admission approval.</p>`;
const newStep = `<h4 class="reg-section-title">1. Choose your identity</h4>\n        <p class="reg-section-lead">Select the category that best represents you.</p>\n        <div class="reg-identity-grid" id="regIdentities"><div class="reg-note">Loading registration categories…</div></div>\n        <div id="regParticipationWrap" hidden>\n          <h4 class="reg-section-title" style="margin-top:26px">2. Choose one participation option</h4>\n          <p class="reg-section-lead">Choose either a delegate pass or one package. Speaking, Panel Discussion and 1-on-1 LP Matchmaking already include one delegate pass for one attendee.</p>\n          <div class="reg-packages" id="regPackages"></div>\n        </div>\n        <p class="reg-note">LP CLUB reviews attendee eligibility. Selecting a category does not constitute payment or final admission approval.</p>`;
if (!html.includes(oldStep)) throw new Error('Could not find Step 1 registration markup. No index.html changes were saved.');
html = html.replace(oldStep, newStep);

// The standalone matchmaking question is now redundant with the mutually-exclusive package selector.
html = html.replace(`            <div class="reg-field"><label>Interested in LP & GP 1-on-1 matchmaking? <span>*</span></label><select name="matchmaking" required><option value="">Select</option><option>Yes</option><option>No</option></select></div>\n`, '');

// Add UI + hover polish once.
const cssMarker = '</style>';
const css = `\n  /* Registration v2: identity -> one participation option */\n  .reg-identity-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:16px}\n  .reg-identity{border:1px solid var(--line);border-radius:14px;padding:15px 16px;background:#fff;cursor:pointer;transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease}\n  .reg-identity:hover{transform:translateY(-2px);border-color:var(--green-400);box-shadow:0 10px 24px rgba(44,74,58,.08)}\n  .reg-identity.selected{border-color:var(--green-700);box-shadow:0 0 0 2px rgba(63,99,80,.10)}\n  .reg-identity b{display:block;color:var(--green-900);font-size:14px}\n  .reg-identity small{display:block;color:var(--ink-soft);font-size:11.5px;line-height:1.5;margin-top:4px}\n  .reg-package.is-disabled{opacity:.55;cursor:not-allowed}\n  .reg-package.is-disabled:hover{transform:none;box-shadow:none}\n  .reg-price del{display:block;font-size:11px;color:var(--green-500);font-weight:500}\n  .reg-price strong{display:block}\n  .card-img,.shot img{transition:transform .35s ease}\n  .card:hover .card-img,.shot:hover img{transform:scale(1.045)}\n  @media(max-width:720px){.reg-identity-grid{grid-template-columns:1fr}}\n`;
if (!html.includes('/* Registration v2: identity -> one participation option */')) {
  html = html.replace(cssMarker, css + cssMarker);
}

const start = html.indexOf('  function renderPackages(){');
const end = html.indexOf('  function openReg(){', start);
if (start < 0 || end < 0) throw new Error('Could not find registration rendering functions.');

const newRenderBlock = `  function renderIdentities(){\n    var identityMap={};\n    packageList.forEach(function(p){if(!identityMap[p.identityId])identityMap[p.identityId]=p});\n    var identities=Object.keys(identityMap).map(function(k){return identityMap[k]});\n    regIdentitiesEl.innerHTML=identities.map(function(p){return '<button type="button" class="reg-identity" data-identity="'+escHtml(p.identityId)+'"><b>'+escHtml(p.identityName||p.name)+'</b><small>'+escHtml(p.identityId==='lp'?'Complimentary delegate pass · qualification review required':(p.identityName||p.name))+'</small></button>'}).join('');\n    regIdentitiesEl.querySelectorAll('.reg-identity').forEach(function(btn){btn.addEventListener('click',function(){selectedIdentity=btn.getAttribute('data-identity');selectedPackage=null;regIdentitiesEl.querySelectorAll('.reg-identity').forEach(function(x){x.classList.toggle('selected',x===btn)});renderPackages();regParticipationWrap.hidden=false;regNext.disabled=true;showAlert('')})});\n  }\n  function renderPackages(){\n    if(!selectedIdentity){regPackagesEl.innerHTML='';return}\n    var list=packageList.filter(function(p){return p.identityId===selectedIdentity});\n    regPackagesEl.innerHTML=list.map(function(p){var disabled=p.available===false;var original=p.originalDisplayPrice&&p.originalDisplayPrice!==p.displayPrice?'<del>'+escHtml(p.originalDisplayPrice)+'</del>':'';return '<label class="reg-package'+(disabled?' is-disabled':'')+'" data-package="'+escHtml(p.id)+'"><input type="radio" name="regPackage" value="'+escHtml(p.id)+'" '+(disabled?'disabled':'')+'><span class="reg-radio"></span><span><b>'+escHtml(p.ticketName)+'</b><small>'+escHtml(p.note||'')+(p.optionId!=='ticket'?'<br><strong>Includes 1 delegate pass</strong>':'')+'</small></span><span class="reg-price">'+original+'<strong>'+escHtml(money(p))+'</strong></span></label>'}).join('');\n    regPackagesEl.querySelectorAll('.reg-package:not(.is-disabled)').forEach(function(row){row.addEventListener('click',function(){regPackagesEl.querySelectorAll('.reg-package').forEach(function(x){x.classList.remove('selected')});row.classList.add('selected');var id=row.getAttribute('data-package');selectedPackage=packageList.find(function(p){return p.id===id})||null;regNext.disabled=!selectedPackage;showAlert('')})});\n  }\n  function fallbackPackages(){return []}\n  function loadPackages(){fetch('/2026-pe-conference/api/packages').then(function(r){if(!r.ok)throw new Error();return r.json()}).then(function(d){packageList=d.packages||[];renderIdentities()}).catch(function(){showAlert('Registration pricing could not be loaded. Please refresh or contact LP CLUB.')})}\n`;
html = html.slice(0, start) + newRenderBlock + html.slice(end);

// Add variables/elements.
html = html.replace("  var regPackagesEl = document.getElementById('regPackages');\n  var regStep = 1, selectedPackage = null, packageList = [];", "  var regPackagesEl = document.getElementById('regPackages');\n  var regIdentitiesEl = document.getElementById('regIdentities');\n  var regParticipationWrap = document.getElementById('regParticipationWrap');\n  var regStep = 1, selectedIdentity = null, selectedPackage = null, packageList = [];");

// Reset state when reopening after completion.
html = html.replace("selectedPackage=null;regPackagesEl.querySelectorAll('.reg-package').forEach(function(x){x.classList.remove('selected')})", "selectedIdentity=null;selectedPackage=null;regParticipationWrap.hidden=true;regIdentitiesEl.querySelectorAll('.reg-identity').forEach(function(x){x.classList.remove('selected')});regPackagesEl.innerHTML=''");

// Auto-fill organisation type from identity and update summary.
html = html.replace("var org=regForm.elements.companyType;if(selectedPackage.id==='lp')org.value='Limited Partner (LP)';if(selectedPackage.id==='gp'||selectedPackage.id==='gp_early')org.value='General Partner (GP)';if(selectedPackage.id==='investment_company')org.value='Investment Company'", "var org=regForm.elements.companyType;if(selectedPackage.organisationType)org.value=selectedPackage.organisationType");

// Matchmaking is determined by the selected participation option.
html = html.replace("matchmaking:fd.get('matchmaking')", "matchmaking:selectedPackage&&selectedPackage.optionId==='matchmaking'?'Yes':'No'");

fs.writeFileSync(INDEX, html);

console.log('✓ Registration v2 applied');
console.log('  - identity first');
console.log('  - exactly one participation option');
console.log('  - Speaking / Panel / 1-on-1 include one delegate pass');
console.log('  - GP current prices: 1800 / 3600 / 2700 / 4500');
console.log('  - hover image zoom added');
console.log('  - backups created with .bak-registration-v2 suffix');
console.log('! LP paid-service rates are intentionally disabled until the approved price is provided.');
console.log('! GP Early / Investment Company retain current project rates but remain flagged for verification.');
