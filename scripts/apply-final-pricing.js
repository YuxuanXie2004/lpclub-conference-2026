'use strict';

const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'server', 'packages.js');

const source = `'use strict';

/**
 * Final approved 2026 conference pricing.
 * Base rates come from the approved pricing matrix.
 * A 10% early-registration discount applies to PAID packages until
 * 30 days before the event (18 Nov 2026 -> cutoff 19 Oct 2026, local server date).
 * LP Delegate Pass remains complimentary.
 */

const EVENT_DATE = new Date('2026-11-18T00:00:00+08:00');
const EARLY_CUTOFF = new Date(EVENT_DATE.getTime() - 30 * 24 * 60 * 60 * 1000);
const EARLY_DISCOUNT = 0.10;

const BASE_PRICES = {
  lp: {
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
  gp_early: {
    ticket: 1400,
    speaking: 2800,
    panel: 2100,
    matchmaking: 3500
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
  gp: {
    id: 'gp',
    name: 'General Partner (GP)',
    note: 'For fund managers and investment firms.',
    organisationType: 'General Partner (GP)',
    needsVerification: false
  },
  gp_early: {
    id: 'gp_early',
    name: 'GP Early-stage / First-time Fund (<$100m)',
    note: 'For qualifying early-stage or first-time funds under USD 100m.',
    organisationType: 'General Partner (GP)',
    needsVerification: false
  },
  investment_company: {
    id: 'investment_company',
    name: 'Investment Firm / Service Provider',
    note: 'For investment firms and professional service providers.',
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

function discountActive(now = new Date()) {
  return now < EARLY_CUTOFF;
}

function currentPrice(basePrice, now = new Date()) {
  if (!basePrice) return 0;
  if (!discountActive(now)) return basePrice;
  return Math.round(basePrice * (1 - EARLY_DISCOUNT));
}

function makePackage(identity, optionId, now = new Date()) {
  const [optionName, optionNote] = OPTION_LABELS[optionId];
  const originalPrice = BASE_PRICES[identity.id][optionId];
  const price = currentPrice(originalPrice, now);
  const isComplimentary = originalPrice === 0;
  const discounted = price !== originalPrice;

  return {
    id: identity.id + '_' + optionId,
    identityId: identity.id,
    identityName: identity.name,
    organisationType: identity.organisationType,
    optionId,
    name: identity.name,
    ticketName: optionName,
    price,
    originalPrice,
    displayPrice: isComplimentary ? 'Complimentary / By invitation' : money(price),
    originalDisplayPrice: discounted ? money(originalPrice) : null,
    note: optionId === 'ticket' ? identity.note : optionNote,
    available: true,
    needsVerification: false,
    earlyDiscountApplied: discounted,
    earlyDiscountPercent: discounted ? 10 : 0,
    earlyDiscountCutoff: '2026-10-19'
  };
}

const PACKAGES = {};
const now = new Date();
for (const identity of Object.values(IDENTITIES)) {
  for (const optionId of Object.keys(OPTION_LABELS)) {
    const p = makePackage(identity, optionId, now);
    PACKAGES[p.id] = p;
  }
}

module.exports = {
  PACKAGES,
  IDENTITIES,
  BASE_PRICES,
  EARLY_CUTOFF,
  EARLY_DISCOUNT
};
`;

fs.writeFileSync(file, source);

console.log('✓ Final conference pricing applied');
console.log('- LP: 0 / 4000 / 3000 / 5000');
console.log('- GP: 2000 / 4000 / 3000 / 5000');
console.log('- GP Early-stage / First-time Fund: 1400 / 2800 / 2100 / 3500');
console.log('- Investment Firm / Service Provider: 2800 / 5600 / 4200 / 7000');
console.log('- Standard: 3500 / 7000 / 5250 / 8750');
console.log('- 10% discount applies automatically before 19 Oct 2026');
console.log('- website, Feishu Amount, and confirmation-email Fee will use the same package price');
