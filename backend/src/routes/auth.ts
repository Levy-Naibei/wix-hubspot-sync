import { Router, Request, Response } from 'express';
import { config } from '../configs/index.js';
import { hubspotService } from '../services/hubspot.service.js';
import { tokenService } from '../services/token.service.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /api/auth/hubspot
 * Initiate HubSpot OAuth flow. Returns the authorization URL.
 * The frontend redirects the user to this URL.
 */
router.get('/hubspot', requireAuth, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const state = Buffer.from(JSON.stringify({ siteId: authReq.siteId })).toString('base64url');

  const params = new URLSearchParams({
    client_id: config.hubspot.clientId,
    redirect_uri: config.hubspot.redirectUri,
    scope: config.hubspot.scopes,
    state,
  });

  const authUrl = `${config.hubspot.oauthAuthUrl}?${params.toString()}`;
  res.json({ authUrl });
});

/**
 * GET /api/auth/hubspot/callback
 * HubSpot redirects here after user approves the OAuth flow.
 * Exchanges code for tokens and stores them encrypted.
 */
router.get('/hubspot/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;

  const parentOrigin = new URL(config.frontendUrl).origin;

  if (error) {
    logger.warn('HubSpot OAuth declined by user', { error });
    // return res.redirect(`${config.frontendUrl}?connected=false&error=${encodeURIComponent(error)}`);
    return res.send(renderOAuthResultPage({
      parentOrigin,
      success: false,
    }));
  }

  if (!code || !state) {
    return res.status(400).json({ error: 'Missing code or state' });
  }

  try {
    const { siteId } = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')) as { siteId: string };

    const { tokens, portalId } = await hubspotService.exchangeCode(code);
    await tokenService.save(siteId, tokens, portalId);

    // Register HubSpot webhooks to point back to our server
    const webhookCallbackUrl = `${req.protocol}://${req.get('host')}/api/webhooks/hubspot/${siteId}`;
    try {
      await hubspotService.setupWebhooks(siteId, webhookCallbackUrl);
    } catch (whErr) {
      // Non-fatal: webhook setup can be retried
      logger.warn('Webhook setup failed (non-fatal)', { err: whErr });
    }

    logger.info('HubSpot OAuth complete', { siteId, portalId });
    // res.redirect(`${config.frontendUrl}?connected=true`);
    // Instead of redirecting to the frontend, render a popup completion page
    return res.send(renderOAuthResultPage({
      parentOrigin,
      success: true,
    }));
  } catch (err) {
    logger.error('OAuth callback error', { err });
    // res.redirect(`${config.frontendUrl}?connected=false&error=oauth_failed`);
    return res.send(renderOAuthResultPage({
      parentOrigin,
      success: false,
    }));
  }
});

function renderOAuthResultPage(opts: { parentOrigin: string; success: boolean }) {
  const { parentOrigin, success } = opts;
  const message = success ? 'hubspot_oauth_success' : 'hubspot_oauth_error';
  const title = success ? 'HubSpot Connected' : 'Connection Failed';
  const text = success
    ? 'HubSpot is now connected. You can close this window and return to Wix.'
    : 'The connection failed. You can close this window and try again from Wix.';

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
      </head>
      <body style="font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; text-align: center; padding: 2rem;">
        <h1>${title}</h1>
        <p>${text}</p>
        <script>
          (function() {
            try {
              if (window.opener && !window.opener.closed) {
                window.opener.postMessage('${message}', '${parentOrigin}');
              }
            } catch (e) {
              console.error('postMessage error', e);
            }
            // Auto-close after a short delay
            setTimeout(function () {
              window.close();
            }, 1000);
          })();
        </script>
      </body>
    </html>
    `;
}

/**
 * GET /api/auth/status
 * Returns whether the site has a connected HubSpot account.
 */
router.get('/status', requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const connected = await tokenService.isConnected(authReq.siteId);
    const portalId = connected ? await tokenService.getPortalId(authReq.siteId) : null;
    res.json({ connected, portalId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check connection status' });
  }
});

/**
 * DELETE /api/auth/disconnect
 * Revoke HubSpot tokens and remove from storage.
 */
router.delete('/disconnect', requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const tokens = await tokenService.get(authReq.siteId);
    if (tokens) {
      // Optionally revoke the token with HubSpot
      try {
        await globalThis.fetch('https://api.hubapi.com/oauth/v1/refresh-tokens/' + tokens.refreshToken, {
          method: 'DELETE',
        });
      } catch {
        // Non-fatal
      }
    }
    await tokenService.delete(authReq.siteId);
    logger.info('HubSpot disconnected', { siteId: authReq.siteId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

export default router;
