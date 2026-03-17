const HubSpotIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.164 7.931V5.085a2.198 2.198 0 0 0 1.267-1.978V3.05A2.201 2.201 0 0 0 17.228.85h-.057a2.201 2.201 0 0 0-2.203 2.2v.057a2.198 2.198 0 0 0 1.267 1.978v2.846a6.238 6.238 0 0 0-2.962 1.3L5.85 3.586a2.44 2.44 0 1 0-1.344 1.486l7.22 5.474a6.238 6.238 0 0 0 .023 7.258l-2.19 2.19a1.93 1.93 0 1 0 1.414 1.414l2.19-2.19a6.262 6.262 0 1 0 5.001-11.287zM17.2 17.2a3.896 3.896 0 1 1 0-7.792 3.896 3.896 0 0 1 0 7.792z" />
  </svg>
);

const WixIcon = () => (
  <svg width="40" height="30" viewBox="0 0 24 24" fill="currentColor">
    <path d="M9.5 7L7 17h-2L3 9l-2 8H-.5L-3 7h2l1.5 7 2-7h2l2 7 1.5-7z" />
  </svg>
);

const StatusDot = ({ connected }: { connected: boolean }) => (
  <span className="relative flex h-2.5 w-2.5">
    {connected && (
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
    )}
    <span
      className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
        connected ? "bg-emerald-500" : "bg-slate-400"
      }`}
    />
  </span>
);

type ConnectPanelProps = {
  connected: boolean;
  portalId: string | null;
  loading: boolean;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
  disconnecting: boolean;
};

export function ConnectPanel({
  connected,
  portalId,
  loading,
  error,
  connect,
  disconnect,
  disconnecting,
}: ConnectPanelProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 animate-pulse">
        <div className="h-5 bg-slate-200 rounded w-40 mb-3" />
        <div className="h-4 bg-slate-100 rounded w-64 mb-6" />
        <div className="h-10 bg-slate-200 rounded-xl w-44" />
      </div>
    );
  }

  return (
    <div
      className={`bg-white rounded-2xl border-2 p-6 transition-all duration-300 ${
        connected
          ? "border-emerald-200 shadow-sm shadow-emerald-100"
          : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <StatusDot connected={connected} />
            <span
              className={`text-sm font-semibold tracking-wide uppercase ${
                connected ? "text-emerald-600" : "text-slate-500"
              }`}
            >
              {connected ? "Connected" : "Not Connected"}
            </span>
          </div>

          {connected && portalId && (
            <p className="text-sm text-slate-500">
              Portal ID:{" "}
              <span className="font-mono text-slate-700">{portalId}</span>
            </p>
          )}

          {!connected && (
            <p className="text-sm text-slate-500 mt-1">
              Connect your HubSpot account to enable contact syncing and form
              capture.
            </p>
          )}
        </div>

        {/* Logos */}
        <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
          <span className="text-[#0C6EFC]">
            <WixIcon />
          </span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-slate-400"
          >
            <path d="M17 7l-10 10M7 7l10 10" />
          </svg>
          <span className="text-[#ff7a59]">
            <HubSpotIcon />
          </span>
        </div>
      </div>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-5 flex items-center gap-3">
        {!connected ? (
          <button
            onClick={connect}
            className="cursor-pointer inline-flex items-center gap-2 bg-[#ff7a59] hover:bg-[#e8694a] text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors duration-150 shadow-sm"
          >
            <HubSpotIcon />
            Connect HubSpot
          </button>
        ) : (
          <button
            onClick={disconnect}
            disabled={disconnecting}
            className="cursor-pointer inline-flex items-center gap-2 bg-white hover:bg-red-50 text-red-600 border border-red-200 font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors duration-150"
          >
            {disconnecting ? (
              <span className="animate-spin w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full" />
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16,17 21,12 16,7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            )}
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </button>
        )}

        {connected && (
          <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polyline points="20,6 9,17 4,12" />
            </svg>
            Sync active — contacts syncing bi-directionally
          </div>
        )}
      </div>
    </div>
  );
}
