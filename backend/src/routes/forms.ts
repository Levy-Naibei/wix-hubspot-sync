import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { hubspotService } from '../services/hubspot.service';
import { tokenService } from '../services/token.service';
import { SyncLog } from '../models/syncLog.model';
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
  pageUrl: z.string().optional(),
  referrer: z.string().optional(),
  formId: z.string().optional(),
  formName: z.string().optional(),
});

/** POST /api/forms/submit */
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

    const properties: Record<string, string> = {
      email: data.email,
      ...(data.firstName && { firstname: data.firstName }),
      ...(data.lastName && { lastname: data.lastName }),
      ...(data.phone && { phone: data.phone }),
      ...(data.utm?.source && { utm_source: data.utm.source }),
      ...(data.utm?.medium && { utm_medium: data.utm.medium }),
      ...(data.utm?.campaign && { utm_campaign: data.utm.campaign }),
      ...(data.utm?.term && { utm_term: data.utm.term }),
      ...(data.utm?.content && { utm_content: data.utm.content }),
      ...(data.pageUrl && { form_page_url: data.pageUrl }),
      ...(data.referrer && { form_referrer: data.referrer }),
      form_submitted_at: new Date().toISOString(),
      ...(data.formId && { wix_form_id: data.formId }),
      ...(data.formName && { wix_form_name: data.formName }),
      ...data.customFields,
      wix_sync_source: 'form',
      wix_sync_correlation_id: correlationId,
    };

    const hsContact = await hubspotService.upsertContactByEmail(data.siteId, data.email, properties);

    await SyncLog.create({
      siteId: data.siteId,
      direction: 'form_to_hubspot',
      hubspotContactId: hsContact.id,
      status: 'success',
      correlationId,
      reason: 'form_submission',
    });

    logger.info('Form submission synced to HubSpot', {
      siteId: data.siteId,
      hubspotContactId: hsContact.id,
      correlationId,
    });

    res.json({ success: true, correlationId, hubspotContactId: hsContact.id });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error('Form submission error', { reason });
    res.status(500).json({ error: 'Failed to sync form submission' });
  }
});

/** GET /api/forms/snippet */
router.get('/snippet', (req: Request, res: Response) => {
  const { siteId } = req.query as { siteId?: string };
  if (!siteId) return res.status(400).json({ error: 'Missing siteId' });

  const apiBase = `${req.protocol}://${req.get('host')}`;

  const snippet = `<!-- Wix ↔ HubSpot Form Capture Snippet -->
<script>
(function() {
  var API_URL = '${apiBase}/api/forms/submit';
  var SITE_ID = '${siteId}';
  function getUtmParams() {
    var p = new URLSearchParams(window.location.search);
    return { source: p.get('utm_source'), medium: p.get('utm_medium'), campaign: p.get('utm_campaign'), term: p.get('utm_term'), content: p.get('utm_content') };
  }
  window.wixHubSpotSubmit = function(formData) {
    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({}, formData, { siteId: SITE_ID, utm: getUtmParams(), pageUrl: window.location.href, referrer: document.referrer }))
    }).then(function(r) { return r.json(); });
  };
})();
</script>`;

  res.type('text/plain').send(snippet);
});

export default router;