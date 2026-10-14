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
    id: 'investment_company', name: 'Investment Firm', organisationType: 'Investment Company',
    note: 'For investment firms, institutional investors and related investment organisations.'
  },
  standard: {
    id: 'standard', name: 'Standard', organisationType: 'Other',
    note: 'Standard conference registration.'
  }
};

const OPTION_LABELS = {
  ticket: ['Delegate Pass', 'Conference admission for 1 attendee.'],
  speaking: ['Speaking Package', 'Includes 1 delegate pass + keynote/speaking opportunity.'],
  panel: ['Panel / Roundtable Package', 'Includes 1 delegate pass + panel/roundtable participation.'],
  matchmaking: ['1-on-1 LP Matchmaking Package', 'Includes 1 delegate pass + curated LP matchmaking.']
};

const PACKAGES = {};
for (const identity of Object.values(IDENTITIES)) {
  for (const [optionId, [ticketName, optionNote]] of Object.entries(OPTION_LABELS)) {
    const id = identity.id + '_' + optionId;
    const price = BASE_PRICES[identity.id][optionId];
    PACKAGES[id] = {
      id, identityId: identity.id, identityName: identity.name,
      organisationType: identity.organisationType, optionId,
      name: identity.name, ticketName, price,
      displayPrice: price === 0 ? 'Complimentary / By invitation' : 'USD ' + price.toLocaleString('en-US'),
      note: optionId === 'ticket' ? identity.note : optionNote,
      available: true, needsVerification: false
    };
  }
}

module.exports = { PACKAGES, IDENTITIES, BASE_PRICES };
