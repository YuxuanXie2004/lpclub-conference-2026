'use strict';

// Authoritative full prices. Participation packages include one delegate pass.
const BASE_PRICES = {
  lp: { ticket: 0, speaking: 4000, panel: 3000, matchmaking: 5000 },
  lpclub_member: { ticket: 0, speaking: 4000, panel: 3000, matchmaking: 5000 },
  gp: { ticket: 2000, speaking: 4000, panel: 3000, matchmaking: 5000 },
  investment_company: { ticket: 2800, speaking: 5600, panel: 4200, matchmaking: 7000 },
  standard: { ticket: 3500, speaking: 7000, panel: 5250, matchmaking: 8750 }
};

const IDENTITIES = {
  lp: {
    id: 'lp', name: 'Limited Partner (LP)', organisationType: 'Limited Partner (LP)',
    note: 'Complimentary delegate pass, subject to LP qualification review.'
  },
  lpclub_member: {
    id: 'lpclub_member', name: 'LP CLUB Member', organisationType: 'LP CLUB Member',
    note: 'Complimentary delegate pass for LP CLUB members.'
  },
  gp: {
    id: 'gp', name: 'General Partner (GP)', organisationType: 'General Partner (GP)',
    note: 'For fund managers and general partners.'
  },
  investment_company: {
    id: 'investment_company', name: 'Asset Management', organisationType: 'Investment Company',
    note: 'For asset management institutions, including but not limited to private credit firms and trust companies.'
  },
  standard: {
    id: 'standard', name: 'Standard', organisationType: 'Other',
    note: 'For third-party service providers, including fund administrators, securities firms, investment banks, law firms and accounting firms, as well as corporate attendees.'
  }
};

const OPTION_LABELS = {
  ticket: ['Delegate Pass', 'Conference admission for 1 attendee.'],
  speaking: ['Speaking Package', 'Includes 1 delegate pass + keynote/speaking opportunity.'],
  panel: ['Panel / Roundtable Package', 'Includes 1 delegate pass + panel/roundtable participation.'],
  matchmaking: ['1-on-1 LP Matchmaking Package', 'Includes 1 delegate pass + curated LP matchmaking.']
};

function clonePrices(source = BASE_PRICES) {
  const result = {};
  for (const [identityId, options] of Object.entries(source)) {
    result[identityId] = { ...options };
  }
  return result;
}

function normalisePrices(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw Object.assign(new Error('Invalid pricing configuration payload.'), { statusCode: 400 });
  }
  const result = {};
  for (const identityId of Object.keys(IDENTITIES)) {
    const values = input[identityId];
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      throw Object.assign(new Error(`Missing pricing for identity: ${identityId}`), { statusCode: 400 });
    }
    result[identityId] = {};
    for (const optionId of Object.keys(OPTION_LABELS)) {
      const raw = values[optionId];
      if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
        throw Object.assign(new Error(`Missing price for ${identityId}.${optionId}`), { statusCode: 400 });
      }
      if (typeof raw !== 'number' && typeof raw !== 'string') {
        throw Object.assign(
          new Error(`Price for ${identityId}.${optionId} must be a non-negative integer.`),
          { statusCode: 400 }
        );
      }
      const price = Number(raw);
      if (!Number.isFinite(price) || price < 0 || !Number.isInteger(price)) {
        throw Object.assign(
          new Error(`Price for ${identityId}.${optionId} must be a non-negative integer.`),
          { statusCode: 400 }
        );
      }
      result[identityId][optionId] = price;
    }
  }
  return result;
}

function buildPackages(input = BASE_PRICES) {
  const prices = normalisePrices(input);
  const packages = {};
  for (const identity of Object.values(IDENTITIES)) {
    for (const [optionId, [ticketName, optionNote]] of Object.entries(OPTION_LABELS)) {
      const id = identity.id + '_' + optionId;
      const price = prices[identity.id][optionId];
      packages[id] = {
        id, identityId: identity.id, identityName: identity.name,
        organisationType: identity.organisationType, optionId,
        name: identity.name, ticketName, price,
        displayPrice: price === 0 ? 'Complimentary / By invitation' : 'USD ' + price.toLocaleString('en-US'),
        note: optionId === 'ticket' ? identity.note : optionNote,
        available: true, needsVerification: false
      };
    }
  }
  return packages;
}

const PACKAGES = Object.freeze(buildPackages(BASE_PRICES));

module.exports = {
  PACKAGES,
  IDENTITIES,
  BASE_PRICES,
  OPTION_LABELS,
  clonePrices,
  normalisePrices,
  buildPackages
};
