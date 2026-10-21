'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { mysqlFixture } = require('./helpers/mysql');
const { createRegistrationService } = require('../server/registration-service');
const {
  BASE_PRICES, IDENTITIES, OPTION_LABELS, buildPackages, normalisePrices
} = require('../server/packages');

const integration = process.env.RUN_MYSQL_TESTS === '1';

function clonePrices(source = BASE_PRICES) {
  return Object.fromEntries(Object.entries(source).map(([identity, prices]) => [identity, { ...prices }]));
}

function registrationInput(expectedPrice = 2000) {
  return {
    packageId: 'gp_ticket',
    expectedPrice,
    idempotencyKey: crypto.randomUUID(),
    attendee: {
      fullName: 'Pricing Test', company: 'Capital Example', companyType: 'General Partner (GP)',
      country: 'Singapore', jobTitle: 'Partner', email: 'pricing@capital-example.com',
      phone: '+6512345678', visaLetter: 'No', arrivalDate: '2026-11-17', consent: true
    }
  };
}

function pricingStub(prices = clonePrices(), revision = 1) {
  return {
    async get() {
      return { prices: clonePrices(prices), revision };
    },
    async packages() {
      return { packages: buildPackages(prices), prices: clonePrices(prices), revision };
    },
    async update(next, expectedRevision) {
      assert.equal(expectedRevision, revision);
      prices = normalisePrices(next);
      return { prices: clonePrices(prices), revision: ++revision };
    },
    async reset(expectedRevision) {
      assert.equal(expectedRevision, revision);
      prices = clonePrices(BASE_PRICES);
      return { prices: clonePrices(prices), revision: ++revision };
    }
  };
}

test('registration pricing exposes the complete approved matrix and rejects malformed values', () => {
  const packages = buildPackages(BASE_PRICES);
  assert.equal(Object.keys(packages).length, 20);
  assert.equal(packages.gp_ticket.price, 2000);
  assert.equal(packages.standard_matchmaking.price, 8750);
  assert.deepEqual(Object.keys(packages.gp_ticket).sort(), [
    'available', 'displayPrice', 'id', 'identityId', 'identityName', 'name',
    'needsVerification', 'note', 'optionId', 'organisationType', 'price', 'ticketName'
  ]);

  assert.deepEqual(normalisePrices(BASE_PRICES), BASE_PRICES);
  for (const invalid of [null, {}, { ...clonePrices(), gp: { ticket: -1 } }]) {
    assert.throws(() => normalisePrices(invalid), error => error.statusCode === 400);
  }
  const empty = clonePrices();
  empty.gp.ticket = '';
  assert.throws(() => normalisePrices(empty), /missing price|non-negative integer/i);
  const boolean = clonePrices();
  boolean.gp.ticket = true;
  assert.throws(() => normalisePrices(boolean), /non-negative integer/i);
});

test('registration rejects a changed customer quote before writing a registration', async () => {
  const current = clonePrices();
  current.gp.ticket = 2500;
  const queries = [];
  let requestHash = '';
  const tx = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (/INSERT INTO submission_requests/.test(sql)) requestHash = params[1];
      if (/SELECT .* FROM submission_requests/.test(sql)) return [{ request_hash: requestHash }];
      return [];
    }
  };
  const db = {
    async query() { return []; },
    async transaction(work) { return work(tx); }
  };
  const service = createRegistrationService({
    db,
    normaliseOrder: require('../server/order').normaliseOrder,
    pricing: pricingStub(current, 7)
  });

  await assert.rejects(service.submit(registrationInput(2000)), error => {
    assert.equal(error.code, 'PRICE_CHANGED');
    assert.equal(error.statusCode, 409);
    assert.equal(error.currentPrice, 2500);
    assert.equal(error.currentRevision, 7);
    return true;
  });
  assert.equal(queries.some(({ sql }) => /INSERT INTO registrations/.test(sql)), false);
});

test('pricing store transaction persists across reads and rejects stale revisions', { skip: !integration }, async t => {
  const { db, env, name } = await mysqlFixture(t);
  const { createMysqlPricingStore } = require('../server/mysql-pricing-store');
  const store = createMysqlPricingStore(db);
  const initial = await store.get();
  assert.equal(initial.revision, 1);
  assert.deepEqual(initial.prices, BASE_PRICES);

  const next = clonePrices(initial.prices);
  next.gp.ticket = 2500;
  next.standard.speaking = 8888;
  const saved = await store.update(next, initial.revision);
  assert.equal(saved.revision, 2);
  assert.equal(saved.prices.gp.ticket, 2500);

  const secondDb = require('../server/database').createDatabase({
    ...env,
    MYSQL_DATABASE: name
  });
  t.after(() => secondDb.close());
  assert.equal((await createMysqlPricingStore(secondDb).get()).prices.standard.speaking, 8888);

  const service = createRegistrationService({
    db,
    pricing: store,
    normaliseOrder: require('../server/order').normaliseOrder
  });
  const registration = await service.submit(registrationInput(2500));
  assert.equal(registration.package.price, 2500);
  const savedRegistration = (await db.query('SELECT * FROM registrations WHERE ref=?', [registration.ref]))[0];
  assert.equal(savedRegistration.amount, 2500);
  const snapshot = typeof savedRegistration.package_snapshot === 'string'
    ? JSON.parse(savedRegistration.package_snapshot)
    : savedRegistration.package_snapshot;
  assert.equal(snapshot.price, 2500);

  await assert.rejects(store.update(next, initial.revision), error => error.code === 'VERSION_CONFLICT');
  const reset = await store.reset(saved.revision);
  assert.equal(reset.prices.gp.ticket, 2000);
  assert.equal(reset.prices.standard.speaking, 7000);
  assert.equal((await db.query("SELECT COUNT(*) AS count FROM audit_events WHERE action='pricing_updated'"))[0].count, 1);
  assert.equal((await db.query("SELECT COUNT(*) AS count FROM audit_events WHERE action='pricing_reset'"))[0].count, 1);
});
