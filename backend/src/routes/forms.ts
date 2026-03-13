import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { hubspotService } from '../services/hubspot.service';
import { tokenService } from '../services/token.service';
import { getDb } from '../db';
import { logger } from '../utils/logger';

const router = Router();

const FormSubmissionSchema = z.object({
  siteId: z.string().min(1),
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  customFields: z.record(z.string()).optional(),
  utm: z.object({
    source: z.string().optional(),
    medium: z.string().optional(),
    campaign: z.string().optional(),
    term: z.string().optional(),
    content: z.string().optional(),
  }).optional(),
  pageUrl: z.string().url().optional(),
  referrer: z.string().optional(),
  formId: z.string().optional(),
  formName: z.string().optional(),
});

/**
 * POST /api/forms/submit
 * Receives a Wix form submission and upserts a HubSpot contact with
 * full UTM attribution context.
 *
 * Called from the Wix site page widget or a Wix form submission webhook.
 * No auth required (public endpoint) — rate limited.
 */
router.post('/submit', async (req: Request, res: Response) => {
  const parsed = FormSubmissionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid submission', details: parsed.error.flatten() });
  }

  const data = parsed.data;
  const correlationId = uuidv4();

  try {
    const connected = await tokenService.isConnected(data.siteId);
    if (!connected) {
      return res.status(400).json({ error: 'HubSpot not connected for this site' });
    }

    // Build HubSpot properties with UTM attribution
    // All UTM fields are stored as custom HubSpot contact properties
    const properties: Record<string, string> = {
      email: data.email,
      ...(data.firstName && { firstname: data.firstName }),
      ...(data.lastName && { lastname: data.lastName }),
      ...(data.phone && { phone: data.phone }),

      // UTM attribution
      ...(data.utm?.source && { utm_source: data.utm.source }),
      ...(data.utm?.medium && { utm_medium: data.utm.medium }),
      ...(data.utm?.campaign && { utm_campaign: data.utm.campaign }),
      ...(data.utm?.term && { utm_term: data.utm.term }),
      ...(data.utm?.content && { utm_content: data.utm.content }),

      // Page context
      ...(data.pageUrl && { form_page_url: data.pageUrl }),
      ...(data.referrer && { form_referrer: data.referrer }),
      form_submitted_at: new Date().toISOString(),

      // Form metadata
      ...(data.formId && { wix_form_id: data.formId }),
      ...(data.formName && { wix_form_name: data.formName }),

      // Custom fields from the form
      ...data.customFields,

      // Sync metadata
      wix_sync_source: 'form',
      wix_sync_correlation_id: correlationId,
    };

    const hsContact = await hubspotService.upsertContactByEmail(
      data.siteId,
      data.email,
      properties,
    );

    // Log the form submission
    const db = getDb();
    db.prepare(`
      INSERT INTO sync_log (site_id, direction, hubspot_contact_id, status, correlation_id, reason)
      VALUES (?, 'form_to_hubspot', ?, 'success', ?, 'form_submission')
    `).run(data.siteId, hsContact.id, correlationId);

    logger.info('Form submission synced to HubSpot', {
      siteId: data.siteId,
      hubspotContactId: hsContact.id,
      correlationId,
      hasUtm: !!(data.utm?.source || data.utm?.campaign),
    });

    res.json({
      success: true,
      correlationId,
      hubspotContactId: hsContact.id,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error('Form submission error', { reason });
    res.status(500).json({ error: 'Failed to sync form submission' });
  }
});

/**
 * GET /api/forms/snippet
 * Returns the JavaScript snippet to embed in Wix pages for form capture.
 * Injects UTM params and page context automatically.
 */
router.get('/snippet', (req: Request, res: Response) => {
  const { siteId } = req.query as { siteId?: string };
  if (!siteId) return res.status(400).json({ error: 'Missing siteId' });

  const apiBase = `${req.protocol}://${req.get('host')}`;

  const snippet = `
<!-- Wix ↔ HubSpot Form Capture Snippet -->
<script>
(function() {
  var API_URL = '${apiBase}/api/forms/submit';
  var SITE_ID = '${siteId}';

  function getUtmParams() {
    var params = new URLSearchParams(window.location.search);
    return {
      source: params.get('utm_source') || '',
      medium: params.get('utm_medium') || '',
      campaign: params.get('utm_campaign') || '',
      term: params.get('utm_term') || '',
      content: params.get('utm_content') || ''
    };
  }

  window.wixHubSpotSubmit = function(formData) {
    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({}, formData, {
        siteId: SITE_ID,
        utm: getUtmParams(),
        pageUrl: window.location.href,
        referrer: document.referrer
      }))
    }).then(function(r) { return r.json(); });
  };
})();
</script>`;

  res.type('text/plain').send(snippet);
});

export default router;
