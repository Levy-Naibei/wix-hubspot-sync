const API_BASE = (import.meta.env.VITE_API_URL as string) || '';

// Extract siteId from Wix Dashboard instance param
function getSiteId(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('siteId') || params.get('instance') || 'dev-site-id';
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const siteId = getSiteId();
  const url = `${API_BASE}${path}`;

  const resp = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-dev-site-id': siteId, // dev fallback
      'x-wix-site-id': siteId,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error((err as { error?: string }).error || `HTTP ${resp.status}`);
  }

  return resp.json() as Promise<T>;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface ConnectionStatus {
  connected: boolean;
  portalId: string | null;
}

export const authApi = {
  getStatus: () => request<ConnectionStatus>('GET', '/api/auth/status'),
  getAuthUrl: () => request<{ authUrl: string }>('GET', '/api/auth/hubspot'),
  disconnect: () => request<{ success: boolean }>('DELETE', '/api/auth/disconnect'),
};

// ─── Field Mapping ───────────────────────────────────────────────────────────

export interface FieldMapping {
  id?: number;
  wixField: string;
  hubspotProperty: string;
  direction: 'wix_to_hubspot' | 'hubspot_to_wix' | 'bidirectional';
  transform?: 'trim' | 'lowercase' | 'uppercase' | null;
}

export interface WixField {
  name: string;
  label: string;
  type: string;
}

export interface HubSpotProperty {
  name: string;
  label: string;
  type: string;
}

export const fieldMappingApi = {
  getMappings: () => request<{ mappings: FieldMapping[] }>('GET', '/api/field-mapping'),
  saveMappings: (mappings: FieldMapping[]) =>
    request<{ success: boolean; count: number }>('POST', '/api/field-mapping', { mappings }),
  getWixFields: () => request<{ fields: WixField[] }>('GET', '/api/field-mapping/wix-fields'),
  getHubSpotProperties: () =>
    request<{ properties: HubSpotProperty[] }>('GET', '/api/field-mapping/hubspot-properties'),
};

// ─── Sync ─────────────────────────────────────────────────────────────────────

export interface SyncLogEntry {
  id: number;
  direction: string;
  wix_contact_id: string | null;
  hubspot_contact_id: string | null;
  status: 'success' | 'skipped' | 'error';
  reason: string | null;
  correlation_id: string;
  created_at: string;
}

export interface SyncStats {
  total: number;
  success: number;
  errors: number;
  mappedContacts: number;
  last24h: number;
}

export const syncApi = {
  getLog: (limit = 50) =>
    request<{ entries: SyncLogEntry[] }>('GET', `/api/sync/log?limit=${limit}`),
  getStats: () => request<SyncStats>('GET', '/api/sync/stats'),
};
