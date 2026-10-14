'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packagesFile = path.join(root, 'server', 'packages.js');
const indexFile = path.join(root, 'index.html');

const packagesSource = `'use strict';

/**
 * Approved 2026 conference pricing — full price only.
 * Early-bird / 10% discount has been removed.
 * Identities shown on the registration site:
 * LP / LP CLUB Member / GP / Investment Firm / Standard.
 */

const BASE_PRICES = {
  lp: {
    ticket: 0,
    speaking: 4000,
    panel: 3000,
    matchmaking: 5000
  },
  lpclub_member: {
    ticket: 0,
    speaking: 4000,
    panel: 3000,
    matchmaking: 5000
  },
  gp: {
    ticket: 2000,
    speaking: 4000,
    panel: 3000,
    matchmaking: 5000
  },
  investment_company: {
    ticket: 2800,
    speaking: 5600,
    panel: 4200,
    matchmaking: 7000
  },
  standard: {
    ticket: 3500,
    speaking: 7000,
    panel: 5250,
    matchmaking: 8750
  }
};

const IDENTITIES = {
  lp: {
    id: 'lp',
    name: 'Limited Partner (LP)',
    note: 'Complimentary delegate pass, subject to LP qualification review.',
    organisationType: 'Limited Partner (LP)',
    needsVerification: false
  },
  lpclub_member: {
    id: 'lpclub_member',
    name: 'LP CLUB Member',
    note: 'Complimentary delegate pass for LP CLUB members. Paid participation packages use the standard LP package rates.',
    organisationType: 'LP CLUB Member',
    needsVerification: false
  },
  gp: {
    id: 'gp',
    name: 'General Partner (GP)',
    note: 'For fund managers and general partners.',
    organisationType: 'General Partner (GP)',
    needsVerification: false
  },
  investment_company: {
    id: 'investment_company',
    name: 'Investment Firm',
    note: 'For investment firms, institutional investors and related investment organisations.',
    organisationType: 'Investment Company',
    needsVerification: false
  },
  standard: {
    id: 'standard',
    name: 'Standard',
    note: 'Standard conference registration.',
    organisationType: 'Other',
    needsVerification: false
  }
};

const OPTION_LABELS = {
  ticket: ['Delegate Pass', 'Conference admission for 1 attendee.'],
  speaking: ['Speaking Package', 'Includes 1 delegate pass + keynote/speaking opportunity.'],
  panel: ['Panel / Roundtable Package', 'Includes 1 delegate pass + panel/roundtable participation.'],
  matchmaking: ['1-on-1 LP Matchmaking Package', 'Includes 1 delegate pass + curated LP matchmaking.']
};

function money(n) {
  return 'USD ' + Number(n).toLocaleString('en-US');
}

function makePackage(identity, optionId) {
  const [optionName, optionNote] = OPTION_LABELS[optionId];
  const price = BASE_PRICES[identity.id][optionId];
  const complimentary = price === 0;

  return {
    id: identity.id + '_' + optionId,
    identityId: identity.id,
    identityName: identity.name,
    organisationType: identity.organisationType,
    optionId,
    name: identity.name,
    ticketName: optionName,
    price,
    originalPrice: price,
    displayPrice: complimentary ? 'Complimentary / By invitation' : money(price),
    originalDisplayPrice: null,
    note: optionId === 'ticket' ? identity.note : optionNote,
    available: true,
    needsVerification: false,
    earlyDiscountApplied: false,
    earlyDiscountPercent: 0,
    earlyDiscountCutoff: null
  };
}

const PACKAGES = {};
for (const identity of Object.values(IDENTITIES)) {
  for (const optionId of Object.keys(OPTION_LABELS)) {
    const p = makePackage(identity, optionId);
    PACKAGES[p.id] = p;
  }
}

module.exports = { PACKAGES, IDENTITIES, BASE_PRICES };
`;

fs.writeFileSync(packagesFile, packagesSource);

let html = fs.readFileSync(indexFile, 'utf8');

// Add LP CLUB Member as an organisation type so identity auto-fill remains valid.
if (!html.includes('<option>LP CLUB Member</option>')) {
  html = html.replace(
    '<option>Limited Partner (LP)</option><option>General Partner (GP)</option>',
    '<option>Limited Partner (LP)</option><option>LP CLUB Member</option><option>General Partner (GP)</option>'
  );
}

// Agenda: Panel Discussion II description — exact requested wording.
const agendaNew = 'Investors explore frontier technology, new energy &amp; power, AI computing and digital infrastructure opportunities across Asia.';
html = html.replace(
  /Investors explore AI, healthcare and other high-growth emerging sector opportunities across Asia\./g,
  agendaNew
);
html = html.replace(
  /Investors explore frontier technology, new energy (?:&|&amp;) power, (?:AI|Al) computing and digital infrastructure opportunities across Asia\./g,
  agendaNew
);

// Theme 05 title and image alternative text.
html = html.replace(/AI\s*&amp;\s*Healthcare/g, 'AI &amp; Frontier Tech &amp; New Energy');
html = html.replace(/AI\s*&\s*Healthcare/g, 'AI &amp; Frontier Tech &amp; New Energy');
html = html.replace(/AI\s*&amp;\s*Frontier Tech\s*&amp;\s*New Energy/g, 'AI &amp; Frontier Tech &amp; New Energy');

fs.writeFileSync(indexFile, html);

console.log('✓ 14 Oct conference updates applied');
console.log('- early-bird / 10% discount removed; all prices are full approved prices');
console.log('- identities: LP / LP CLUB Member / GP / Investment Firm / Standard');
console.log('- LP CLUB Member rates match LP: 0 / 4000 / 3000 / 5000');
console.log('- GP: 2000 / 4000 / 3000 / 5000');
console.log('- Investment Firm: 2800 / 5600 / 4200 / 7000');
console.log('- Standard: 3500 / 7000 / 5250 / 8750');
console.log('- Panel Discussion II copy updated exactly as requested');
console.log('- AI & Healthcare renamed to AI & Frontier Tech & New Energy');
