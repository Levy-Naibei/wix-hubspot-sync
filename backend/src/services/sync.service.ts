import NodeCache from 'node-cache';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { hubspotService } from './hubspot.service';
import { wixService } from './wix.service';
import { FieldMapping, SyncResult, WixContact, HubSpotContact } from '../types';
import { logger } from '../utils/logger';
import { config } from '../config';

// ─── Deduplication Cache ─────────────────────────────────────────────────────
// TTL-based in-memory cache to track correlation IDs of our own writes.
// If a webhook arrives with a correlationId in this cache → it was produced by
// our own write → skip to prevent ping-pong loops.
const dedupCache = new NodeCache({
  stdTTL: config.sync.dedupWindowMs / 1000,
  checkperiod: 10,
});

function markWritten(correlationId: string): void {
  dedupCache.set(correlationId, true);
}

function wasWrittenByUs(correlationId: string): boolean {
  return dedupCache.has(correlationId);
}

// ─── Field Mapping Helpers ───────────────────────────────────────────────────

function getFieldMappings(siteId: string): FieldMapping[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM field_mappings WHERE site_id = ?')
    .all(siteId) as FieldMapping[];
}

function applyTransform(value: string, transform?: string | null): string {
  if (!transform || !value) return value;
  switch (transform) {
    case 'trim': return value.trim();
    case 'lowercase': return value.toLowerCase();
    case 'uppercase': return value.toUpperCase();
    default: return value;
  }
}

function buildHubSpotProperties(
  wixContact: WixContact,
  mappings: FieldMapping[],
  correlationId: string,
  source: 'wix' | 'hubspot',
): Record<string, string> {
  const props: Record<string, string> = {
    wix_contact_id: wixContact.id,
    wix_sync_correlation_id: correlationId,
    wix_sync_source: source,
  };

  const wixData: Record<string, string | undefined> = {
    primaryEmail: wixContact.primaryEmail,
    firstName: wixContact.firstName,
    lastName: wixContact.lastName,
    primaryPhone: wixContact.phones?.[0]?.phone,
  };

  for (const mapping of mappings) {
    if (mapping.direction === 'hubspot_to_wix') continue;
    const rawVal = wixData[mapping.wixField];
    if (rawVal !== undefined && rawVal !== null) {
      props[mapping.hubspotProperty] = applyTransform(rawVal, mapping.transform);
    }
  }

  return props;
}

function buildWixFields(
  hsContact: HubSpotContact,
  mappings: FieldMapping[],
): Partial<WixContact> {
  const wixFields: Partial<WixContact> & { primaryEmail?: string; firstName?: string; lastName?: string } = {};

  for (const mapping of mappings) {
    if (mapping.direction === 'wix_to_hubspot') continue;
    const val = hsContact.properties[mapping.hubspotProperty];
    if (val !== undefined && val !== null) {
      const transformed = applyTransform(val, mapping.transform);
      switch (mapping.wixField) {
        case 'primaryEmail': wixFields.primaryEmail = transformed; break;
        case 'firstName': wixFields.firstName = transformed; break;
        case 'lastName': wixFields.lastName = transformed; break;
      }
    }
  }

  return wixFields;
}

// ─── Contact Mapping Store ───────────────────────────────────────────────────

function getContactMappingByWix(wixId: string): { hubspotContactId: string } | null {
  const db = getDb();
  return db.prepare('SELECT hubspot_contact_id as hubspotContactId FROM contact_mappings WHERE wix_contact_id = ?').get(wixId) as { hubspotContactId: string } | null;
}

function getContactMappingByHubSpot(hsId: string): { wixContactId: string } | null {
  const db = getDb();
  return db.prepare('SELECT wix_contact_id as wixContactId FROM contact_mappings WHERE hubspot_contact_id = ?').get(hsId) as { wixContactId: string } | null;
}

function upsertContactMapping(
  wixId: string,
  hsId: string,
  source: 'wix' | 'hubspot',
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO contact_mappings (wix_contact_id, hubspot_contact_id, last_synced_at, last_sync_source)
    VALUES (?, ?, datetime('now'), ?)
    ON CONFLICT(wix_contact_id) DO UPDATE SET
      hubspot_contact_id = excluded.hubspot_contact_id,
      last_synced_at = excluded.last_synced_at,
      last_sync_source = excluded.last_sync_source
  `).run(wixId, hsId, source);
}

function logSync(
  siteId: string,
  direction: string,
  status: 'success' | 'skipped' | 'error',
  correlationId: string,
  opts: { wixContactId?: string; hubspotContactId?: string; reason?: string } = {},
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO sync_log (site_id, direction, wix_contact_id, hubspot_contact_id, status, reason, correlation_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    siteId,
    direction,
    opts.wixContactId ?? null,
    opts.hubspotContactId ?? null,
    status,
    opts.reason ?? null,
    correlationId,
  );
}

// ─── Core Sync Methods ───────────────────────────────────────────────────────

export class SyncService {
  /**
   * Sync a Wix contact to HubSpot.
   * Called when Wix fires a CONTACT_CREATED or CONTACT_UPDATED webhook.
   */
  async syncWixToHubSpot(
    siteId: string,
    wixContact: WixContact,
    incomingCorrelationId?: string,
  ): Promise<SyncResult> {
    const correlationId = uuidv4();

    // ── Loop prevention: was this change produced by our own HubSpot→Wix write?
    if (incomingCorrelationId && wasWrittenByUs(incomingCorrelationId)) {
      logger.debug('Skipping Wix→HubSpot: produced by our own write', { incomingCorrelationId });
      logSync(siteId, 'wix_to_hubspot', 'skipped', correlationId, {
        wixContactId: wixContact.id,
        reason: 'correlation_id_dedup',
      });
      return { success: true, action: 'skipped', correlationId, reason: 'dedup' };
    }

    const mappings = getFieldMappings(siteId);
    const props = buildHubSpotProperties(wixContact, mappings, correlationId, 'wix');
    const existingMapping = getContactMappingByWix(wixContact.id);

    try {
      let hsContact: HubSpotContact;

      if (existingMapping) {
        // Update existing HubSpot contact
        hsContact = await hubspotService.updateContact(siteId, existingMapping.hubspotContactId, props);
        markWritten(correlationId); // mark so HubSpot webhook for this write is ignored
        upsertContactMapping(wixContact.id, hsContact.id, 'wix');
        logSync(siteId, 'wix_to_hubspot', 'success', correlationId, {
          wixContactId: wixContact.id,
          hubspotContactId: hsContact.id,
          reason: 'updated',
        });
        return { success: true, action: 'updated', correlationId, wixContactId: wixContact.id, hubspotContactId: hsContact.id };
      } else {
        // Create new HubSpot contact
        if (!wixContact.primaryEmail) {
          logSync(siteId, 'wix_to_hubspot', 'skipped', correlationId, {
            wixContactId: wixContact.id,
            reason: 'no_email',
          });
          return { success: true, action: 'skipped', correlationId, reason: 'no_email' };
        }
        hsContact = await hubspotService.createContact(siteId, {
          email: wixContact.primaryEmail,
          ...props,
        });
        markWritten(correlationId);
        upsertContactMapping(wixContact.id, hsContact.id, 'wix');
        logSync(siteId, 'wix_to_hubspot', 'success', correlationId, {
          wixContactId: wixContact.id,
          hubspotContactId: hsContact.id,
          reason: 'created',
        });
        return { success: true, action: 'created', correlationId, wixContactId: wixContact.id, hubspotContactId: hsContact.id };
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logger.error('Wix→HubSpot sync failed', { wixContactId: wixContact.id, reason });
      logSync(siteId, 'wix_to_hubspot', 'error', correlationId, {
        wixContactId: wixContact.id,
        reason,
      });
      return { success: false, action: 'error', correlationId, reason };
    }
  }

  /**
   * Sync a HubSpot contact to Wix.
   * Called when HubSpot fires a contact.creation or contact.propertyChange webhook.
   */
  async syncHubSpotToWix(
    siteId: string,
    hubspotContactId: string,
    incomingCorrelationId?: string,
  ): Promise<SyncResult> {
    const correlationId = uuidv4();

    // ── Loop prevention: was this change produced by our own Wix→HubSpot write?
    if (incomingCorrelationId && wasWrittenByUs(incomingCorrelationId)) {
      logger.debug('Skipping HubSpot→Wix: produced by our own write', { incomingCorrelationId });
      logSync(siteId, 'hubspot_to_wix', 'skipped', correlationId, {
        hubspotContactId,
        reason: 'correlation_id_dedup',
      });
      return { success: true, action: 'skipped', correlationId, reason: 'dedup' };
    }

    try {
      const hsContact = await hubspotService.getContact(siteId, hubspotContactId);

      // ── Secondary loop check: if wix_sync_source == 'wix', this came from us
      if (hsContact.properties['wix_sync_source'] === 'wix') {
        const storedCorrelation = hsContact.properties['wix_sync_correlation_id'];
        if (storedCorrelation && wasWrittenByUs(storedCorrelation)) {
          logSync(siteId, 'hubspot_to_wix', 'skipped', correlationId, {
            hubspotContactId,
            reason: 'origin_tag_dedup',
          });
          return { success: true, action: 'skipped', correlationId, reason: 'origin_tag' };
        }
      }

      const mappings = getFieldMappings(siteId);
      const wixFields = buildWixFields(hsContact, mappings);
      const existingMapping = getContactMappingByHubSpot(hubspotContactId);

      let wixContact: WixContact;

      if (existingMapping) {
        // Update existing Wix contact
        wixContact = await wixService.updateContact(siteId, existingMapping.wixContactId, wixFields);
        markWritten(correlationId);
        upsertContactMapping(wixContact.id, hubspotContactId, 'hubspot');
        logSync(siteId, 'hubspot_to_wix', 'success', correlationId, {
          wixContactId: wixContact.id,
          hubspotContactId,
          reason: 'updated',
        });
        return { success: true, action: 'updated', correlationId, wixContactId: wixContact.id, hubspotContactId };
      } else {
        // Check if Wix already has this contact by email
        const email = hsContact.properties['email'];
        if (!email) {
          logSync(siteId, 'hubspot_to_wix', 'skipped', correlationId, { hubspotContactId, reason: 'no_email' });
          return { success: true, action: 'skipped', correlationId, reason: 'no_email' };
        }

        const existing = await wixService.queryContactByEmail(siteId, email);
        if (existing) {
          wixContact = await wixService.updateContact(siteId, existing.id, wixFields);
        } else {
          wixContact = await wixService.createContact(siteId, {
            primaryEmail: email,
            ...wixFields,
          });
        }

        markWritten(correlationId);
        upsertContactMapping(wixContact.id, hubspotContactId, 'hubspot');
        logSync(siteId, 'hubspot_to_wix', 'success', correlationId, {
          wixContactId: wixContact.id,
          hubspotContactId,
          reason: existing ? 'updated' : 'created',
        });
        return {
          success: true,
          action: existing ? 'updated' : 'created',
          correlationId,
          wixContactId: wixContact.id,
          hubspotContactId,
        };
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logger.error('HubSpot→Wix sync failed', { hubspotContactId, reason });
      logSync(siteId, 'hubspot_to_wix', 'error', correlationId, { hubspotContactId, reason });
      return { success: false, action: 'error', correlationId, reason };
    }
  }

  /** Get recent sync log entries for a site */
  getRecentSyncLog(
    siteId: string,
    limit = 50,
  ): Array<Record<string, unknown>> {
    const db = getDb();
    return db
      .prepare(`
        SELECT * FROM sync_log
        WHERE site_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(siteId, limit) as Array<Record<string, unknown>>;
  }
}

export const syncService = new SyncService();
