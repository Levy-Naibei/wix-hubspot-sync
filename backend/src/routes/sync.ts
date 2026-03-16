import { Router, Request, Response } from 'express';
import { syncService } from '../services/sync.service.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { SyncLog } from '../models/syncLog.model.js';
import { ContactMapping } from '../models/contactMapping.model.js';

const router = Router();

/** GET /api/sync/log */
router.get('/log', requireAuth, async (req: Request, res: Response) => {
  const { siteId } = req as AuthenticatedRequest;
  const limit = Math.min(parseInt((req.query['limit'] as string) || '50', 10), 200);
  try {
    const entries = syncService.getRecentSyncLog(siteId, limit);
    res.json({ entries });
  } catch {
    res.status(500).json({ error: 'Failed to fetch sync log' });
  }
});

/** GET /api/sync/stats */
router.get('/stats', requireAuth, async (req: Request, res: Response) => {
  const { siteId } = req as AuthenticatedRequest;
  try {
    const [total, success, errors, mappedContacts, last24h] = await Promise.all([
      SyncLog.countDocuments({ siteId }),
      SyncLog.countDocuments({ siteId, status: 'success' }),
      SyncLog.countDocuments({ siteId, status: 'error' }),
      ContactMapping.countDocuments(),
      SyncLog.countDocuments({
        siteId,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
    ]);

    res.json({ total, success, errors, mappedContacts, last24h });
  } catch {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;