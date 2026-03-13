// ─── Shared domain types ────────────────────────────────────────────────────

export interface HubSpotTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix ms
  scope: string;
  tokenType: string;
}

export interface WixContact {
  id: string;
  primaryEmail?: string;
  firstName?: string;
  lastName?: string;
  phones?: Array<{ tag: string; countryCode: string; phone: string }>;
  updatedDate?: string;
  createdDate?: string;
  extendedFields?: Record<string, unknown>;
}

export interface HubSpotContact {
  id: string;
  properties: Record<string, string | null>;
  createdAt?: string;
  updatedAt?: string;
}

export interface FieldMapping {
  id?: number;
  wixField: string;
  hubspotProperty: string;
  direction: 'wix_to_hubspot' | 'hubspot_to_wix' | 'bidirectional';
  transform?: 'trim' | 'lowercase' | 'uppercase' | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ContactMapping {
  id?: number;
  wixContactId: string;
  hubspotContactId: string;
  lastSyncedAt: string;
  lastSyncSource: 'wix' | 'hubspot';
}

export interface SyncLogEntry {
  id?: number;
  direction: 'wix_to_hubspot' | 'hubspot_to_wix' | 'form_to_hubspot';
  wixContactId?: string;
  hubspotContactId?: string;
  status: 'success' | 'skipped' | 'error';
  reason?: string;
  correlationId: string;
  createdAt?: string;
}

export interface FormSubmission {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  customFields?: Record<string, string>;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  };
  pageUrl?: string;
  referrer?: string;
  submittedAt?: string;
}

export interface WixWebhookPayload {
  entityId: string;
  entityEventSequence: string;
  actionEvent: {
    body: {
      contact?: WixContact;
    };
  };
  event: string;
}

export interface HubSpotWebhookEvent {
  eventId: number;
  subscriptionId: number;
  portalId: number;
  appId: number;
  occurredAt: number;
  subscriptionType: string;
  attemptNumber: number;
  objectId: number;
  changeSource: string;
  propertyName?: string;
  propertyValue?: string;
}

export interface SyncResult {
  success: boolean;
  action: 'created' | 'updated' | 'skipped' | 'error';
  correlationId: string;
  reason?: string;
  wixContactId?: string;
  hubspotContactId?: string;
}
