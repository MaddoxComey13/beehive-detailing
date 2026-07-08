// Shared Jobber API helper: OAuth token storage/refresh + GraphQL requests.
//
// Tokens are stored in Netlify Blobs (not env vars) because Jobber rotates
// refresh tokens on every use -- a running function can't rewrite its own
// env vars, but it can write to Blobs. See:
// https://developer.getjobber.com/docs/building_your_app/refresh_token_rotation/

import { getStore } from '@netlify/blobs';

const TOKEN_ENDPOINT = 'https://api.getjobber.com/api/oauth/token';
const AUTHORIZE_ENDPOINT = 'https://api.getjobber.com/api/oauth/authorize';
const GRAPHQL_ENDPOINT = 'https://api.getjobber.com/api/graphql';

// Jobber's API is date-versioned. Set JOBBER_API_VERSION in env if you need
// to pin a specific version; otherwise this default is used.
const API_VERSION = process.env.JOBBER_API_VERSION || '2025-04-16';

const TOKEN_STORE_NAME = 'jobber-tokens';
const TOKEN_KEY = 'current';

// Refresh a bit before actual expiry to avoid using a token that dies
// mid-request.
const EXPIRY_BUFFER_MS = 60 * 1000;

function tokenStore() {
  return getStore(TOKEN_STORE_NAME);
}

export function buildAuthorizeUrl(state) {
  const clientId = requireEnv('JOBBER_CLIENT_ID');
  const redirectUri = requireEnv('JOBBER_REDIRECT_URI');
  const url = new URL(AUTHORIZE_ENDPOINT);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeCodeForTokens(code) {
  const body = new URLSearchParams({
    client_id: requireEnv('JOBBER_CLIENT_ID'),
    client_secret: requireEnv('JOBBER_CLIENT_SECRET'),
    grant_type: 'authorization_code',
    code,
    redirect_uri: requireEnv('JOBBER_REDIRECT_URI'),
  });
  const tokens = await postToken(body);
  await saveTokens(tokens);
  return tokens;
}

async function refreshTokens(refreshToken) {
  const body = new URLSearchParams({
    client_id: requireEnv('JOBBER_CLIENT_ID'),
    client_secret: requireEnv('JOBBER_CLIENT_SECRET'),
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const tokens = await postToken(body);
  await saveTokens(tokens);
  return tokens;
}

async function postToken(body) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jobber token request failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function saveTokens(tokens) {
  const record = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + tokens.expires_in * 1000,
  };
  await tokenStore().setJSON(TOKEN_KEY, record);
  return record;
}

async function loadTokens() {
  const record = await tokenStore().get(TOKEN_KEY, { type: 'json' });
  if (!record) {
    throw new Error(
      'No Jobber tokens stored yet. Visit /.netlify/functions/jobber-auth-start once to authorize this app against your Jobber account.'
    );
  }
  return record;
}

export async function getValidAccessToken() {
  const stored = await loadTokens();
  if (Date.now() < stored.expires_at - EXPIRY_BUFFER_MS) {
    return stored.access_token;
  }
  const refreshed = await refreshTokens(stored.refresh_token);
  return refreshed.access_token;
}

export async function jobberGraphQL(query, variables = {}) {
  const accessToken = await getValidAccessToken();
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'X-JOBBER-GRAPHQL-VERSION': API_VERSION,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(`Jobber GraphQL error: ${JSON.stringify(json.errors || json)}`);
  }
  return json.data;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
