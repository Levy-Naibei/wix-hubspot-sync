import { useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

function getSiteId(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('siteId') || params.get('instance') || 'dev-site-id';
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg transition-colors"
    >
      {copied ? (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500">
            <polyline points="20,6 9,17 4,12" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

const EMBED_SNIPPET = (siteId: string, apiBase: string) => `<!-- Step 1: Add this snippet to your Wix page's Custom Code -->
<script src="${apiBase}/api/forms/snippet?siteId=${siteId}"></script>

<!-- Step 2: In your Wix form's onSubmit handler (Velo / Editor X) -->
<script>
$w('#myContactForm').onSubmit(async (event) => {
  await window.wixHubSpotSubmit({
    email: $w('#emailInput').value,
    firstName: $w('#firstNameInput').value,
    lastName: $w('#lastNameInput').value,
    phone: $w('#phoneInput').value,
    // UTM params, pageUrl, referrer are captured automatically
  });
});
</script>`;

const VELO_SNIPPET = `// backend/events.js  (Wix Velo backend file)
import { fetch } from 'wix-fetch';

export async function wixForms_onFormSubmit(event) {
  const fields = {};
  for (const field of event.submissionData.fields) {
    fields[field.fieldType] = field.value;
  }

  await fetch('https://your-domain.com/api/forms/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      siteId: 'YOUR_SITE_ID',
      email: fields.email,
      firstName: fields.firstName,
      lastName: fields.lastName,
      phone: fields.phone,
      formId: event.formId,
    }),
  });
}`;

const UTM_FIELDS = [
  { prop: 'utm_source', example: 'google', desc: 'Traffic source (e.g. google, newsletter)' },
  { prop: 'utm_medium', example: 'cpc', desc: 'Marketing medium (e.g. cpc, email, organic)' },
  { prop: 'utm_campaign', example: 'spring-sale', desc: 'Campaign name' },
  { prop: 'utm_term', example: 'running+shoes', desc: 'Paid search keyword' },
  { prop: 'utm_content', example: 'banner-a', desc: 'Ad variant / content differentiator' },
  { prop: 'form_page_url', example: 'https://site.com/contact', desc: 'URL where form was submitted' },
  { prop: 'form_referrer', example: 'https://google.com', desc: 'Referring page (document.referrer)' },
  { prop: 'form_submitted_at', example: '2025-04-01T10:30:00Z', desc: 'ISO timestamp of submission' },
  { prop: 'wix_form_id', example: 'form-abc123', desc: 'Wix form identifier' },
  { prop: 'wix_form_name', example: 'Contact Us', desc: 'Wix form display name' },
];

export function FormsPanel({ connected }: { connected: boolean }) {
  const siteId = getSiteId();
  const [tab, setTab] = useState<'snippet' | 'velo' | 'test'>('snippet');

  // Test form state
  const [testForm, setTestForm] = useState({
    email: '', firstName: '', lastName: '', phone: '',
    utm_source: '', utm_medium: '', utm_campaign: '',
    pageUrl: window.location.href,
  });
  const [submitting, setSubmitting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleTestSubmit = async () => {
    if (!testForm.email) return;
    setSubmitting(true);
    setTestResult(null);
    try {
      const resp = await fetch(`${API_BASE}/api/forms/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId,
          email: testForm.email,
          firstName: testForm.firstName,
          lastName: testForm.lastName,
          phone: testForm.phone,
          utm: {
            source: testForm.utm_source,
            medium: testForm.utm_medium,
            campaign: testForm.utm_campaign,
          },
          pageUrl: testForm.pageUrl,
          referrer: document.referrer,
          formName: 'Test Form',
        }),
      });
      const data = await resp.json() as { success?: boolean; error?: string; hubspotContactId?: string };
      if (data.success) {
        setTestResult({ success: true, message: `Contact synced to HubSpot (ID: ${data.hubspotContactId})` });
      } else {
        setTestResult({ success: false, message: data.error || 'Submission failed' });
      }
    } catch (err) {
      setTestResult({ success: false, message: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!connected) {
    return (
      <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center">
        <div className="mx-auto w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-400">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14,2 14,8 20,8" />
            <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10,9 9,9 8,9" />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-500">Connect HubSpot first to set up form capture</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* How it works banner */}
      <div className="bg-linear-to-r from-blue-50 to-violet-50 border border-blue-100 rounded-2xl p-5">
        <h3 className="font-bold text-slate-900 mb-1 flex items-center gap-2">
          <span className="text-lg">📋</span> Form Lead Capture
        </h3>
        <p className="text-sm text-slate-600 leading-relaxed">
          When a visitor submits a Wix form, their data is sent to HubSpot and either creates a new contact
          or updates an existing one by email. <strong>UTM parameters, page URL, and referrer are captured
          automatically</strong> and stored as HubSpot contact properties for full attribution tracking.
        </p>
      </div>

      {/* Integration tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-100 px-4 pt-4 gap-1">
          {[
            { id: 'snippet', label: 'JS Snippet', icon: '⟨/⟩' },
            { id: 'velo', label: 'Velo Backend', icon: '{}' },
            { id: 'test', label: 'Test Submission', icon: '▶' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as typeof tab)}
              className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-brand-500 text-brand-600 bg-brand-50/50'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className="font-mono mr-1.5 opacity-60">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* JS Snippet tab */}
          {tab === 'snippet' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-semibold text-slate-900 text-sm">Embed in Wix Custom Code</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Add to your Wix page's Custom Code section under Settings → Custom Code.</p>
                </div>
                <CopyButton text={EMBED_SNIPPET(siteId, API_BASE)} />
              </div>
              <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-xs font-mono overflow-x-auto leading-relaxed">
                {EMBED_SNIPPET(siteId, API_BASE)}
              </pre>

              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <p className="text-xs font-semibold text-amber-800 mb-1">📍 How UTM attribution works</p>
                <p className="text-xs text-amber-700">
                  The snippet reads UTM parameters directly from <code className="bg-amber-100 px-1 rounded">window.location.search</code> at submission time.
                  No manual code needed — just make sure your ads link to pages with UTM params (e.g. <code className="bg-amber-100 px-1 rounded">?utm_source=google&utm_medium=cpc</code>).
                </p>
              </div>
            </div>
          )}

          {/* Velo tab */}
          {tab === 'velo' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-semibold text-slate-900 text-sm">Wix Velo Backend Integration</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Use this in your site's <code className="font-mono">backend/events.js</code> for native Wix Forms.</p>
                </div>
                <CopyButton text={VELO_SNIPPET} />
              </div>
              <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-xs font-mono overflow-x-auto leading-relaxed">
                {VELO_SNIPPET}
              </pre>
            </div>
          )}

          {/* Test tab */}
          {tab === 'test' && (
            <div>
              <h4 className="font-semibold text-slate-900 text-sm mb-1">Test Form Submission</h4>
              <p className="text-xs text-slate-500 mb-5">Submit a test contact to verify your HubSpot connection is working.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { key: 'email', label: 'Email *', placeholder: 'test@example.com', type: 'email' },
                  { key: 'firstName', label: 'First Name', placeholder: 'Jane', type: 'text' },
                  { key: 'lastName', label: 'Last Name', placeholder: 'Smith', type: 'text' },
                  { key: 'phone', label: 'Phone', placeholder: '+1 555 000 0000', type: 'tel' },
                  { key: 'utm_source', label: 'UTM Source', placeholder: 'google', type: 'text' },
                  { key: 'utm_medium', label: 'UTM Medium', placeholder: 'cpc', type: 'text' },
                  { key: 'utm_campaign', label: 'UTM Campaign', placeholder: 'spring-sale', type: 'text' },
                  { key: 'pageUrl', label: 'Page URL', placeholder: 'https://...', type: 'text' },
                ].map((field) => (
                  <div key={field.key}>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">{field.label}</label>
                    <input
                      type={field.type}
                      placeholder={field.placeholder}
                      value={testForm[field.key as keyof typeof testForm]}
                      onChange={(e) => setTestForm((p) => ({ ...p, [field.key]: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    />
                  </div>
                ))}
              </div>

              {testResult && (
                <div className={`mt-4 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 ${
                  testResult.success
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {testResult.success
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20,6 9,17 4,12" /></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                  }
                  {testResult.message}
                </div>
              )}

              <button
                onClick={handleTestSubmit}
                disabled={!testForm.email || submitting}
                className="mt-5 inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors"
              >
                {submitting ? (
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22,2 15,22 11,13 2,9" />
                  </svg>
                )}
                {submitting ? 'Submitting…' : 'Send test to HubSpot'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* UTM Attribution schema */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">UTM Attribution Schema</h3>
          <p className="text-xs text-slate-500 mt-0.5">These HubSpot contact properties are set automatically on every form submission.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">HubSpot Property</th>
                <th className="text-left font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">Example Value</th>
                <th className="text-left font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {UTM_FIELDS.map((f) => (
                <tr key={f.prop} className="hover:bg-slate-50">
                  <td className="px-5 py-2.5 font-mono text-brand-600 font-medium">{f.prop}</td>
                  <td className="px-5 py-2.5 text-slate-500 font-mono">{f.example}</td>
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
