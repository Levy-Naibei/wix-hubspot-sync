import NodeCache from 'node-cache';
import { v4 as uuidv4 } from 'uuid';
import { ContactMapping } from '../models/contactMapping.model.js';
import { FieldMapping, IFieldMapping } from '../models/fieldMapping.model.js';
import { SyncLog } from '../models/syncLog.model.js';
import { hubspotService } from './hubspot.service.js';
import { wixService } from './wix.service.js';
import { SyncResult, WixContact, HubSpotContact } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { config } from '../configs/index.js';

// ─── Deduplication Cache ──────
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
function wasWrittenByUs(id: string): boolean {
  return dedupCache.has(id);
}

// ─── Field mapping helpers ───
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
  mappings: IFieldMapping[],
  correlationId: string,
): Record<string, string> {
  const props: Record<string, string> = {
    wix_contact_id: wixContact.id,
    wix_sync_correlation_id: correlationId,
    wix_sync_source: 'wix',
  };
  const wixData: Record<string, string | undefined> = {
    primaryEmail: wixContact.primaryEmail,
    firstName: wixContact.firstName,
    lastName: wixContact.lastName,
    primaryPhone: wixContact.phones?.[0]?.phone,
  };
  for (const m of mappings) {
    if (m.direction === 'hubspot_to_wix') continue;
    const raw = wixData[m.wixField];
    if (raw != null) props[m.hubspotProperty] = applyTransform(raw, m.transform);
  }
  return props;
}

function buildWixFields(
  hsContact: HubSpotContact,
  mappings: IFieldMapping[],
): Partial<WixContact> {
  const fields: Record<string, string> = {};
  for (const m of mappings) {
    if (m.direction === 'wix_to_hubspot') continue;
    const val = hsContact.properties[m.hubspotProperty];
    if (val != null) fields[m.wixField] = applyTransform(val, m.transform);
  }
  return {
    ...(fields.primaryEmail && { primaryEmail: fields.primaryEmail }),
    ...(fields.firstName && { firstName: fields.firstName }),
    ...(fields.lastName && { lastName: fields.lastName }),
  };
}

async function logSync(
  siteId: string,
  direction: 'wix_to_hubspot' | 'hubspot_to_wix' | 'form_to_hubspot',
  status: 'success' | 'skipped' | 'error',
  correlationId: string,
  opts: { wixContactId?: string; hubspotContactId?: string; reason?: string } = {},
): Promise<void> {
  await SyncLog.create({
    siteId,
    direction,
    status,
    correlationId,
    wixContactId: opts.wixContactId,
    hubspotContactId: opts.hubspotContactId,
    reason: opts.reason,
  });
}

// ─── Core sync ────────
export class SyncService {
  async syncWixToHubSpot(
    siteId: string,
    wixContact: WixContact,
    incomingCorrelationId?: string,
  ): Promise<SyncResult> {
    const correlationId = uuidv4();

    if (incomingCorrelationId && wasWrittenByUs(incomingCorrelationId)) {
      await logSync(siteId, 'wix_to_hubspot', 'skipped', correlationId, {
        wixContactId: wixContact.id, reason: 'correlation_id_dedup',
      });
      return { success: true, action: 'skipped', correlationId, reason: 'dedup' };
    }

    const mappings = await FieldMapping.find({ siteId }).lean();
    const props = buildHubSpotProperties(wixContact, mappings, correlationId);
    const existing = await ContactMapping.findOne({ siteId, wixContactId: wixContact.id }).lean();

    try {
      let hsContact: HubSpotContact;

      if (existing) {
        hsContact = await hubspotService.updateContact(siteId, existing.hubspotContactId, props);
        markWritten(correlationId);
        await ContactMapping.findOneAndUpdate(
          { siteId, wixContactId: wixContact.id },
          { lastSyncedAt: new Date(), lastSyncSource: 'wix' },
        );
        await logSync(siteId, 'wix_to_hubspot', 'success', correlationId, {
          wixContactId: wixContact.id, hubspotContactId: hsContact.id, reason: 'updated',
        });
        return {
          success: true,
          action: 'updated',
          correlationId,
          wixContactId: wixContact.id,
          hubspotContactId: hsContact.id,
        };
      }

      if (!wixContact.primaryEmail) {
        await logSync(siteId, 'wix_to_hubspot', 'skipped', correlationId, {
          wixContactId: wixContact.id, reason: 'no_email',
        });
        return { success: true, action: 'skipped', correlationId, reason: 'no_email' };
      }

      hsContact = await hubspotService.createContact(siteId, { email: wixContact.primaryEmail, ...props });
      markWritten(correlationId);
      await ContactMapping.create({
        siteId,
        wixContactId: wixContact.id,
        hubspotContactId: hsContact.id,
        lastSyncedAt: new Date(),
        lastSyncSource: 'wix',
      });
      await logSync(siteId, 'wix_to_hubspot', 'success', correlationId, {
        wixContactId: wixContact.id, hubspotContactId: hsContact.id, reason: 'created',
      });
      return {
        success: true,
        action: 'created',
        correlationId,
        wixContactId: wixContact.id,
        hubspotContactId: hsContact.id,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logger.error('Wix→HubSpot sync failed', { wixContactId: wixContact.id, reason });
      await logSync(siteId, 'wix_to_hubspot', 'error', correlationId, { wixContactId: wixContact.id, reason });
      return { success: false, action: 'error', correlationId, reason };
    }
  }

  async syncHubSpotToWix(
    siteId: string,
    hubspotContactId: string,
    incomingCorrelationId?: string,
  ): Promise<SyncResult> {
    const correlationId = uuidv4();

    if (incomingCorrelationId && wasWrittenByUs(incomingCorrelationId)) {
      await logSync(siteId, 'hubspot_to_wix', 'skipped', correlationId, {
        hubspotContactId, reason: 'correlation_id_dedup',
      });
      return { success: true, action: 'skipped', correlationId, reason: 'dedup' };
    }

    try {
      const hsContact = await hubspotService.getContact(siteId, hubspotContactId);

      // Secondary: origin tag check
      if (hsContact.properties['wix_sync_source'] === 'wix') {
        const storedCid = hsContact.properties['wix_sync_correlation_id'];
        if (storedCid && wasWrittenByUs(storedCid)) {
          await logSync(siteId, 'hubspot_to_wix', 'skipped', correlationId, {
            hubspotContactId, reason: 'origin_tag_dedup',
          });
          return { success: true, action: 'skipped', correlationId, reason: 'origin_tag' };
        }
      }

      const mappings = await FieldMapping.find({ siteId }).lean();
      const wixFields = buildWixFields(hsContact, mappings);
      const existing = await ContactMapping.findOne({ siteId, hubspotContactId }).lean();

      let wixContact: WixContact;

      if (existing) {
        wixContact = await wixService.updateContact(siteId, existing.wixContactId, wixFields);
        markWritten(correlationId);
        await ContactMapping.findOneAndUpdate(
          { siteId, hubspotContactId },
          { lastSyncedAt: new Date(), lastSyncSource: 'hubspot' },
        );
        await logSync(siteId, 'hubspot_to_wix', 'success', correlationId, {
          wixContactId: wixContact.id, hubspotContactId, reason: 'updated',
        });
        return {
          success: true,
          action: 'updated',
          correlationId,
          wixContactId: wixContact.id,
          hubspotContactId,
        };
      }

      const email = hsContact.properties['email'];
      if (!email) {
        await logSync(siteId, 'hubspot_to_wix', 'skipped', correlationId, {
          hubspotContactId, reason: 'no_email',
        });
        return { success: true, action: 'skipped', correlationId, reason: 'no_email' };
      }

      const existingWix = await wixService.queryContactByEmail(siteId, email);
      if (existingWix) {
        wixContact = await wixService.updateContact(siteId, existingWix.id, wixFields);
      } else {
        wixContact = await wixService.createContact(siteId, { primaryEmail: email, ...wixFields });
      }

      markWritten(correlationId);
      await ContactMapping.create({
        siteId,
        wixContactId: wixContact.id,
        hubspotContactId,
        lastSyncedAt: new Date(),
        lastSyncSource: 'hubspot',
      });
      await logSync(siteId, 'hubspot_to_wix', 'success', correlationId, {
        wixContactId: wixContact.id,
        hubspotContactId,
        reason: existingWix ? 'updated' : 'created',
      });
      return {
        success: true,
        action: existingWix ? 'updated' : 'created',
        correlationId,
        wixContactId: wixContact.id,
        hubspotContactId,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logger.error('HubSpot→Wix sync failed', { hubspotContactId, reason });
      await logSync(siteId, 'hubspot_to_wix', 'error', correlationId, { hubspotContactId, reason });
      return { success: false, action: 'error', correlationId, reason };
    }
  }

  async getRecentSyncLog(siteId: string, limit = 50) {
    return SyncLog.find({ siteId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }
}

export const syncService = new SyncService();