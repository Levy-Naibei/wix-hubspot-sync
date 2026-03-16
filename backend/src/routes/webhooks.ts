import { Router, Request, Response } from 'express';
import { syncService } from '../services/sync.service.js';
import { verifyHubSpotWebhook, verifyWixWebhook } from '../middleware/auth.js';
import { WixWebhookPayload, HubSpotWebhookEvent } from '../types/index.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * POST /api/webhooks/wix
 * Receives Wix contact events (CONTACT_CREATED, CONTACT_UPDATED).
 * Wix sends HMAC-signed payloads. We verify the signature then sync to HubSpot.
 *
 * Wix webhook payload structure:
 * {
 *   entityId: "wix-contact-id",
 *   event: "wix.contacts.v4.contact_created",
 *   actionEvent: { body: { contact: {...} } }
 * }
 */
router.post('/wix', verifyWixWebhook, async (req: Request, res: Response) => {
  // Acknowledge immediately to prevent Wix retry
  res.status(200).json({ received: true });

  const payload = req.body as WixWebhookPayload;
  const siteId = req.headers['x-wix-site-id'] as string;

  if (!siteId) {
    logger.warn('Wix webhook missing site ID header');
    return;
  }

  logger.info('Wix webhook received', { event: payload.event, entityId: payload.entityId });

  const contact = payload.actionEvent?.body?.contact;
  if (!contact) {
    logger.warn('Wix webhook missing contact data');
    return;
  }

  // Extract correlation ID if present (set by our own HubSpot→Wix writes)
  const incomingCorrelation = contact.extendedFields?.['hubspot_sync_correlation_id'] as string | undefined;

  try {
    const result = await syncService.syncWixToHubSpot(siteId, contact, incomingCorrelation);
    logger.info('Wix→HubSpot sync result', { action: result.action, correlationId: result.correlationId });
  } catch (err) {
    logger.error('Wix webhook sync error', { err });
  }
});

/**
 * POST /api/webhooks/hubspot/:siteId
 * Receives HubSpot contact events (contact.creation, contact.propertyChange).
 * HubSpot sends arrays of events signed with HMAC-SHA256.
 *
 * Each event in the array:
 * {
 *   subscriptionType: "contact.creation" | "contact.propertyChange",
 *   objectId: 123456789 (HubSpot contact ID),
 *   propertyName: "email",
 *   propertyValue: "user@example.com",
 *   occurredAt: 1234567890000
 * }
 */
router.post('/hubspot/:siteId', verifyHubSpotWebhook, async (req: Request, res: Response) => {
  // Acknowledge immediately
  res.status(200).json({ received: true });

  const { siteId } = req.params;
  const events = req.body as HubSpotWebhookEvent[];

  if (!Array.isArray(events) || events.length === 0) {
    return;
  }

  logger.info('HubSpot webhook received', { siteId, eventCount: events.length });

  // Deduplicate by objectId — process each contact only once per batch
  const processedIds = new Set<number>();

  for (const event of events) {
    if (processedIds.has(event.objectId)) continue;
    processedIds.add(event.objectId);

    const isContactEvent =
      event.subscriptionType === 'contact.creation' ||
      event.subscriptionType === 'contact.propertyChange';

    if (!isContactEvent) continue;

    try {
      // We'll fetch the full contact in syncHubSpotToWix to check correlation ID
      const result = await syncService.syncHubSpotToWix(siteId, String(event.objectId));
      logger.info('HubSpot→Wix sync result', {
        action: result.action,
        hubspotContactId: String(event.objectId),
        correlationId: result.correlationId,
      });
    } catch (err) {
      logger.error('HubSpot webhook sync error', { objectId: event.objectId, err });
    }
  }
});

export default router;
