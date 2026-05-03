/**
 * Typed wrappers around /api/stats/* endpoints. Each call attaches the
 * current Bearer token and the Third-Party header. Non-2xx responses
 * reject with a typed error so the page can render per-section error
 * states.
 */
import { getAccessToken } from './auth-code';

const THIRD_PARTY_ID = import.meta.env.VITE_THIRD_PARTY_ID || '2';

export interface Headline {
  sessionsToday: number;
  sessionsAvg: number;
  lookupsToday: number;
  lookupsAvg: number;
  activeToday: number;
  activeAvg: number;
  distinctAssetsToday: number;
  distinctAssets30d: number;
  lastEventAt: string | null;
}

export interface TrendDay {
  date: string;
  login: number;
  lookup: number;
}

export interface TopAsset {
  assetId: string;
  views: number;
  uniqueUsers: number;
  lastViewed: string | null;
}

export interface UserRow {
  username: string;
  sessions: number;
  lookups: number;
  assetsSeen: number;
  lastSeen: string | null;
}

export interface MeResponse {
  username: string;
  allowed: true;
}

export class StatsForbiddenError extends Error {
  constructor() {
    super('not authorized');
    this.name = 'StatsForbiddenError';
  }
}

async function statsFetch<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(path, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Third-Party': THIRD_PARTY_ID,
      Accept: 'application/json',
    },
  });
  if (res.status === 403) throw new StatsForbiddenError();
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const getMe        = () => statsFetch<MeResponse>('/api/stats/me');
export const getHeadline  = () => statsFetch<Headline>('/api/stats/headline');
export const getTrend     = () => statsFetch<TrendDay[]>('/api/stats/trend');
export const getTopAssets = () => statsFetch<TopAsset[]>('/api/stats/top-assets');
export const getUsers     = () => statsFetch<UserRow[]>('/api/stats/users');
