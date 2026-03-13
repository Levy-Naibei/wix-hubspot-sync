import dotenv from 'dotenv';
dotenv.config({ path: './../.env' });


function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: parseInt(optional('PORT', '3001'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),
  isProd: optional('NODE_ENV', 'development') === 'production',

  wix: {
    appId: optional('WIX_APP_ID', 'dev-app-id'),
    appSecret: optional('WIX_APP_SECRET', 'dev-secret'),
    webhookSecret: optional('WIX_WEBHOOK_SECRET', 'dev-webhook-secret'),
    apiBaseUrl: 'https://www.wixapis.com',
  },

  hubspot: {
    clientId: optional('HUBSPOT_CLIENT_ID', ''),
    clientSecret: optional('HUBSPOT_CLIENT_SECRET', ''),
    redirectUri: optional('HUBSPOT_REDIRECT_URI', ''),
    appId: optional('HUBSPOT_APP_ID', ''),
    scopes: [
      'crm.objects.contacts.read',
      'crm.objects.contacts.write',
      'crm.schemas.contacts.read',
      'crm.objects.leads.read',
      'crm.objects.leads.write',
      'oauth',
    ].join(' '),
    apiBaseUrl: 'https://api.hubapi.com',
    oauthAuthUrl: 'https://app.hubspot.com/oauth/authorize',
    oauthTokenUrl: 'https://api.hubapi.com/oauth/v1/token',
  },

  encryptionKey: optional('ENCRYPTION_KEY', 'a'.repeat(64)),
  frontendUrl: optional('FRONTEND_URL', 'http://localhost:5173'),
  dbPath: optional('DB_PATH', './data/integration.db'),

  sync: {
    dedupWindowMs: 30_000, // 30s window for loop prevention
    maxRetries: 3,
  },
} as const;
