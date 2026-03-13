import { Client as HubSpotClient } from '@hubspot/api-client';
import { FilterOperatorEnum } from '@hubspot/api-client/lib/codegen/crm/contacts';
import { config } from '../config';
import { tokenService } from './token.service';
import { HubSpotContact, HubSpotTokens } from '../types';
import { logger } from '../utils/logger';

export class HubSpotService {
  private async getClient(siteId: string): Promise<HubSpotClient> {
    const tokens = await this.getValidTokens(siteId);
    const client = new HubSpotClient({ accessToken: tokens.accessToken });
    return client;
  }

  /** Get tokens, refreshing if they are within 5 minutes of expiry */
  async getValidTokens(siteId: string): Promise<HubSpotTokens> {
    const tokens = await tokenService.get(siteId);
    if (!tokens) throw new Error(`No HubSpot tokens for site ${siteId}`);

    const fiveMinMs = 5 * 60 * 1000;
    if (Date.now() >= tokens.expiresAt - fiveMinMs) {
      return this.refreshTokens(siteId, tokens.refreshToken);
    }
    return tokens;
  }

  private async refreshTokens(siteId: string, refreshToken: string): Promise<HubSpotTokens> {
    logger.info('Refreshing HubSpot tokens', { siteId });

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.hubspot.clientId,
      client_secret: config.hubspot.clientSecret,
      redirect_uri: config.hubspot.redirectUri,
      refresh_token: refreshToken,
    });

    const resp = await globalThis.fetch(config.hubspot.oauthTokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Token refresh failed: ${err}`);
    }

    const data = await resp.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      token_type: string;
    };

    const newTokens: HubSpotTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      scope: config.hubspot.scopes,
      tokenType: data.token_type,
    };

    await tokenService.save(siteId, newTokens);
    return newTokens;
  }

  /** Exchange authorization code for tokens (OAuth callback) */
  async exchangeCode(code: string): Promise<{ tokens: HubSpotTokens; portalId: string }> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.hubspot.clientId,
      client_secret: config.hubspot.clientSecret,
      redirect_uri: config.hubspot.redirectUri,
      code,
    });

    const resp = await globalThis.fetch(config.hubspot.oauthTokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Token exchange failed: ${err}`);
    }

    const data = await resp.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      token_type: string;
    };

    const tokens: HubSpotTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      scope: config.hubspot.scopes,
      tokenType: data.token_type,
    };

    // Get portal ID from token info endpoint
    const infoResp = await globalThis.fetch(
      'https://api.hubapi.com/oauth/v1/access-tokens/' + encodeURIComponent(data.access_token),
    );
    const info = await infoResp.json() as { hub_id?: number };
    const portalId = String(info.hub_id ?? '');

    return { tokens, portalId };
  }

  /** Fetch all contact properties from HubSpot */
  async getContactProperties(siteId: string): Promise<Array<{ name: string; label: string; type: string }>> {
    const client = await this.getClient(siteId);
    const resp = await client.crm.properties.coreApi.getAll('contacts');
    return resp.results.map((p) => ({
      name: p.name,
      label: p.label,
      type: p.type,
    }));
  }

  /** Get a contact by HubSpot ID */
  async getContact(siteId: string, hubspotContactId: string): Promise<HubSpotContact> {
    const client = await this.getClient(siteId);
    const resp = await client.crm.contacts.basicApi.getById(hubspotContactId, [
      'email', 'firstname', 'lastname', 'phone',
      'wix_contact_id', 'wix_sync_correlation_id', 'wix_sync_source',
    ]);
    return {
      id: resp.id,
      properties: resp.properties as Record<string, string | null>,
      createdAt: resp.createdAt?.toISOString(),
      updatedAt: resp.updatedAt?.toISOString(),
    };
  }

  /** Create a new HubSpot contact */
  async createContact(
    siteId: string,
    properties: Record<string, string>,
  ): Promise<HubSpotContact> {
    const client = await this.getClient(siteId);
    const resp = await client.crm.contacts.basicApi.create({ properties, associations: [] });
    logger.info('HubSpot contact created', { hubspotContactId: resp.id });
    return {
      id: resp.id,
      properties: resp.properties as Record<string, string | null>,
      createdAt: resp.createdAt?.toISOString(),
      updatedAt: resp.updatedAt?.toISOString(),
    };
  }

  /** Update an existing HubSpot contact */
  async updateContact(
    siteId: string,
    hubspotContactId: string,
    properties: Record<string, string>,
  ): Promise<HubSpotContact> {
    const client = await this.getClient(siteId);
    const resp = await client.crm.contacts.basicApi.update(hubspotContactId, { properties });
    logger.info('HubSpot contact updated', { hubspotContactId });
    return {
      id: resp.id,
      properties: resp.properties as Record<string, string | null>,
      updatedAt: resp.updatedAt?.toISOString(),
    };
  }

  /** Upsert by email (for form submissions) */
  async upsertContactByEmail(
    siteId: string,
    email: string,
    properties: Record<string, string>,
  ): Promise<HubSpotContact> {
    const client = await this.getClient(siteId);

    // Try search first
    const searchResp = await client.crm.contacts.searchApi.doSearch({
      filterGroups: [{
        filters: [{ propertyName: 'email', operator: FilterOperatorEnum.Eq, value: email }],
      }],
      properties: ['email'],
      limit: 1,
      after: '0',
      sorts: [],
    });

    if (searchResp.results.length > 0) {
      const id = searchResp.results[0].id;
      return this.updateContact(siteId, id, properties);
    }

    return this.createContact(siteId, { email, ...properties });
  }

  /** Register or update HubSpot webhook subscriptions */
  async setupWebhooks(siteId: string, callbackUrl: string): Promise<void> {
    const tokens = await this.getValidTokens(siteId);
    const resp = await globalThis.fetch(
      `https://api.hubapi.com/webhooks/v3/${config.hubspot.appId}/settings`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ targetUrl: callbackUrl }),
      },
    );
    if (!resp.ok) {
      logger.warn('Webhook settings update returned non-OK', { status: resp.status });
    }

    // Subscribe to contact events
    for (const eventType of ['contact.creation', 'contact.propertyChange']) {
      await globalThis.fetch(
        `https://api.hubapi.com/webhooks/v3/${config.hubspot.appId}/subscriptions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ eventType, active: true }),
        },
      );
    }
    logger.info('HubSpot webhooks configured', { callbackUrl });
  }
}

export const hubspotService = new HubSpotService();
