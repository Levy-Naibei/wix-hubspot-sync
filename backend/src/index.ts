import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { connectDb } from './db';
import { logger } from './utils/logger';

import authRoutes from './routes/auth';
import fieldMappingRoutes from './routes/fieldMapping';
import webhookRoutes from './routes/webhooks';
import formRoutes from './routes/forms';
import syncRoutes from './routes/sync';

const app = express();

// ─── Security middleware ────
app.use(helmet({
  contentSecurityPolicy: false,
}));

app.use(cors({
  origin: [config.frontendUrl, /\.wix\.com$/, /\.wixsite\.com$/],
  credentials: true,
}));

// Preserve raw body for webhook signature verification
app.use((req: Request & { rawBody?: string }, _res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api/webhooks')) {
    let data = '';
    req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    req.on('end', () => {
      req.rawBody = data;
      try {
        req.body = JSON.parse(data);
      } catch {
        req.body = {};
      }
      next();
    });
  } else {
    next();
  }
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Rate limiting ───
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const formLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
});

app.use('/api/', apiLimiter);
app.use('/api/forms/', formLimiter);

// ─── Routes ────
app.use('/api/auth', authRoutes);
app.use('/api/field-mapping', fieldMappingRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/forms', formRoutes);
app.use('/api/sync', syncRoutes);

// ─── Health check ────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Global error handler ───
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

async function main() {
  // ─── Initialize DB (works for both local and Vercel) ────
  await connectDb();
  
  // ─── Start local server only when NOT on Vercel ───
  if (process.env.VERCEL !== "1") {
    app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port}`, { env: config.nodeEnv });
    });
  }
}

main().catch((err) => {
  logger.error('Failed to start server', { err});
  process.exit(1);
});

export default app;