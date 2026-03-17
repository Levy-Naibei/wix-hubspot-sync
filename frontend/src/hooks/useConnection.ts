import { useState, useEffect, useCallback } from 'react';
import { authApi, ConnectionStatus } from '../api/client';

const API_BASE = (import.meta.env.VITE_API_URL as string) || '';

export function useConnection() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const s = await authApi.getStatus();
      setStatus(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();

    // Check for OAuth callback result in URL params
    // const params = new URLSearchParams(window.location.search);
    // if (params.get('connected') === 'true') {
    //   window.history.replaceState({}, '', window.location.pathname);
    //   refresh();
    // }
  }, [refresh]);

  const connect = useCallback(async () => {
    try {
      const { authUrl } = await authApi.getAuthUrl();
      // window.location.href = authUrl;
      // Open OAuth popup
      const width = 900;
      const height = 800;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        authUrl,
        'hubspot_oauth_popup',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );

      if (!popup) {
        setError('Popup blocked. Please allow popups for this site and try again.');
        return;
      }

      let settled = false;

      function cleanup() {
        clearInterval(pollInterval);
        window.removeEventListener('message', handleMessage);
        try { popup?.close(); } catch (_) { }
      }

      // --- Primary path: postMessage from the callback page ---
      // event.origin will be the backend server's origin (the callback page is served
      // by the backend). Validate against VITE_BACKEND_ORIGIN, not the frontend origin.
      const handleMessage = (event: MessageEvent) => {
        // console.log('received message', { origin: event.origin, data: event.data });

        if (!API_BASE) {
          console.warn('VITE_BACKEND_ORIGIN is not set — skipping origin check');
        } else if (event.origin !== API_BASE) {
          console.log('origin mismatch, expected', API_BASE, 'got', event.origin);
          return;
        }

        if (event.data === 'hubspot_oauth_success') {
          settled = true;
          cleanup();
          refresh();
        } else if (event.data === 'hubspot_oauth_error') {
          settled = true;
          setError('OAuth failed. Please try again.');
          cleanup();
        }
      };
      window.addEventListener('message', handleMessage);

      // --- Fallback path: poll while the popup is open ---
      // If postMessage is blocked (e.g. by Wix iframe sandboxing), this detects
      // when the popup closes and re-fetches status regardless of the outcome.
      const pollInterval = setInterval(async () => {
        if (!popup || popup.closed) {
          clearInterval(pollInterval);
          window.removeEventListener('message', handleMessage);

          if (!settled) {
            // postMessage never arrived — re-fetch status to pick up any change
            await refresh();
          }
        }
      }, 1000);

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start OAuth';
      console.error('Connection error', err);
      setError(msg);
    }
  }, [refresh]);

  const disconnect = useCallback(async () => {
    if (!window.confirm('Disconnect HubSpot? This will stop all syncing.')) return;
    setDisconnecting(true);
    try {
      await authApi.disconnect();
      setStatus({ connected: false, portalId: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  }, []);

  const connected = status?.connected ?? false;

  return { connected, status, loading, error, connect, disconnect, disconnecting, refresh };
}
