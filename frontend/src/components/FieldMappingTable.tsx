import { useFieldMapping } from '../hooks/useFieldMapping';
import { FieldMapping } from '../api/client';

const DIRECTIONS = [
  { value: 'wix_to_hubspot', label: 'Wix → HubSpot', icon: '→' },
  { value: 'hubspot_to_wix', label: 'HubSpot → Wix', icon: '←' },
  { value: 'bidirectional', label: 'Bi-directional', icon: '⇄' },
] as const;

const TRANSFORMS = [
  { value: '', label: 'None' },
  { value: 'trim', label: 'Trim whitespace' },
  { value: 'lowercase', label: 'Lowercase' },
  { value: 'uppercase', label: 'Uppercase' },
];

const DirectionBadge = ({ direction }: { direction: FieldMapping['direction'] }) => {
  const d = DIRECTIONS.find((d) => d.value === direction);
  const colors: Record<string, string> = {
    wix_to_hubspot: 'bg-blue-50 text-blue-700 border-blue-200',
    hubspot_to_wix: 'bg-orange-50 text-orange-700 border-orange-200',
    bidirectional: 'bg-violet-50 text-violet-700 border-violet-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border ${colors[direction]}`}>
      {d?.icon} {d?.label}
    </span>
  );
};

export function FieldMappingTable({ connected }: { connected: boolean }) {
  const {
    mappings,
    wixFields,
    hubspotProps,
    loading,
    saving,
    error,
    saveSuccess,
    addRow,
    updateRow,
    removeRow,
    save,
  } = useFieldMapping(connected);

  if (!connected) {
    return (
      <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center">
        <div className="mx-auto w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-400">
            <path d="M9 17H7A5 5 0 0 1 7 7h2" /><path d="M15 7h2a5 5 0 1 1 0 10h-2" /><line x1="8" y1="12" x2="16" y2="12" />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-500">Connect HubSpot first to configure field mappings</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-slate-100 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900">Field Mappings</h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Map Wix contact fields to HubSpot properties. Changes sync automatically.
          </p>
        </div>
        <button
          onClick={addRow}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add mapping
        </button>
      </div>

      {/* Table */}
      {mappings.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left text-xs font-semibold text-slate-500 px-5 py-3 uppercase tracking-wide">Wix Field</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-5 py-3 uppercase tracking-wide">HubSpot Property</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-5 py-3 uppercase tracking-wide">Sync Direction</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-5 py-3 uppercase tracking-wide">Transform</th>
                <th className="w-10 px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {mappings.map((row, i) => (
                <tr key={i} className="group hover:bg-slate-50/60 transition-colors">
                  {/* Wix field */}
                  <td className="px-4 py-2.5">
                    <select
                      value={row.wixField}
                      onChange={(e) => updateRow(i, { wixField: e.target.value })}
                      className="w-full bg-transparent border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    >
                      <option value="">Select Wix field…</option>
                      {wixFields.map((f) => (
                        <option key={f.name} value={f.name}>{f.label}</option>
                      ))}
                    </select>
                  </td>

                  {/* HubSpot property */}
                  <td className="px-4 py-2.5">
                    <select
                      value={row.hubspotProperty}
                      onChange={(e) => updateRow(i, { hubspotProperty: e.target.value })}
                      className="w-full bg-transparent border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    >
                      <option value="">Select HubSpot property…</option>
                      {hubspotProps.map((p) => (
                        <option key={p.name} value={p.name}>{p.label} ({p.name})</option>
                      ))}
                    </select>
                  </td>

                  {/* Direction */}
                  <td className="px-4 py-2.5">
                    <select
                      value={row.direction}
                      onChange={(e) => updateRow(i, { direction: e.target.value as FieldMapping['direction'] })}
                      className="w-full bg-transparent border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    >
                      {DIRECTIONS.map((d) => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  </td>

                  {/* Transform */}
                  <td className="px-4 py-2.5">
                    <select
                      value={row.transform || ''}
                      onChange={(e) => updateRow(i, { transform: (e.target.value || null) as FieldMapping['transform'] })}
                      className="w-full bg-transparent border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    >
                      {TRANSFORMS.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </td>

                  {/* Delete */}
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => removeRow(i)}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all p-1 rounded"
                      title="Remove row"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3,6 5,6 21,6" />
                        <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a1,1,0,0,1,1-1h4a1,1,0,0,1,1,1v2" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-12 text-center">
          <p className="text-sm text-slate-400">No mappings yet. Add your first mapping above.</p>
        </div>
      )}

      {/* Footer */}
      {(mappings.length > 0 || error) && (
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            {saveSuccess && (
              <p className="text-sm text-emerald-600 font-medium flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20,6 9,17 4,12" />
                </svg>
                Mappings saved successfully
              </p>
            )}
          </div>
          <button
            onClick={save}
            disabled={saving || mappings.length === 0}
            className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors"
          >
            {saving ? (
              <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17,21 17,13 7,13 7,21" />
                <polyline points="7,3 7,8 15,8" />
              </svg>
            )}
            {saving ? 'Saving…' : 'Save mappings'}
          </button>
        </div>
      )}
    </div>
  );
}
