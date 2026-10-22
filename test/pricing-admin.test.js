'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const http = require('node:http');
const { renderPricingPage } = require('../server/pricing-admin');
const { BASE_PRICES, IDENTITIES, OPTION_LABELS, buildPackages, clonePrices } = require('../server/packages');
const { createBackend } = require('../server/index');

function pricesFromHtml(html) {
  return Object.fromEntries([...html.matchAll(/data-identity="([^"]+)" data-option="([^"]+)"\s+data-original="(\d+)" value="(\d+)"/g)].map(match => {
    const [, identity, option, original, value] = match;
    return [identity + '.' + option, { original: Number(original), value: Number(value) }];
  }));
}

test('pricing page renders a complete compact matrix without an inner scrolling region', () => {
  const html = renderPricingPage('admin-secret-token');
  const prices = pricesFromHtml(html);
  for (const identity of Object.values(IDENTITIES)) {
    assert.ok(html.includes(`data-identity="${identity.id}"`));
    assert.ok(html.includes(identity.name));
  }
  for (const [, [label]] of Object.entries(OPTION_LABELS)) assert.ok(html.includes(label));
  assert.equal(Object.keys(prices).length, 20);
  for (const [identity, options] of Object.entries(BASE_PRICES)) {
    for (const [option, price] of Object.entries(options)) {
      assert.deepEqual(prices[`${identity}.${option}`], { original: price, value: price });
    }
  }
  assert.doesNotMatch(html, /data-badge-for|class="badge|identity-meta|option-desc/);
  for (const identity of Object.values(IDENTITIES)) assert.ok(!html.includes(identity.note));
  for (const [, description] of Object.values(OPTION_LABELS)) assert.ok(!html.includes(description));
  assert.match(html, /class="pricing-table-wrap"/);
  assert.match(html, /table-layout:fixed/);
  assert.match(html, /min-width:0/);
  assert.doesNotMatch(html, /max-height:75vh/);
  for (const [, source] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new vm.Script(source));
});

test('pricing controller rejects blank values, sends revisions, and preserves draft edits', async () => {
  const html = renderPricingPage('test-token');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
  const elements = new Map(), requests = [];
  const priceInputs = [];

  function nodes(selector) {
    if (selector === '.price-input') return priceInputs;
    return [];
  }

  function element(id) {
    if (elements.has(id)) return elements.get(id);
    const attributes = new Map(), classes = new Set();
    const value = {
      id, value: '', textContent: '', dataset: {}, style: {}, disabled: false,
      classList: {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        contains: name => classes.has(name),
        toggle(name, force) {
          const enabled = force === undefined ? !classes.has(name) : Boolean(force);
          enabled ? classes.add(name) : classes.delete(name);
          return enabled;
        }
      },
      setAttribute(name, content) { attributes.set(name, String(content)); },
      getAttribute(name) { return attributes.get(name) ?? null; },
      removeAttribute(name) { attributes.delete(name); },
      addEventListener() {},
      focus() {}
    };
    elements.set(id, value);
    return value;
  }

  for (const [identity, options] of Object.entries(BASE_PRICES)) {
    for (const [option, price] of Object.entries(options)) {
      const input = element(`${identity}.${option}`);
      input.value = String(price);
      input.dataset = { identity, option, original: String(price) };
      priceInputs.push(input);
    }
  }

  const document = {
    getElementById: element,
    querySelectorAll: nodes
  };
  const context = vm.createContext({
    document,
    window: { addEventListener() {}, LPClubOpsPricing: null },
    console,
    confirm: () => true,
    setTimeout: () => 1,
    clearTimeout() {},
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      if (!options.method) {
        return { ok: true, json: async () => ({ ok: true, prices: clonePrices(BASE_PRICES), revision: 3 }) };
      }
      const sent = JSON.parse(options.body);
      const prices = clonePrices(sent.prices || BASE_PRICES);
      return { ok: true, json: async () => ({ ok: true, prices, revision: Number(sent.revision || 3) + 1 }) };
    }
  });
  vm.runInContext(script, context);
  await vm.runInContext('fetchPricing({silent:true})', context);

  const gp = priceInputs.find(input => input.dataset.identity === 'gp' && input.dataset.option === 'ticket');
  gp.value = '';
  assert.throws(() => vm.runInContext('collectPricesFromInputs()', context), /non-negative integer/i);
  gp.value = '2500';
  const before = requests.length;
  await vm.runInContext('fetchPricing({preserveDirty:true})', context);
  assert.equal(requests.length, before, 'a tab refresh must not overwrite unsaved edits');
  await vm.runInContext('savePrices()', context);
  const saved = requests.at(-1);
  assert.equal(saved.url, 'api/admin/pricing');
  assert.equal(saved.options.headers['X-Admin-Token'], undefined);
  assert.equal(JSON.parse(saved.options.body).revision, 3);
  assert.equal(JSON.parse(saved.options.body).prices.gp.ticket, 2500);

});

function request(server, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port: server.address().port, path,
      method: options.method || 'GET', headers: options.headers || {}
    }, response => {
      let body = '';
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        let payload = null;
        try { payload = JSON.parse(body); } catch (_) {}
        resolve({ status: response.statusCode, body, payload, headers: response.headers });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

test('HTTP pricing routes use the database-backed store and require authentication', async () => {
  let state = { prices: clonePrices(BASE_PRICES), revision: 1 };
  const pricingStore = {
    async get() { return { prices: clonePrices(state.prices), revision: state.revision }; },
    async packages() { return { ...await this.get(), packages: buildPackages(state.prices) }; },
    async update(prices, revision) {
      assert.equal(revision, state.revision);
      state = { prices: clonePrices(prices), revision: revision + 1 };
      return this.get();
    },
    async reset(revision) {
      state = { prices: clonePrices(BASE_PRICES), revision: revision + 1 };
      return this.get();
    }
  };
  const backend = createBackend({
    env: { ADMIN_TOKEN: 'super-secret-token', ADMIN_PASSWORD_HASH: require('../server/admin-auth').hashPassword('admin-test-password'), ADMIN_JWT_SECRET: 'k'.repeat(48) },
    pricingStore,
    db: {
      query: async () => [],
      transaction: async work => work({ query: async () => [] }),
      health: async () => ({ ok: true, schemaReady: true })
    }
  });
  await new Promise(resolve => backend.server.listen(0, '127.0.0.1', resolve));
  try {
    assert.equal((await request(backend.server, '/pricing-admin')).status, 302);
    const origin = 'http://127.0.0.1:' + backend.server.address().port;
    const login = await request(backend.server, '/api/admin/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: { username: 'admin', password: 'admin-test-password' } });
    assert.equal(login.status, 200);
    const authHeaders = { Cookie: login.headers['set-cookie'][0].split(';')[0], Origin: origin, 'X-CSRF-Token': login.payload.csrfToken };
    assert.equal((await request(backend.server, '/pricing-admin?token=super-secret-token')).status, 302);
    assert.equal((await request(backend.server, '/pricing-admin', { headers: authHeaders })).status, 200);
    assert.equal((await request(backend.server, '/api/admin/pricing')).status, 401);

    const initial = await request(backend.server, '/api/admin/pricing', {
      headers: authHeaders
    });
    assert.equal(initial.status, 200);
    assert.equal(initial.payload.revision, 1);

    const next = clonePrices(initial.payload.prices);
    next.gp.ticket = 2500;
    const saved = await request(backend.server, '/api/admin/pricing', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: { prices: next, revision: 1 }
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.payload.revision, 2);
    assert.equal(saved.payload.prices.gp.ticket, 2500);

    const catalogue = await request(backend.server, '/api/packages');
    assert.equal(catalogue.status, 200);
    assert.equal(catalogue.payload.packages.find(item => item.id === 'gp_ticket').price, 2500);

    const reset = await request(backend.server, '/api/admin/pricing', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: { reset: true, revision: 2 }
    });
    assert.equal(reset.status, 200);
    assert.equal(reset.payload.revision, 3);
    assert.equal(reset.payload.prices.gp.ticket, 2000);
  } finally {
    await new Promise(resolve => backend.server.close(resolve));
  }
});
