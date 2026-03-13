import { config } from '../config';
import { WixContact } from '../types';
import { logger } from '../utils/logger';

/**
 * Wix API service for contacts management.
 * Uses Wix REST API with App credentials (server-to-server).
 * https://dev.wix.com/docs/rest/crm/members-contacts/contacts/contact-v4
 */
export class WixService {
  private async getHeaders(): Promise<Record<string, string>> {
    // Wix API key auth for self-hosted apps (server-side only)
    return {
      'Content-Type': 'application/json',
      'wix-site-id': '', // overridden per request with actual siteId
      Authorization: config.wix.appSecret,
    };
  }

  private async callApi<T>(
    siteId: string,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${config.wix.apiBaseUrl}${path}`;
    const headers = await this.getHeaders();
    headers['wix-site-id'] = siteId;

    const resp = await globalThis.fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Wix API ${method} ${path} failed [${resp.status}]: ${err}`);
    }

    return resp.json() as Promise<T>;
  }

  async getContact(siteId: string, contactId: string): Promise<WixContact> {
    const data = await this.callApi<{ contact: WixContact }>(
      siteId,
      'GET',
      `/contacts/v4/contacts/${contactId}`,
    );
    return data.contact;
  }

  async createContact(siteId: string, contact: Partial<WixContact>): Promise<WixContact> {
    const data = await this.callApi<{ contact: WixContact }>(
      siteId,
      'POST',
      '/contacts/v4/contacts',
      { info: contact },
    );
    logger.info('Wix contact created', { wixContactId: data.contact.id });
    return data.contact;
  }

  async updateContact(siteId: string, contactId: string, fields: Partial<WixContact>): Promise<WixContact> {
    const data = await this.callApi<{ contact: WixContact }>(
      siteId,
      'PATCH',
      `/contacts/v4/contacts/${contactId}`,
      { contact: { id: contactId, ...fields } },
    );
    logger.info('Wix contact updated', { wixContactId: contactId });
    return data.contact;
  }

  async queryContactByEmail(siteId: string, email: string): Promise<WixContact | null> {
    const data = await this.callApi<{ contacts: WixContact[] }>(
      siteId,
      'POST',
      '/contacts/v4/contacts/query',
      {
        query: {
          filter: { 'primaryInfo.email': { $eq: email } },
          paging: { limit: 1 },
        },
      },
    );
    return data.contacts?.[0] ?? null;
  }

  /** Returns standard Wix contact fields for the field mapping UI */
  getAvailableFields(): Array<{ name: string; label: string; type: string }> {
    return [
      { name: 'primaryEmail', label: 'Primary Email', type: 'string' },
      { name: 'firstName', label: 'First Name', type: 'string' },
      { name: 'lastName', label: 'Last Name', type: 'string' },
      { name: 'primaryPhone', label: 'Primary Phone', type: 'string' },
      { name: 'company', label: 'Company', type: 'string' },
      { name: 'jobTitle', label: 'Job Title', type: 'string' },
      { name: 'birthdate', label: 'Birthdate', type: 'date' },
      { name: 'locale', label: 'Locale', type: 'string' },
    ];
  }
}

export const wixService = new WixService();
