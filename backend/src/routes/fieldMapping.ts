import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { FieldMapping } from '../models/fieldMapping.model';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { hubspotService } from '../services/hubspot.service';
import { wixService } from '../services/wix.service';
import { tokenService } from '../services/token.service';
import { logger } from '../utils/logger';

const router = Router();

const MappingRowSchema = z.object({
  wixField: z.string().min(1),
  hubspotProperty: z.string().min(1),
  direction: z.enum(['wix_to_hubspot', 'hubspot_to_wix', 'bidirectional']),
  transform: z.enum(['trim', 'lowercase', 'uppercase']).nullable().optional(),
});

const SaveMappingsSchema = z.object({
  mappings: z.array(MappingRowSchema),
});

/** GET /api/field-mapping */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { siteId } = req as AuthenticatedRequest;
  try {
    const mappings = await FieldMapping.find({ siteId }).sort({ createdAt: 1 }).lean();
    res.json({ mappings });
  } catch {
    res.status(500).json({ error: 'Failed to load field mappings' });
  }
});

/** POST /api/field-mapping — atomic replace all mappings for this site */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { siteId } = req as AuthenticatedRequest;
  const parsed = SaveMappingsSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid mappings', details: parsed.error.flatten() });
  }

  const { mappings } = parsed.data;

  // Validate: no duplicate HubSpot property in the same save
  const props = mappings.map((m) => m.hubspotProperty);
  if (new Set(props).size !== props.length) {
    return res.status(400).json({ error: 'Duplicate HubSpot property mappings are not allowed' });
  }

  try {
    // Atomic: delete existing, insert new
    await FieldMapping.deleteMany({ siteId });
    if (mappings.length > 0) {
      await FieldMapping.insertMany(
        mappings.map((m) => ({ siteId, ...m, transform: m.transform ?? null })),
      );
    }
    logger.info('Field mappings saved', { siteId, count: mappings.length });
    res.json({ success: true, count: mappings.length });
  } catch (err) {
    logger.error('Failed to save field mappings', { err });
    res.status(500).json({ error: 'Failed to save mappings' });
  }
});

/** GET /api/field-mapping/wix-fields */
router.get('/wix-fields', requireAuth, (_req: Request, res: Response) => {
  res.json({ fields: wixService.getAvailableFields() });
});

/** GET /api/field-mapping/hubspot-properties */
router.get('/hubspot-properties', requireAuth, async (req: Request, res: Response) => {
  const { siteId } = req as AuthenticatedRequest;
  try {
    const connected = await tokenService.isConnected(siteId);
    if (!connected) return res.status(400).json({ error: 'HubSpot not connected for this site' });
    const properties = await hubspotService.getContactProperties(siteId);
    res.json({ properties });
  } catch (err) {
    logger.error('Failed to fetch HubSpot properties', { err });
    res.status(500).json({ error: 'Failed to fetch HubSpot properties' });
  }
});

export default router;