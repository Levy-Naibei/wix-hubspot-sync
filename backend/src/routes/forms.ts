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
  utm: z
    .object({
      source: z.string().optional(),
      medium: z.string().optional(),
      campaign: z.string().optional(),
      term: z.string().optional(),
      content: z.string().optional(),
    })
    .optional(),
  pageUrl: z.string().optional(),
  referrer: z.string().optional(),
  formId: z.string().optional(),
  formName: z.string().optional(),
});

// Map from logical keys to actual HubSpot contact property internal names.
// All of these now exist as writable custom properties in your portal.
const PROPERTY_MAP: Record<string, string> = {
  // Raw UTM fields (custom text properties)
  utm_source: 'wix_utm_source',
  utm_medium: 'wix_utm_medium',
  utm_campaign: 'wix_utm_campaign',
  utm_term: 'wix_utm_term',
  utm_content: 'wix_utm_content',

  // Context fields (custom properties)
  pageUrl: 'wix_last_page_url',
  referrer: 'wix_last_referrer',
  form_submitted_at: 'wix_form_submitted_at',

  // Wix-specific metadata (custom properties)
  wix_form_id: 'wix_form_id',
  wix_form_name: 'wix_form_name',
  wix_sync_source: 'wix_sync_source',
  wix_sync_correlation_id: 'wix_sync_correlation_id',
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
    return res
      .status(400)
      .json({ error: 'Invalid submission', details: parsed.error.flatten() });
  }
  const data = parsed.data;
  const correlationId = uuidv4();

  try {
    // 1) Ensure site is connected
    const connected = await tokenService.isConnected(data.siteId);
    if (!connected) {
      return res
        .status(400)
        .json({ error: 'HubSpot not connected for this site' });
    }

    // 2) Fetch allowed HubSpot contact properties
    const props = await hubspotService.getContactProperties(data.siteId);
    const allowedProps = new Set(props.map((p) => p.name));

    // 3) Build logical property object
    const submissionProperties: Record<string, string | undefined> = {
      // Core identity
      email: data.email,
      firstname: data.firstName || undefined,
      lastname: data.lastName || undefined,
      phone: data.phone || undefined,

      // Raw UTM values (preserved as-is)
      utm_source: data.utm?.source || undefined,
      utm_medium: data.utm?.medium || undefined,
      utm_campaign: data.utm?.campaign || undefined,
      utm_term: data.utm?.term || undefined,
      utm_content: data.utm?.content || undefined,

      // Context
      pageUrl: data.pageUrl || undefined,
      referrer: data.referrer || undefined,
      form_submitted_at: new Date().toISOString(),

      // Wix-specific metadata
      wix_form_id: data.formId || undefined,
      wix_form_name: data.formName || undefined,
      wix_sync_source: 'form',
      wix_sync_correlation_id: correlationId,

      // Any extra custom fields passed from Wix
      ...data.customFields,
    };

    // 4) Map to real HubSpot properties and filter to existing ones
    const properties = filterValidProperties(submissionProperties, allowedProps);

    if (Object.keys(properties).length === 0) {
      return res
        .status(400)
        .json({ error: 'No valid HubSpot contact properties available' });
    }

    // 5) Upsert HubSpot contact by email
    const hsContact = await hubspotService.upsertContactByEmail(
      data.siteId,
      data.email,
      properties,
    );

    // 6) Log sync
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

    // 7) Respond to caller
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
          return {
            source: p.get('utm_source'),
            medium: p.get('utm_medium'),
            campaign: p.get('utm_campaign'),
            term: p.get('utm_term'),
            content: p.get('utm_content'),
          };
        }

        // Call this from your Wix form's onSubmit handler
        window.wixHubSpotSubmit = function(formData) {
          // formData should include at least: { email, firstName?, lastName?, phone?, customFields? }
          return fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign(
              {},
              formData,
              {
                siteId: SITE_ID,
                utm: getUtmParams(),
                pageUrl: window.location.href,
                referrer: document.referrer
              }
            ))
          }).then(function(r) { return r.json(); });
        };
      })();
    </script>`;

  res.type('text/plain').send(snippet);
});

export default router;