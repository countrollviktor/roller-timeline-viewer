/**
 * OAuth2 Authorization Code flow against Countroll's Keycloak.
 * No server-side credentials — every user logs in via Keycloak redirect.
 * Keycloak client must be public with Standard Flow enabled, and this app's
 * origin must appear in Valid Redirect URIs + Web Origins.
 *
 * Tokens live in memory only. On hard refresh, Keycloak SSO session cookies
 * allow a silent redirect-bounce to re-authenticate without user interaction.
 */

const TOKEN_URL =
  import.meta.env.VITE_OAUTH_TOKEN_URL ||
  'https://sso.countroll.com/realms/countroll-realm/protocol/openid-connect/token';
const CLIENT_ID = (import.meta.env.VITE_OAUTH_CLIENT_ID || '').trim();

const STATE_KEY = 'auth:state';

export interface UserInfo {
  name: string;
  preferredUsername: string;
}

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

let cachedToken: TokenData | null = null;

function getRedirectUri(): string {
  return typeof window !== 'undefined' ? window.location.origin + '/' : '';
}

function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

function storeState(state: string): void {
  try {
    sessionStorage.setItem(STATE_KEY, state);
  } catch {
    // sessionStorage unavailable — state check will fail, user retries
  }
}

function consumeState(): string | null {
  try {
    const state = sessionStorage.getItem(STATE_KEY);
    sessionStorage.removeItem(STATE_KEY);
    return state;
  } catch {
    return null;
  }
}

function buildAuthUrl(): string {
  const authEndpoint = TOKEN_URL.replace(/\/token$/, '/auth');
  const state = generateState();
  storeState(state);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: 'openid',
    state,
  });
  return `${authEndpoint}?${params.toString()}`;
}

function buildLogoutUrl(): string {
  const logoutEndpoint = TOKEN_URL.replace(/\/token$/, '/logout');
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    post_logout_redirect_uri: getRedirectUri(),
  });
  return `${logoutEndpoint}?${params.toString()}`;
}

async function exchangeCode(code: string): Promise<void> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    code,
    redirect_uri: getRedirectUri(),
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Code exchange failed: ${response.status}`);
  }

  const data = await response.json();
  cachedToken = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? '',
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

async function refreshGrant(refreshToken: string): Promise<boolean> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    refresh_token: refreshToken,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    return false;
  }

  const data = await response.json();
  cachedToken = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? '',
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return true;
}

/**
 * Initialize auth on app startup.
 * 1. If URL has ?code= + valid state, exchange code for tokens.
 * 2. Otherwise, caller decides whether to show a login button or auto-redirect.
 */
export async function initAuth(): Promise<UserInfo | null> {
  if (!CLIENT_ID) {
    throw new Error('Missing VITE_OAUTH_CLIENT_ID — set it in .env or App Service app settings.');
  }

  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');

  if (code) {
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    url.searchParams.delete('session_state');
    url.searchParams.delete('iss');
    window.history.replaceState({}, '', url.pathname + url.search);

    const expectedState = consumeState();
    if (!expectedState || expectedState !== returnedState) {
      window.location.href = buildAuthUrl();
      return null;
    }

    try {
      await exchangeCode(code);
      return getCurrentUser();
    } catch {
      // fall through — caller can surface login UI
    }
  }

  if (cachedToken?.refreshToken) {
    const ok = await refreshGrant(cachedToken.refreshToken);
    if (ok) return getCurrentUser();
    cachedToken = null;
  }

  return null;
}

/**
 * Get a valid access token. Refreshes automatically if expired.
 * Throws if refresh fails — caller should trigger logout.
 */
export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.accessToken;
  }

  if (cachedToken?.refreshToken) {
    const ok = await refreshGrant(cachedToken.refreshToken);
    if (ok && cachedToken) {
      return (cachedToken as TokenData).accessToken;
    }
    cachedToken = null;
  }

  throw new Error('Session expired');
}

export function login(): void {
  window.location.href = buildAuthUrl();
}

export function logout(): void {
  cachedToken = null;
  window.location.href = buildLogoutUrl();
}

export function isAuthenticated(): boolean {
  return !!cachedToken;
}

export function getCurrentUser(): UserInfo | null {
  if (!cachedToken) return null;
  try {
    const payload = cachedToken.accessToken.split('.')[1];
    const decoded = JSON.parse(atob(payload));
    return {
      name: decoded.name || decoded.preferred_username || '',
      preferredUsername: decoded.preferred_username || '',
    };
  } catch {
    return null;
  }
}
