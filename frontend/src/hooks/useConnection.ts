import { useState, useEffect, useCallback } from 'react';
import { authApi, ConnectionStatus } from '../api/client';

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
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'true') {
      window.history.replaceState({}, '', window.location.pathname);
      refresh();
    }
  }, [refresh]);

  const connect = useCallback(async () => {
    try {
      const { authUrl } = await authApi.getAuthUrl();
      window.location.href = authUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start OAuth';
      console.error('Connection error', err);
      setError(msg);
    }
  }, []);

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
