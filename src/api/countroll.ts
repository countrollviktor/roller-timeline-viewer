import type { Asset, PicturesResponse } from '../types';

// Configuration from environment variables (Vite requires VITE_ prefix)
// In development, requests go through Vite proxy to avoid CORS
const isDev = import.meta.env.DEV;

const config = {
  // In dev mode, use proxy paths; in production, use full URLs
  tokenUrl: isDev
    ? '/auth/realms/countroll-realm/protocol/openid-connect/token'
    : (import.meta.env.VITE_OAUTH_TOKEN_URL || 'https://sso.countroll.com/realms/countroll-realm/protocol/openid-connect/token'),
  apiBaseUrl: isDev
    ? ''  // Empty string means relative URLs like /api/thing/...
    : (import.meta.env.VITE_COUNTROLL_API_URL || 'https://api.countroll.com'),
  clientId: import.meta.env.VITE_OAUTH_CLIENT_ID || 'countroll-client',
  username: import.meta.env.VITE_OAUTH_USERNAME || '',
  password: import.meta.env.VITE_OAUTH_PASSWORD || '',
  thirdPartyId: import.meta.env.VITE_THIRD_PARTY_ID || '2',
};

// Token cache
let cachedToken: string | null = null;
let tokenExpiry: number = 0;
let tokenPromise: Promise<string> | null = null;

/**
 * Get OAuth2 access token from Keycloak
 * Uses a lock to prevent concurrent token requests
 */
async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 10s buffer)
  if (cachedToken && Date.now() < tokenExpiry - 10000) {
    return cachedToken;
  }

  // If a token request is already in progress, wait for it
  if (tokenPromise) {
    return tokenPromise;
  }

  // Create a new token request and store the promise
  tokenPromise = fetchNewToken();

  try {
    const token = await tokenPromise;
    return token;
  } finally {
    tokenPromise = null;
  }
}

/**
 * Actually fetch a new token from Keycloak
 */
async function fetchNewToken(): Promise<string> {
  if (!config.username || !config.password) {
    throw new Error('Missing credentials. Set VITE_OAUTH_USERNAME and VITE_OAUTH_PASSWORD in .env file.');
  }

  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: config.clientId,
    username: config.username,
    password: config.password,
  });

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Authentication failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);

  return cachedToken;
}

/**
 * Fetch asset data from Countroll API
 */
export async function fetchAsset(assetId: string): Promise<Asset> {
  const accessToken = await getAccessToken();

  const url = `${config.apiBaseUrl}/api/thing/${encodeURIComponent(assetId)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Third-Party': config.thirdPartyId,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Asset not found: ${assetId}`);
    }
    const errorText = await response.text();
    throw new Error(`API request failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Fetch pictures for an asset from Countroll API
 */
export async function fetchPictures(assetId: string): Promise<PicturesResponse> {
  const accessToken = await getAccessToken();

  const url = `${config.apiBaseUrl}/api/assets/${encodeURIComponent(assetId)}/pictures`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Third-Party': config.thirdPartyId,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    // Pictures endpoint may return 404 if no pictures exist
    if (response.status === 404) {
      return { pictureEvents: [] };
    }
    const errorText = await response.text();
    throw new Error(`Pictures API request failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Check if API credentials are configured
 */
export function isApiConfigured(): boolean {
  return !!(config.username && config.password);
}
