import { useEffect, useState, useRef } from 'react';
import { api } from '../api/client';

interface EnvField {
  key: string;
  label: string;
  description: string;
  group: string;
  secret?: boolean;
  placeholder?: string;
  textarea?: boolean;
}

interface SettingsData {
  schema: EnvField[];
  values: Record<string, string>;
  envPath: string;
}

export default function Settings() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.settings.get()
      .then((d) => {
        setData(d);
        setFormValues({ ...d.values });
      })
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const grouped = data
    ? data.schema.reduce<Record<string, EnvField[]>>((acc, field) => {
        if (!acc[field.group]) acc[field.group] = [];
        acc[field.group].push(field);
        return acc;
      }, {})
    : {};

  const handleChange = (key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('idle');
    if (statusTimer.current) clearTimeout(statusTimer.current);
    try {
      await api.settings.save(formValues);
      setSaveStatus('success');
    } catch (e: any) {
      setSaveStatus('error');
      setSaveError(e.message);
    } finally {
      setSaving(false);
      statusTimer.current = setTimeout(() => setSaveStatus('idle'), 4000);
    }
  };

  const handleReset = () => {
    if (data) setFormValues({ ...data.values });
  };

  const isDirty = data
    ? Object.keys(formValues).some((k) => formValues[k] !== data.values[k])
    : false;

  if (loading) return <div className="page-loading">Loading settings…</div>;

  if (loadError) {
    return (
      <div className="settings-page">
        <div className="page-header">
          <div>
            <h1>Settings</h1>
            <p className="text-muted">Configure environment variables</p>
          </div>
        </div>
        <div className="alert alert-error">
          <strong>Could not load settings:</strong> {loadError}
          <p style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
            Make sure the backend server is running on port 3001.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="text-muted">Edit environment configuration — saved to <code className="env-path">{data?.envPath}</code></p>
        </div>
        <div className="header-actions">
          {isDirty && (
            <button className="btn btn-ghost" onClick={handleReset} disabled={saving}>
              Reset
            </button>
          )}
          <button
            className={`btn btn-primary ${saving ? 'loading' : ''}`}
            onClick={handleSave}
            disabled={saving || !isDirty}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {saveStatus === 'success' && (
        <div className="alert alert-success">
          ✅ Settings saved successfully. Restart the server for changes to take full effect.
        </div>
      )}
      {saveStatus === 'error' && (
        <div className="alert alert-error">
          ❌ Failed to save: {saveError}
        </div>
      )}

      <div className="settings-groups">
        {Object.entries(grouped).map(([group, fields]) => (
          <div key={group} className="settings-group card">
            <div className="settings-group-header">
              <h2>{group}</h2>
            </div>
            <div className="settings-fields">
              {fields.map((field) => {
                const value = formValues[field.key] ?? '';
                const isRevealed = revealed[field.key];
                const inputType = field.secret && !isRevealed ? 'password' : 'text';
                const isEmpty = value === '';
                const original = data?.values[field.key] ?? '';
                const changed = value !== original;

                return (
                  <div key={field.key} className={`settings-field ${changed ? 'is-changed' : ''}`}>
                    <div className="field-label-row">
                      <label htmlFor={field.key} className="field-label">
                        {field.label}
                        {changed && <span className="changed-badge">modified</span>}
                      </label>
                      <span className="field-key">{field.key}</span>
                    </div>
                    <p className="field-description">{field.description}</p>
                    <div className="field-input-row">
                      {field.textarea ? (
                        <textarea
                          id={field.key}
                          value={value}
                          onChange={(e) => handleChange(field.key, e.target.value)}
                          placeholder={isEmpty ? (field.placeholder ?? '') : ''}
                          className={`field-input field-textarea ${isEmpty ? 'is-empty' : ''}`}
                          rows={4}
                          autoComplete="off"
                          spellCheck={false}
                        />
                      ) : (
                        <input
                          id={field.key}
                          type={inputType}
                          value={value}
                          onChange={(e) => handleChange(field.key, e.target.value)}
                          placeholder={isEmpty ? (field.placeholder ?? '') : ''}
                          className={`field-input ${isEmpty ? 'is-empty' : ''}`}
                          autoComplete="off"
                          spellCheck={false}
                        />
                      )}
                      {field.secret && (
                        <button
                          type="button"
                          className="btn-reveal"
                          onClick={() => setRevealed((prev) => ({ ...prev, [field.key]: !prev[field.key] }))}
                          title={isRevealed ? 'Hide' : 'Reveal'}
                        >
                          {isRevealed ? '🙈' : '👁️'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="settings-footer">
        <p className="text-muted">
          ⚠️ Changes are written directly to <code className="env-path">{data?.envPath}</code>.
          Restart the backend server after saving for all changes to take full effect.
        </p>
      </div>
    </div>
  );
}
