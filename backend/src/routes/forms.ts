import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { hubspotService } from '../services/hubspot.service.js';
import { tokenService } from '../services/token.service.js';
import { SyncLog } from '../models/syncLog.model.js';
import { logger } from '../utils/logger.js';

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

const PROPERTY_MAP: Record<string, string> = {
  utm_source: 'hs_analytics_source',
  utm_medium: 'hs_analytics_medium',
  utm_campaign: 'hs_analytics_campaign',
  utm_term: 'utm_term', // if present in your portal
  utm_content: 'utm_content', // if present
  pageUrl: 'hs_analytics_last_url',
  referrer: 'hs_analytics_last_referrer',
  form_submitted_at: 'hs_analytics_last_touch_converting_campaign', // optional fallback
  wix_form_id: 'wix_form_id', // you can create this property in HubSpot
  wix_form_name: 'wix_form_name', // same
  wix_sync_source: 'wix_sync_source', // same
  wix_sync_correlation_id: 'wix_sync_correlation_id', // same
};

function filterValidProperties(
  candidate: Record<string, string | undefined>,
  allowed: Set<string>,
): Record<string, string> {
  return Object.entries(candidate).reduce((acc, [k, v]) => {
    if (!v) return acc;
    const mapped = PROPERTY_MAP[k] ?? k;
    if (allowed.has(mapped)) {
      acc[mapped] = v;
    } else {
      logger.warn('Skipping non-existing HubSpot property', { property: mapped });
    }
    return acc;
  }, {} as Record<string, string>);
}

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

    const props = await hubspotService.getContactProperties(data.siteId);
    const allowedProps = new Set(props.map((p) => p.name));

    const submissionProperties: Record<string, string | undefined> = {
      email: data.email,
      firstname: data.firstName || undefined,
      lastname: data.lastName || undefined,
      phone: data.phone || undefined,
      utm_source: data.utm?.source || undefined,
      utm_medium: data.utm?.medium || undefined,
      utm_campaign: data.utm?.campaign || undefined,
      utm_term: data.utm?.term || undefined,
      utm_content: data.utm?.content || undefined,
      pageUrl: data.pageUrl || undefined,
      referrer: data.referrer || undefined,
      form_submitted_at: new Date().toISOString(),
      wix_form_id: data.formId || undefined,
      wix_form_name: data.formName || undefined,
      wix_sync_source: 'form',
      wix_sync_correlation_id: correlationId,
      ...data.customFields,
    };

    const properties = filterValidProperties(submissionProperties, allowedProps);

    if (Object.keys(properties).length === 0) {
      return res.status(400).json({ error: 'No valid HubSpot contact properties available' });
    }

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
      properties: Object.keys(properties),
    });

    res.json({ success: true, correlationId, hubspotContactId: hsContact.id });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error('Form submission error', { reason, siteId: data.siteId });
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