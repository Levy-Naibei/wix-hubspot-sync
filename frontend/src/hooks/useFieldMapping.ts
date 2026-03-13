import { useState, useEffect, useCallback } from 'react';
import {
  fieldMappingApi,
  FieldMapping,
  WixField,
  HubSpotProperty,
} from '../api/client';

export function useFieldMapping(connected: boolean) {
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [wixFields, setWixFields] = useState<WixField[]>([]);
  const [hubspotProps, setHubspotProps] = useState<HubSpotProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const load = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError(null);
    try {
      const [mappingRes, fieldsRes, propsRes] = await Promise.all([
        fieldMappingApi.getMappings(),
        fieldMappingApi.getWixFields(),
        fieldMappingApi.getHubSpotProperties(),
      ]);
      setMappings(mappingRes.mappings);
      setWixFields(fieldsRes.fields);
      setHubspotProps(propsRes.properties);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load mappings');
    } finally {
      setLoading(false);
    }
  }, [connected]);

  useEffect(() => {
    load();
  }, [load]);

  const addRow = useCallback(() => {
    setMappings((prev) => [
      ...prev,
      {
        wixField: '',
        hubspotProperty: '',
        direction: 'bidirectional' as const,
        transform: null,
      },
    ]);
  }, []);

  const updateRow = useCallback((index: number, updates: Partial<FieldMapping>) => {
    setMappings((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...updates } : row)),
    );
  }, []);

  const removeRow = useCallback((index: number) => {
    setMappings((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      await fieldMappingApi.saveMappings(mappings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [mappings]);

  return {
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
  };
}
