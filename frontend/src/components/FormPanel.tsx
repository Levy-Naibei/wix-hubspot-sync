import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

function getSiteId(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("siteId") || params.get("instance") || "dev-site-id";
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Clipboard copy failed", err);
    }
  };
  return (
    <button
      onClick={copy}
      className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg transition-colors"
    >
      {copied ? (
        <>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="text-emerald-500"
          >
            <polyline points="20,6 9,17 4,12" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

const buildEmbedSnippet = (siteId: string, apiBase: string) =>
  `<!-- Step 1: Add to Wix Custom Code (Settings > Custom Code) -->
    <script src="${apiBase}/api/forms/snippet?siteId=${siteId}"></script>

    <!-- Step 2: Call from your Wix form's onSubmit -->
    <script>
    $w('#myForm').onSubmit(async () => {
      await window.wixHubSpotSubmit({
        email: $w('#emailInput').value,
        firstName: $w('#firstNameInput').value,
        lastName: $w('#lastNameInput').value,
        // Optional: phone, customFields, etc.
        // UTM params, pageUrl, referrer captured automatically
      });
    });
    </script>`;

const UTM_FIELDS = [
  {
    prop: "wix_utm_source",
    example: "google",
    desc: "Raw UTM source from URL",
  },
  { prop: "wix_utm_medium", example: "cpc", desc: "Raw UTM medium from URL" },
  {
    prop: "wix_utm_campaign",
    example: "spring-sale",
    desc: "Raw UTM campaign name from URL",
  },
  {
    prop: "wix_utm_term",
    example: "running+shoes",
    desc: "Paid search keyword from URL",
  },
  {
    prop: "wix_utm_content",
    example: "banner-a",
    desc: "Ad variant from URL",
  },
  {
    prop: "wix_last_page_url",
    example: "https://site.com/cta",
    desc: "Page URL at submission",
  },
  {
    prop: "wix_last_referrer",
    example: "https://google.com",
    desc: "document.referrer value at submission",
  },
  {
    prop: "wix_form_submitted_at",
    example: "2025-04-01T10:30:00Z",
    desc: "ISO timestamp of submission",
  },
  { prop: "wix_form_id", example: "form-abc123", desc: "Wix form identifier" },
  {
    prop: "wix_form_name",
    example: "Contact Us",
    desc: "Wix form display name",
  },
];

export function FormsPanel({ connected }: { connected: boolean }) {
  const siteId = getSiteId();
  const [tab, setTab] = useState<"snippet" | "test">("snippet");
  const [form, setForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    phone: "",
    utm_source: "",
    utm_medium: "",
    utm_campaign: "",
    utm_term: "",
    utm_content: "",
    pageUrl: typeof window !== "undefined" ? window.location.href : "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );

  const submit = async () => {
    if (!form.email || !connected) return;
    setSubmitting(true);
    setResult(null);
    try {
      const resp = await fetch(`${API_BASE}/api/forms/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          email: form.email,
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          utm: {
            source: form.utm_source,
            medium: form.utm_medium,
            campaign: form.utm_campaign,
            term: form.utm_term,
            content: form.utm_content,
          },
          pageUrl: form.pageUrl,
          referrer:
            typeof document !== "undefined" ? document.referrer : undefined,
          formName: "Submit Form",
        }),
      });

      let d: {
        success?: boolean;
        error?: string;
        hubspotContactId?: string;
      } = {};

      try {
        d = (await resp.json()) as typeof d;
      } catch {
        setResult({
          ok: false,
          msg: `Invalid server response (status ${resp.status})`,
        });
        return;
      }

      if (!resp.ok || !d.success) {
        setResult({
          ok: false,
          msg: d.error || `Submission failed (status ${resp.status})`,
        });
        return;
      }

      setResult({
        ok: true,
        msg: `Synced to HubSpot — contact ID: ${d.hubspotContactId}`,
      });
    } catch (e) {
      setResult({
        ok: false,
        msg: e instanceof Error ? e.message : "Network error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!connected) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
        <strong>HubSpot not connected.</strong> Go to the Overview tab and
        connect your account first.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Banner */}
      <div className="bg-linear-to-r from-blue-50 to-violet-50 border border-blue-100 rounded-2xl p-5">
        <h3 className="font-bold text-slate-900 mb-1 flex items-center gap-2">
          <span>📋</span> Form Lead Capture
        </h3>
        <p className="text-sm text-slate-600 leading-relaxed">
          Wix form submissions create or update HubSpot contacts by email.
          <strong>
            {" "}
            UTM parameters, page URL, and referrer are captured automatically
          </strong>{" "}
          — no extra code needed.
        </p>
      </div>

      {/* Tabs card */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {/* Tab strip */}
        <div className="flex border-b border-slate-100 px-4 pt-4 gap-1">
          {(
            [
              ["snippet", "JS Snippet", "⟨/⟩"],
              ["test", "Test Submission", "▶"],
            ] as const
          ).map(([id, label, icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
                tab === id
                  ? "border-blue-500 text-blue-600 bg-blue-50/50"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <span className="font-mono mr-1 opacity-50">{icon}</span>
              {label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* ── JS Snippet ── */}
          {tab === "snippet" && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-semibold text-slate-900 text-sm">
                    Embed in Wix Custom Code
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Wix Dashboard → Settings → Custom Code → Add code.
                  </p>
                </div>
                <CopyButton text={buildEmbedSnippet(siteId, API_BASE)} />
              </div>
              <pre className="bg-slate-900 text-green-300 rounded-xl p-4 text-xs font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap">
                {buildEmbedSnippet(siteId, API_BASE)}
              </pre>
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
                <strong>UTM auto-capture:</strong> the snippet reads{" "}
                <code className="bg-amber-100 px-1 rounded">
                  window.location.search
                </code>{" "}
                at submit time — just make sure landing page URLs include UTM
                params (
                <code className="bg-amber-100 px-1 rounded">
                  ?utm_source=google&amp;utm_medium=cpc
                </code>
                ).
              </div>
            </div>
          )}

          {/* ── Test ── */}
          {tab === "test" && (
            <div>
              <h4 className="font-semibold text-slate-900 text-sm mb-1">
                Form Submission
              </h4>
              <p className="text-xs text-slate-500 mb-4">
                Send a real contact to HubSpot to verify the integration
                end-to-end.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  {
                    key: "email",
                    label: "Email *",
                    placeholder: "test@example.com",
                    type: "email",
                  },
                  {
                    key: "firstName",
                    label: "First Name",
                    placeholder: "Jane",
                    type: "text",
                  },
                  {
                    key: "lastName",
                    label: "Last Name",
                    placeholder: "Smith",
                    type: "text",
                  },
                  {
                    key: "phone",
                    label: "Phone",
                    placeholder: "+1 555 000 0000",
                    type: "tel",
                  },
                  {
                    key: "utm_source",
                    label: "UTM Source",
                    placeholder: "google",
                    type: "text",
                  },
                  {
                    key: "utm_medium",
                    label: "UTM Medium",
                    placeholder: "cpc",
                    type: "text",
                  },
                  {
                    key: "utm_campaign",
                    label: "UTM Campaign",
                    placeholder: "spring-sale",
                    type: "text",
                  },
                  {
                    key: "utm_term",
                    label: "UTM Term",
                    placeholder: "running+shoes",
                    type: "text",
                  },
                  {
                    key: "utm_content",
                    label: "UTM Content",
                    placeholder: "banner-a",
                    type: "text",
                  },
                  {
                    key: "pageUrl",
                    label: "Page URL",
                    placeholder: "https://…",
                    type: "text",
                  },
                ].map(({ key, label, placeholder, type }) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                      {label}
                    </label>
                    <input
                      type={type}
                      placeholder={placeholder}
                      value={form[key as keyof typeof form]}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, [key]: e.target.value }))
                      }
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                ))}
              </div>

              {result && (
                <div
                  className={`mt-4 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 ${
                    result.ok
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-red-50 text-red-700 border border-red-200"
                  }`}
                >
                  {result.ok ? (
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
                  ) : (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                  )}
                  {result.msg}
                </div>
              )}

              <button
                onClick={submit}
                disabled={!form.email || submitting}
                className="mt-5 inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors"
              >
                {submitting ? (
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22,2 15,22 11,13 2,9" />
                  </svg>
                )}
                {submitting ? "Submitting…" : "Send test to HubSpot"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* UTM schema — always visible */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">
            UTM Attribution Schema
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            HubSpot contact properties set from Wix form submissions.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {["HubSpot Property", "Example", "Description"].map((h) => (
                  <th
                    key={h}
                    className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {UTM_FIELDS.map((f) => (
                <tr key={f.prop} className="hover:bg-slate-50">
                  <td className="px-5 py-2.5 font-mono text-blue-600 font-medium">
                    {f.prop}
                  </td>
                  <td className="px-5 py-2.5 font-mono text-slate-500">
                    {f.example}
                  </td>
                  <td className="px-5 py-2.5 text-slate-600">{f.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
