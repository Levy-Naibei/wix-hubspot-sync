import crypto from 'crypto';
import { getDb } from '../db';
import { config } from '../config';
import { HubSpotTokens } from '../types';
import { logger } from '../utils/logger';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(config.encryptionKey.slice(0, 64), 'hex');

function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // iv:tag:ciphertext (all base64)
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
}

function decrypt(ciphertext: string): string {
  const [ivB64, tagB64, dataB64] = ciphertext.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export class TokenService {
  /** Persist OAuth tokens for a given site. Never stores plaintext. */
  async save(siteId: string, tokens: HubSpotTokens, portalId?: string): Promise<void> {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO tokens
        (site_id, encrypted_access_token, encrypted_refresh_token, expires_at, scope, token_type, hubspot_portal_id, updated_at)
      VALUES
        (@siteId, @accessToken, @refreshToken, @expiresAt, @scope, @tokenType, @portalId, datetime('now'))
      ON CONFLICT(site_id) DO UPDATE SET
        encrypted_access_token = excluded.encrypted_access_token,
        encrypted_refresh_token = excluded.encrypted_refresh_token,
        expires_at = excluded.expires_at,
        scope = excluded.scope,
        token_type = excluded.token_type,
        hubspot_portal_id = excluded.hubspot_portal_id,
        updated_at = datetime('now')
    `);
    stmt.run({
      siteId,
      accessToken: encrypt(tokens.accessToken),
      refreshToken: encrypt(tokens.refreshToken),
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
      tokenType: tokens.tokenType,
      portalId: portalId ?? null,
    });
    logger.info('Tokens saved for site', { siteId });
  }

  /** Retrieve and decrypt tokens. Returns null if not found. */
  async get(siteId: string): Promise<HubSpotTokens | null> {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM tokens WHERE site_id = ?')
      .get(siteId) as Record<string, unknown> | undefined;

    if (!row) return null;

    return {
      accessToken: decrypt(row.encrypted_access_token as string),
      refreshToken: decrypt(row.encrypted_refresh_token as string),
      expiresAt: row.expires_at as number,
      scope: row.scope as string,
      tokenType: row.token_type as string,
    };
  }

  async getPortalId(siteId: string): Promise<string | null> {
    const db = getDb();
    const row = db
      .prepare('SELECT hubspot_portal_id FROM tokens WHERE site_id = ?')
      .get(siteId) as { hubspot_portal_id: string | null } | undefined;
    return row?.hubspot_portal_id ?? null;
  }

  async isConnected(siteId: string): Promise<boolean> {
    const db = getDb();
    const row = db
      .prepare('SELECT id FROM tokens WHERE site_id = ?')
      .get(siteId);
    return row !== undefined;
  }

  async delete(siteId: string): Promise<void> {
    const db = getDb();
    db.prepare('DELETE FROM tokens WHERE site_id = ?').run(siteId);
    logger.info('Tokens deleted for site', { siteId });
  }
}

export const tokenService = new TokenService();
