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

      // Listen for completion message from the popup
      const handleMessage = (event: MessageEvent) => {
        // IMPORTANT: restrict origin to your backend/front-end domain
        const allowedOrigin = API_BASE;
        if (event.origin !== allowedOrigin) return;

        if (event.data === 'hubspot_oauth_success') {
          // OAuth done → refresh connection status
          refresh();
          // Remove listener
          window.removeEventListener('message', handleMessage);
          // Close popup if still open
          try {
            popup.close();
          } catch (e) { }
        } else if (event.data === 'hubspot_oauth_error') {
          setError('OAuth failed. Please try again.');
          window.removeEventListener('message', handleMessage);
          try {
            popup.close();
          } catch (e) { }
        }
      };
      window.addEventListener('message', handleMessage);
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

  return { status, loading, error, connect, disconnect, disconnecting, refresh };
}
