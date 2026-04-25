import type { Asset, PicturesResponse, EventDocument, ThirdParty } from '../types';
import { getAccessToken, logout } from './auth-code';

/**
 * API base URL. In dev + prod we use relative paths so the request
 * goes through Vite's dev proxy or the Express server's /api proxy.
 */
const API_BASE = '';
const THIRD_PARTY_ID = import.meta.env.VITE_THIRD_PARTY_ID || '2';

async function apiFetch(path: string): Promise<Response> {
  const token = await getAccessToken();
  return fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Third-Party': THIRD_PARTY_ID,
      Accept: 'application/json',
    },
  });
}

function handleAuthFailure(status: number): void {
  if (status === 401) {
    // Token was rejected — send the user back through Keycloak login.
    logout();
  }
}

/** Fetch asset data (thing) from Countroll API */
export async function fetchAsset(assetId: string): Promise<Asset> {
  const response = await apiFetch(`/api/thing/${encodeURIComponent(assetId)}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Asset not found: ${assetId}`);
    }
    handleAuthFailure(response.status);
    const errorText = await response.text();
    throw new Error(`API request failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

/** Fetch pictures for an asset */
export async function fetchPictures(assetId: string): Promise<PicturesResponse> {
  const response = await apiFetch(`/api/assets/${encodeURIComponent(assetId)}/pictures`);

  if (!response.ok) {
    if (response.status === 404) {
      return { pictureEvents: [] };
    }
    handleAuthFailure(response.status);
    const errorText = await response.text();
    throw new Error(`Pictures API request failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

/** Fetch a third party (customer/partner) by id */
export async function fetchThirdParty(thirdPartyId: string): Promise<ThirdParty> {
  const response = await apiFetch(`/api/thirdParty/${encodeURIComponent(thirdPartyId)}`);

  if (!response.ok) {
    handleAuthFailure(response.status);
    throw new Error(`Third party API request failed (${response.status})`);
  }

  return response.json();
}

/** Fetch documents attached to a specific event */
export async function fetchEventDocuments(assetId: string, eventId: string): Promise<EventDocument[]> {
  const response = await apiFetch(
    `/api/assets/${encodeURIComponent(assetId)}/events/${encodeURIComponent(eventId)}/documents`,
  );

  if (!response.ok) return [];

  return response.json();
}

/** Resolve a time-limited thumbnail URL for an event document image */
export async function fetchDocumentThumbnailUrl(
  assetId: string,
  eventId: string,
  imageName: string,
): Promise<string> {
  const response = await apiFetch(
    `/api/assets/${encodeURIComponent(assetId)}/events/${encodeURIComponent(eventId)}/thumbnails/${encodeURIComponent(imageName)}`,
  );

  if (!response.ok) return '';

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('json')) {
    const data = await response.json();
    return data.url || data.downloadUrl || '';
  }
  return await response.text();
}
