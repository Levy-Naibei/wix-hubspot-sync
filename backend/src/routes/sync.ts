import { Router, Request, Response } from 'express';
import { syncService } from '../services/sync.service';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { getDb } from '../db';

const router = Router();

/**
 * GET /api/sync/log
 * Returns recent sync log entries for the site.
 */
router.get('/log', requireAuth, (req: Request, res: Response) => {
  const { siteId } = req as AuthenticatedRequest;
  const limit = Math.min(parseInt((req.query['limit'] as string) || '50', 10), 200);
  try {
    const entries = syncService.getRecentSyncLog(siteId, limit);
    res.json({ entries });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sync log' });
  }
});

/**
 * GET /api/sync/stats
 * Returns sync statistics for dashboard display.
 */
router.get('/stats', requireAuth, (req: Request, res: Response) => {
  const { siteId } = req as AuthenticatedRequest;
  try {
    const db = getDb();

    const total = (db.prepare(
      'SELECT COUNT(*) as count FROM sync_log WHERE site_id = ?'
    ).get(siteId) as { count: number }).count;

    const success = (db.prepare(
      "SELECT COUNT(*) as count FROM sync_log WHERE site_id = ? AND status = 'success'"
    ).get(siteId) as { count: number }).count;

    const errors = (db.prepare(
      "SELECT COUNT(*) as count FROM sync_log WHERE site_id = ? AND status = 'error'"
    ).get(siteId) as { count: number }).count;

    const mappedContacts = (db.prepare(
      'SELECT COUNT(*) as count FROM contact_mappings'
    ).get() as { count: number }).count;

    const last24h = (db.prepare(`
      SELECT COUNT(*) as count FROM sync_log
      WHERE site_id = ? AND created_at >= datetime('now', '-24 hours')
    `).get(siteId) as { count: number }).count;

    res.json({ total, success, errors, mappedContacts, last24h });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
