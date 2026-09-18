'use strict';

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
};

module.exports = async function opcUserDirectoryAdapter(request, response) {
  for (const [name, value] of Object.entries(PRIVATE_HEADERS)) response.setHeader(name, value);
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'method not allowed' });
  }

  const endpoint = String(process.env.OPC_USER_DIRECTORY_URL || '').trim();
  const token = String(process.env.OPC_USER_DIRECTORY_TOKEN || '').trim();
  const authUserUrl = String(process.env.FORMULA_AUTH_USER_URL || '').trim();
  const authApiKey = String(process.env.FORMULA_AUTH_API_KEY || '').trim();
  const authorization = request.headers?.authorization || request.headers?.Authorization || '';
  if (!/^Bearer\s+\S+$/i.test(String(authorization))) {
    return response.status(401).json({ error: 'authentication required' });
  }
  if (!endpoint || token.length < 32 || !authUserUrl || authApiKey.length < 32) {
    return response.status(503).json({ error: 'OPC user directory adapter unavailable' });
  }

  try {
    const authResponse = await fetch(authUserUrl, {
      method: 'GET',
      headers: { Accept: 'application/json', apikey: authApiKey, Authorization: String(authorization) },
      cache: 'no-store',
      redirect: 'error',
    });
    if (authResponse.status === 401 || authResponse.status === 403) {
      return response.status(401).json({ error: 'authentication required' });
    }
    if (!authResponse.ok) {
      return response.status(503).json({ error: 'Formula authentication unavailable' });
    }
    const identity = await authResponse.json();
    if (!identity || !identity.id || !identity.email) {
      return response.status(401).json({ error: 'authentication required' });
    }

    const upstream = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json', 'x-report-token': token },
      cache: 'no-store',
      redirect: 'error',
    });
    const payload = await upstream.json();
    if (!upstream.ok || !payload || !Array.isArray(payload.users)) {
      return response.status(503).json({ error: 'OPC user directory unavailable' });
    }
    return response.status(200).json({
      contract_version: payload.contract_version,
      source_system: payload.source_system,
      generated_at: payload.generated_at,
      users: payload.users,
    });
  } catch (error) {
    console.error('OPC user directory adapter unavailable', error);
    return response.status(503).json({ error: 'OPC user directory unavailable' });
  }
};
