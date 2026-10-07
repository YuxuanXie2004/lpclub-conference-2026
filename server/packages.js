'use strict';
/**
 * Authoritative registration catalogue.
 * GP and Standard prices are confirmed from the project brief.
 * Unverified categories remain selectable for testing, but are explicitly flagged.
 * Before public launch, replace their values with the approved rates and set needsVerification=false.
 */
const PACKAGES = {
  lp: {
    id: 'lp', name: 'Limited Partner (LP)', ticketName: 'LP Delegate Pass',
    price: 0, displayPrice: 'Complimentary / By invitation',
    note: 'For qualified institutional allocators, family offices and other LPs. Subject to organiser review.',
    needsVerification: true
  },
  gp: {
    id: 'gp', name: 'General Partner (GP)', ticketName: 'GP Delegate Pass',
    price: 1800, displayPrice: 'USD 1,800', note: 'For fund managers and investment firms.', needsVerification: false
  },
  gp_early: {
    id: 'gp_early', name: 'GP Early', ticketName: 'GP Early Delegate Pass',
    price: 1800, displayPrice: 'USD 1,800',
    note: 'Early registration category for qualifying GP delegates. Final rate must be verified before public launch.',
    needsVerification: true
  },
  investment_company: {
    id: 'investment_company', name: 'Other Investment Company', ticketName: 'Investment Company Delegate Pass',
    price: 3150, displayPrice: 'USD 3,150',
    note: 'For investment-related organisations outside the LP/GP categories. Final rate must be verified before public launch.',
    needsVerification: true
  },
  standard: {
    id: 'standard', name: 'Standard', ticketName: 'Standard Delegate Pass',
    price: 3150, displayPrice: 'USD 3,150', note: 'Standard conference registration.', needsVerification: false
  }
};
module.exports = { PACKAGES };
