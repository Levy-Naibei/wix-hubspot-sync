import React, { useState, useEffect } from "react";
import { ConnectPanel } from "./components/ConnectPanel";
import { FormsPanel } from "./components/FormPanel";
import { FieldMappingTable } from "./components/FieldMappingTable";
import { SyncLog } from "./components/SyncLog";
import { authApi } from "./api/client";

type Tab = "overview" | "mapping" | "forms" | "activity";

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-150 ${
        active
          ? "bg-white text-slate-900 shadow-sm border border-slate-200"
          : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
      }`}
    >
      {children}
    </button>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    authApi
      .getStatus()
      .then((s) => setConnected(s.connected))
      .catch(() => setConnected(false));
  }, []);

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-blue-50/30 font-sans">
      {/* Top bar */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo mark */}
            <div className="flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-lg bg-[#0C6EFC] flex items-center justify-center">
                <span className="text-white text-xs font-bold">W</span>
              </div>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-slate-400"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12,5 19,12 12,19" />
              </svg>
              <div className="w-7 h-7 rounded-lg bg-[#ff7a59] flex items-center justify-center">
                <span className="text-white text-xs font-bold">H</span>
              </div>
            </div>
            <div>
              <span className="text-sm font-bold text-slate-900">
                HubSpot Sync
              </span>
              <span className="text-xs text-slate-400 ml-2">for Wix</span>
            </div>
          </div>

          {connected && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              Live sync enabled
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Page title */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            Integration Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your Wix ↔ HubSpot integration — sync contacts, map fields,
            and capture leads.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit mb-6">
          <TabButton
            active={tab === "overview"}
            onClick={() => setTab("overview")}
          >
            Overview
          </TabButton>
          <TabButton
            active={tab === "mapping"}
            onClick={() => setTab("mapping")}
          >
            Field Mapping
          </TabButton>
          <TabButton active={tab === "forms"} onClick={() => setTab("forms")}>
            Wix Form
          </TabButton>
          <TabButton
            active={tab === "activity"}
            onClick={() => setTab("activity")}
          >
            Activity Log
          </TabButton>
        </div>

        <div className="space-y-5">
          {/* Overview tab */}
          {tab === "overview" && (
            <>
              <ConnectPanel />

              {connected && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    {
                      icon: "⇄",
                      title: "Bi-directional Sync",
                      desc: "Contacts sync automatically in both directions with loop prevention.",
                      color:
                        "from-violet-50 to-violet-100/50 border-violet-200",
                    },
                    {
                      icon: "📋",
                      title: "Form Capture",
                      desc: "Wix form submissions create/update HubSpot contacts with UTM attribution.",
                      color: "from-blue-50 to-blue-100/50 border-blue-200",
                    },
                    {
                      icon: "🔒",
                      title: "Secure Tokens",
                      desc: "OAuth tokens are AES-256 encrypted at rest. Never exposed to the browser.",
                      color:
                        "from-emerald-50 to-emerald-100/50 border-emerald-200",
                    },
                  ].map((card) => (
                    <div
                      key={card.title}
                      className={`bg-linear-to-br ${card.color} border rounded-2xl p-5`}
                    >
                      <div className="text-2xl mb-2">{card.icon}</div>
                      <h4 className="font-semibold text-slate-900 text-sm mb-1">
                        {card.title}
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {card.desc}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <SyncLog connected={connected} />
            </>
          )}

          {/* Mapping tab */}
          {tab === "mapping" && (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                <strong>Note:</strong> Sync uses saved mappings. Changes take
                effect immediately after saving. Default mappings (email,
                first/last name) are always synced regardless of custom rules.
              </div>
              <FieldMappingTable connected={connected} />
            </>
          )}

          {/* Forms tab */}
          {tab === "forms" && <FormsPanel connected={connected} />}

          {/* Activity tab */}
          {tab === "activity" && <SyncLog connected={connected} />}
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto px-6 py-6 mt-4 border-t border-slate-100">
        <p className="text-xs text-slate-500 text-center">
          Wix ↔ HubSpot Integration · Self-hosted Wix App · Built with Node.js +
          React
        </p>
      </footer>
    </div>
  );
}
