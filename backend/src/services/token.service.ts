import crypto from 'crypto';
import { Token } from '../models/token.model';
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
  async save(siteId: string, tokens: HubSpotTokens, portalId?: string): Promise<void> {
    await Token.findOneAndUpdate(
      { siteId },
      {
        siteId,
        encryptedAccessToken: encrypt(tokens.accessToken),
        encryptedRefreshToken: encrypt(tokens.refreshToken),
        expiresAt: tokens.expiresAt,
        scope: tokens.scope,
        tokenType: tokens.tokenType,
        ...(portalId && { hubspotPortalId: portalId }),
      },
      { upsert: true, new: true },
    );
    logger.info('Tokens saved for site', { siteId });
  }

  async get(siteId: string): Promise<HubSpotTokens | null> {
    const doc = await Token.findOne({ siteId }).lean();
    if (!doc) return null;
    return {
      accessToken: decrypt(doc.encryptedAccessToken),
      refreshToken: decrypt(doc.encryptedRefreshToken),
      expiresAt: doc.expiresAt,
      scope: doc.scope,
      tokenType: doc.tokenType,
    };
  }

  async getPortalId(siteId: string): Promise<string | null> {
    const doc = await Token.findOne({ siteId }, { hubspotPortalId: 1 }).lean();
    return doc?.hubspotPortalId ?? null;
  }

  async isConnected(siteId: string): Promise<boolean> {
    const count = await Token.countDocuments({ siteId });
    return count > 0;
  }

  async delete(siteId: string): Promise<void> {
    await Token.deleteOne({ siteId });
    logger.info('Tokens deleted for site', { siteId });
  }
}

export const tokenService = new TokenService();