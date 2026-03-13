import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { hubspotService } from '../services/hubspot.service';
import { wixService } from '../services/wix.service';
import { tokenService } from '../services/token.service';
import { logger } from '../utils/logger';

const router = Router();

const FieldMappingSchema = z.object({
  wixField: z.string().min(1),
  hubspotProperty: z.string().min(1),
  direction: z.enum(['wix_to_hubspot', 'hubspot_to_wix', 'bidirectional']),
  transform: z.enum(['trim', 'lowercase', 'uppercase']).nullable().optional(),
});

const SaveMappingsSchema = z.object({
  mappings: z.array(FieldMappingSchema),
});

/**
 * GET /api/field-mapping
 * Returns current field mappings for a site.
 */
router.get('/', requireAuth, (req: Request, res: Response) => {
  const { siteId } = req as AuthenticatedRequest;
  try {
    const db = getDb();
    const mappings = db
      .prepare('SELECT * FROM field_mappings WHERE site_id = ? ORDER BY id ASC')
      .all(siteId);
    res.json({ mappings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load field mappings' });
  }
});

/**
 * POST /api/field-mapping
 * Replace all field mappings for a site (atomic save).
 */
router.post('/', requireAuth, (req: Request, res: Response) => {
  const { siteId } = req as AuthenticatedRequest;
  const parsed = SaveMappingsSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid mappings', details: parsed.error.flatten() });
  }

  const { mappings } = parsed.data;

  // Validate: no duplicate HubSpot property within bidirectional/same direction
  const hubspotProps = mappings.map((m) => m.hubspotProperty);
  const unique = new Set(hubspotProps);
  if (unique.size !== hubspotProps.length) {
    return res.status(400).json({ error: 'Duplicate HubSpot property mappings are not allowed' });
  }

  try {
    const db = getDb();
    const deleteStmt = db.prepare('DELETE FROM field_mappings WHERE site_id = ?');
    const insertStmt = db.prepare(`
      INSERT INTO field_mappings (site_id, wix_field, hubspot_property, direction, transform)
      VALUES (@siteId, @wixField, @hubspotProperty, @direction, @transform)
    `);

    const saveMappings = db.transaction(() => {
      deleteStmt.run(siteId);
      for (const m of mappings) {
        insertStmt.run({
          siteId,
          wixField: m.wixField,
          hubspotProperty: m.hubspotProperty,
          direction: m.direction,
          transform: m.transform ?? null,
        });
      }
    });

    saveMappings();
    logger.info('Field mappings saved', { siteId, count: mappings.length });
    res.json({ success: true, count: mappings.length });
  } catch (err) {
    logger.error('Failed to save field mappings', { err });
    res.status(500).json({ error: 'Failed to save mappings' });
  }
});

/**
 * GET /api/field-mapping/wix-fields
 * Returns available Wix contact fields for the mapping UI dropdown.
 */
router.get('/wix-fields', requireAuth, (_req: Request, res: Response) => {
  res.json({ fields: wixService.getAvailableFields() });
});

/**
 * GET /api/field-mapping/hubspot-properties
 * Returns available HubSpot contact properties from the HubSpot API.
 */
router.get('/hubspot-properties', requireAuth, async (req: Request, res: Response) => {
  const { siteId } = req as AuthenticatedRequest;
  try {
    const connected = await tokenService.isConnected(siteId);
    if (!connected) {
      return res.status(400).json({ error: 'HubSpot not connected for this site' });
    }
    const properties = await hubspotService.getContactProperties(siteId);
    res.json({ properties });
  } catch (err) {
    logger.error('Failed to fetch HubSpot properties', { err });
    res.status(500).json({ error: 'Failed to fetch HubSpot properties' });
  }
});

export default router;
