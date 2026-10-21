'use strict';

const {
  BASE_PRICES, clonePrices, normalisePrices, buildPackages
} = require('./packages');

const EVENT_KEY = 'conference-2026';

function pricingError(code, message, statusCode, extra = {}) {
  return Object.assign(new Error(message), { code, statusCode, ...extra });
}

function revisionValue(value) {
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 1) {
    throw pricingError('VERSION_REQUIRED', 'Refresh pricing before saving.', 400);
  }
  return revision;
}

function decodeState(row) {
  if (!row) {
    throw pricingError('PRICING_CONFIGURATION_MISSING', 'Registration pricing is not configured.', 503);
  }
  try {
    const source = typeof row.prices_json === 'string' ? JSON.parse(row.prices_json) : row.prices_json;
    return { prices: normalisePrices(source), revision: revisionValue(row.revision) };
  } catch (error) {
    if (error.code === 'PRICING_CONFIGURATION_MISSING') throw error;
    throw pricingError('PRICING_CONFIGURATION_INVALID', 'Registration pricing configuration is invalid.', 503);
  }
}

function createMysqlPricingStore(db) {
  async function read(connection = db, lock = false) {
    const lockClause = lock === 'update' ? ' FOR UPDATE' : lock === 'share' ? ' FOR SHARE' : '';
    const rows = await connection.query(
      'SELECT prices_json,revision FROM registration_pricing WHERE event_key=?' + lockClause,
      [EVENT_KEY]
    );
    return decodeState(rows[0]);
  }

  async function get() {
    return read();
  }

  async function packages(connection = db, { lock = false } = {}) {
    const current = await read(connection, lock ? 'share' : false);
    return { ...current, packages: buildPackages(current.prices) };
  }

  async function save(connection, prices, expectedRevision, action) {
    const current = await read(connection, 'update');
    if (current.revision !== expectedRevision) {
      throw pricingError(
        'VERSION_CONFLICT',
        'Pricing was changed by another administrator. Refresh before saving.',
        409,
        { currentRevision: current.revision, prices: clonePrices(current.prices) }
      );
    }
    const nextRevision = current.revision + 1;
    await connection.query(
      'UPDATE registration_pricing SET prices_json=?,revision=? WHERE event_key=? AND revision=?',
      [JSON.stringify(prices), nextRevision, EVENT_KEY, current.revision]
    );
    await connection.query(
      'INSERT INTO audit_events(registration_id,vip_code_id,action,actor,detail) VALUES (NULL,NULL,?,?,?)',
      [action, 'administrator', JSON.stringify({ revision: nextRevision, prices })]
    );
    return { prices: clonePrices(prices), revision: nextRevision };
  }

  async function update(input, expectedRevision) {
    const prices = normalisePrices(input);
    const revision = revisionValue(expectedRevision);
    return db.transaction(connection => save(connection, prices, revision, 'pricing_updated'));
  }

  async function reset(expectedRevision) {
    const revision = revisionValue(expectedRevision);
    return db.transaction(connection =>
      save(connection, clonePrices(BASE_PRICES), revision, 'pricing_reset')
    );
  }

  return { get, packages, update, reset };
}

module.exports = { createMysqlPricingStore, EVENT_KEY };
