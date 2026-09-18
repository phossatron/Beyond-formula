'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const adapterPath = require.resolve('../api/opc-user-directory.js');

function loadAdapter() {
  delete require.cache[adapterPath];
  return require(adapterPath);
}

function responseRecorder() {
  const state = { status: null, headers: {}, body: null };
  return {
    state,
    status(code) { state.status = code; return this; },
    setHeader(name, value) { state.headers[name.toLowerCase()] = value; return this; },
    json(body) { state.body = body; return this; },
    end(body) { state.body = body == null ? null : body; return this; },
  };
}

const request = { method: 'GET', headers: { authorization: 'Bearer formula-user-token' } };

test('Formula adapter keeps the OPC report token server-side and returns the directory', async () => {
  const previousUrl = process.env.OPC_USER_DIRECTORY_URL;
  const previousToken = process.env.OPC_USER_DIRECTORY_TOKEN;
  const previousAuthUrl = process.env.FORMULA_AUTH_USER_URL;
  const previousAuthKey = process.env.FORMULA_AUTH_API_KEY;
  const previousFetch = global.fetch;
  try {
    process.env.OPC_USER_DIRECTORY_URL = 'https://opc-staging.example.test/api/integrations/v1/formula/users';
    process.env.OPC_USER_DIRECTORY_TOKEN = 'server-token-that-is-never-browser-visible-123456789';
    process.env.FORMULA_AUTH_USER_URL = 'https://formula-auth.example.test/auth/v1/user';
    process.env.FORMULA_AUTH_API_KEY = 'formula-publishable-key-for-server-check-123456789';
    let upstream = null;
    global.fetch = async (url, options) => {
      if (url === process.env.FORMULA_AUTH_USER_URL) {
        assert.equal(options.headers.Authorization, request.headers.authorization);
        return new Response(JSON.stringify({ id: 'formula-user-1', email: 'admin@example.test' }), { status: 200 });
      }
      upstream = { url, options };
      return new Response(JSON.stringify({
          contract_version: 'opc-user-directory-v1',
          source_system: 'opc-workflow',
          generated_at: '2026-09-18T00:00:00.000Z',
          users: [{ source_record_id: 'opc-1' }],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
    };
    const reply = responseRecorder();
    await loadAdapter()(request, reply);
    assert.equal(reply.state.status, 200);
    assert.deepEqual(reply.state.body, {
      contract_version: 'opc-user-directory-v1',
      source_system: 'opc-workflow',
      generated_at: '2026-09-18T00:00:00.000Z',
      users: [{ source_record_id: 'opc-1' }],
    });
    assert.equal(upstream.url, process.env.OPC_USER_DIRECTORY_URL);
    assert.equal(upstream.options.headers['x-report-token'], process.env.OPC_USER_DIRECTORY_TOKEN);
    assert.equal(reply.state.headers['cache-control'], 'private, no-store, max-age=0');
  } finally {
    if (previousUrl === undefined) delete process.env.OPC_USER_DIRECTORY_URL; else process.env.OPC_USER_DIRECTORY_URL = previousUrl;
    if (previousToken === undefined) delete process.env.OPC_USER_DIRECTORY_TOKEN; else process.env.OPC_USER_DIRECTORY_TOKEN = previousToken;
    if (previousAuthUrl === undefined) delete process.env.FORMULA_AUTH_USER_URL; else process.env.FORMULA_AUTH_USER_URL = previousAuthUrl;
    if (previousAuthKey === undefined) delete process.env.FORMULA_AUTH_API_KEY; else process.env.FORMULA_AUTH_API_KEY = previousAuthKey;
    global.fetch = previousFetch;
  }
});

test('Formula adapter rejects callers without an authenticated Formula session', async () => {
  const previousUrl = process.env.OPC_USER_DIRECTORY_URL;
  const previousToken = process.env.OPC_USER_DIRECTORY_TOKEN;
  const previousAuthUrl = process.env.FORMULA_AUTH_USER_URL;
  const previousAuthKey = process.env.FORMULA_AUTH_API_KEY;
  try {
    process.env.OPC_USER_DIRECTORY_URL = 'https://opc-staging.example.test/api/integrations/v1/formula/users';
    process.env.OPC_USER_DIRECTORY_TOKEN = 'server-token-that-is-never-browser-visible-123456789';
    process.env.FORMULA_AUTH_USER_URL = 'https://formula-auth.example.test/auth/v1/user';
    process.env.FORMULA_AUTH_API_KEY = 'formula-publishable-key-for-server-check-123456789';
    const reply = responseRecorder();
    await loadAdapter()({ method: 'GET', headers: {} }, reply);
    assert.equal(reply.state.status, 401);
    assert.deepEqual(reply.state.body, { error: 'authentication required' });
  } finally {
    if (previousUrl === undefined) delete process.env.OPC_USER_DIRECTORY_URL; else process.env.OPC_USER_DIRECTORY_URL = previousUrl;
    if (previousToken === undefined) delete process.env.OPC_USER_DIRECTORY_TOKEN; else process.env.OPC_USER_DIRECTORY_TOKEN = previousToken;
    if (previousAuthUrl === undefined) delete process.env.FORMULA_AUTH_USER_URL; else process.env.FORMULA_AUTH_USER_URL = previousAuthUrl;
    if (previousAuthKey === undefined) delete process.env.FORMULA_AUTH_API_KEY; else process.env.FORMULA_AUTH_API_KEY = previousAuthKey;
  }
});

test('Formula adapter fails closed when the OPC endpoint is not configured', async () => {
  const previousUrl = process.env.OPC_USER_DIRECTORY_URL;
  const previousToken = process.env.OPC_USER_DIRECTORY_TOKEN;
  const previousAuthUrl = process.env.FORMULA_AUTH_USER_URL;
  const previousAuthKey = process.env.FORMULA_AUTH_API_KEY;
  try {
    delete process.env.OPC_USER_DIRECTORY_URL;
    delete process.env.OPC_USER_DIRECTORY_TOKEN;
    delete process.env.FORMULA_AUTH_USER_URL;
    delete process.env.FORMULA_AUTH_API_KEY;
    const reply = responseRecorder();
    await loadAdapter()(request, reply);
    assert.equal(reply.state.status, 503);
    assert.deepEqual(reply.state.body, { error: 'OPC user directory adapter unavailable' });
  } finally {
    if (previousUrl === undefined) delete process.env.OPC_USER_DIRECTORY_URL; else process.env.OPC_USER_DIRECTORY_URL = previousUrl;
    if (previousToken === undefined) delete process.env.OPC_USER_DIRECTORY_TOKEN; else process.env.OPC_USER_DIRECTORY_TOKEN = previousToken;
    if (previousAuthUrl === undefined) delete process.env.FORMULA_AUTH_USER_URL; else process.env.FORMULA_AUTH_USER_URL = previousAuthUrl;
    if (previousAuthKey === undefined) delete process.env.FORMULA_AUTH_API_KEY; else process.env.FORMULA_AUTH_API_KEY = previousAuthKey;
  }
});
