import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface AuthenticatedRequest extends Request {
  siteId: string;
  instanceId?: string;
}

/**
 * Validates the Wix instance parameter or Authorization header.
 * In production: parse and verify the Wix JWT instance token.
 * The `instance` query param is a signed JWT from Wix Dashboard.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  try {
    // Allow siteId from header (used for webhook calls from our own services)
    const siteIdHeader = req.headers['x-wix-site-id'] as string | undefined;

    // From Wix Dashboard page: the instance query param is a signed JWT
    const instance = (req.query['instance'] as string) || req.headers['x-wix-instance'] as string;

    if (siteIdHeader) {
      // Internal service call (validated separately)
      (req as AuthenticatedRequest).siteId = siteIdHeader;
      return next();
    }

    if (instance) {
      const siteId = parseWixInstance(instance);
      if (siteId) {
        (req as AuthenticatedRequest).siteId = siteId;
        return next();
      }
    }

    // Development fallback
    if (config.nodeEnv === 'development') {
      (req as AuthenticatedRequest).siteId = req.headers['x-dev-site-id'] as string || 'dev-site-id';
      return next();
    }

    res.status(401).json({ error: 'Unauthorized: missing or invalid Wix instance token' });
  } catch (err) {
    logger.error('Auth middleware error', { err });
    res.status(401).json({ error: 'Unauthorized' });
  }
}

/**
 * Parse Wix instance JWT and extract the site ID.
 * The Wix instance token is a base64url-encoded signed string.
 * Format: <header>.<payload>.<signature>
 */
function parseWixInstance(instance: string): string | null {
  try {
    const parts = instance.split('.');
    if (parts.length < 2) return null;

    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    );

    // Verify HMAC signature
    const [header, payloadB64] = parts;
    const signature = parts[2];
    const expectedSig = crypto
      .createHmac('sha256', config.wix.appSecret)
      .update(`${header}.${payloadB64}`)
      .digest('base64url');

    if (signature !== expectedSig && config.isProd) {
      logger.warn('Invalid Wix instance signature');
      return null;
    }

    return payload.instanceId || payload.siteId || null;
  } catch {
    return null;
  }
}

/**
 * Verify HubSpot webhook signature (X-HubSpot-Signature-V3).
 */
export function verifyHubSpotWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const signature = req.headers['x-hubspot-signature-v3'] as string;
  const timestamp = req.headers['x-hubspot-request-timestamp'] as string;

  if (!signature || !timestamp) {
    if (config.nodeEnv === 'development') return next();
    res.status(401).json({ error: 'Missing HubSpot signature' });
    return;
  }

  // Reject requests older than 5 minutes
  const ts = parseInt(timestamp, 10);
  if (Date.now() - ts > 5 * 60 * 1000) {
    res.status(401).json({ error: 'Request timestamp too old' });
    return;
  }

  const rawBody = (req as Request & { rawBody?: string }).rawBody || JSON.stringify(req.body);
  const source = `${config.hubspot.clientSecret}${req.method}${req.protocol}://${req.get('host')}${req.originalUrl}${rawBody}${timestamp}`;

  const expectedSig = crypto
    .createHmac('sha256', config.hubspot.clientSecret)
    .update(source)
    .digest('base64');

  if (expectedSig !== signature && config.isProd) {
    res.status(401).json({ error: 'Invalid HubSpot signature' });
    return;
  }

  next();
}

/**
 * Verify Wix webhook HMAC signature.
 */
export function verifyWixWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const signature = req.headers['x-wix-signature'] as string;

  if (!signature) {
    if (config.nodeEnv === 'development') return next();
    res.status(401).json({ error: 'Missing Wix webhook signature' });
    return;
  }

  const rawBody = (req as Request & { rawBody?: string }).rawBody || JSON.stringify(req.body);
  const expected = crypto
    .createHmac('sha256', config.wix.webhookSecret)
    .update(rawBody)
    .digest('hex');

  if (expected !== signature && config.isProd) {
    res.status(401).json({ error: 'Invalid Wix webhook signature' });
    return;
  }

  next();
}
