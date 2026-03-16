import { useEffect, useState, useCallback } from 'react';
import { syncApi, SyncLogEntry, SyncStats } from '../api/client';

const STATUS_STYLES: Record<string, string> = {
  success: 'bg-emerald-100 text-emerald-700',
  skipped: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
};

const DIRECTION_LABELS: Record<string, string> = {
  wix_to_hubspot: 'Wix → HubSpot',
  hubspot_to_wix: 'HubSpot → Wix',
  form_to_hubspot: 'Form → HubSpot',
};

function StatCard({
  label,
  value,
  color = 'slate',
}: {
  label: string;
  value: number | string;
  color?: 'slate' | 'emerald' | 'red' | 'blue' | 'violet';
}) {
  const colors: Record<string, string> = {
    slate: 'bg-slate-50 text-slate-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
    blue: 'bg-blue-50 text-blue-700',
    violet: 'bg-violet-50 text-violet-700',
  };
  return (
    <div className={`rounded-xl px-4 py-3 ${colors[color]}`}>
      <div className="text-2xl font-bold font-mono">{value}</div>
      <div className="text-xs font-medium mt-0.5 opacity-70">{label}</div>
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function SyncLog({ connected }: { connected: boolean }) {
  const [entries, setEntries] = useState<SyncLogEntry[]>([]);
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    try {
      const [logRes, statsRes] = await Promise.all([
        syncApi.getLog(30),
        syncApi.getStats(),
      ]);
      setEntries(logRes.entries);
      setStats(statsRes);
    } catch {
      // Silently handle — secondary UI element
    } finally {
      setLoading(false);
    }
  }, [connected]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000); // refresh every 30s
    return () => clearInterval(interval);
  }, [load]);

  if (!connected) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-base font-bold text-slate-900">Sync Activity</h3>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1.5"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={loading ? 'animate-spin' : ''}
          >
            <polyline points="23,4 23,10 17,10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-5 gap-3 border-b border-slate-100">
          <StatCard label="Total syncs" value={stats.total} color="slate" />
          <StatCard label="Successful" value={stats.success} color="emerald" />
          <StatCard label="Errors" value={stats.errors} color="red" />
          <StatCard label="Mapped contacts" value={stats.mappedContacts} color="blue" />
          <StatCard label="Last 24h" value={stats.last24h} color="violet" />
        </div>
      )}

      {/* Log entries */}
      <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
        {loading && entries.length === 0 && (
          <div className="py-8 text-center text-sm text-slate-400">Loading sync log…</div>
        )}
        {!loading && entries.length === 0 && (
          <div className="py-8 text-center text-sm text-slate-400">
            No sync activity yet. Sync events will appear here.
          </div>
        )}
        {entries.length > 0 && entries.map((entry) => (
          <div key={entry.id} className="flex items-center gap-3 px-6 py-3 hover:bg-slate-50 transition-colors">
            <span
              className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-md ${
                STATUS_STYLES[entry.status] || STATUS_STYLES.skipped
              }`}
            >
              {entry.status}
            </span>
            <span className="text-sm text-slate-700 font-medium min-w-0 truncate">
              {DIRECTION_LABELS[entry.direction] || entry.direction}
            </span>
            {entry.reason && (
              <span className="text-xs text-slate-400 truncate hidden sm:block">
                {entry.reason}
              </span>
            )}
            <span className="ml-auto shrink-0 text-xs text-slate-400 font-mono">
              {timeAgo(entry.created_at)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
