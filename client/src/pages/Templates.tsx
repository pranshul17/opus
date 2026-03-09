import { useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';

const SAMPLE_TEMPLATES = [
  {
    name: 'Feature Release',
    description: 'Announce a new feature release',
    content: `# {{feature_name}} Release

**What's new:** {{description}}

**Owner:** @{{owner}}
**Target date:** {{due_date}}

**Action items:**
- [ ] Update documentation
- [ ] Notify stakeholders
- [ ] Monitor for issues`,
  },
  {
    name: 'Incident Response',
    description: 'Track an ongoing incident',
    content: `🚨 *Incident: {{incident_name}}*

**Severity:** {{severity}}
**Assigned to:** @{{assignee}}
**ETA:** {{eta}}

**Status:** Investigating

**Action items:**
- [ ] Identify root cause
- [ ] Implement fix
- [ ] Post-mortem`,
  },
];

export default function Templates() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showPushModal, setShowPushModal] = useState(false);
  const [editTemplate, setEditTemplate] = useState<any>(null);
  const [pushTemplate, setPushTemplate] = useState<any>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', description: '', content: '' });
  const [pushForm, setPushForm] = useState<Record<string, string>>({});
  const [pushChannel, setPushChannel] = useState('');
  const [pushDueDate, setPushDueDate] = useState('');
  const [pushAssignee, setPushAssignee] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState('');

  const load = () => api.templates.list().then(setTemplates).catch(console.error);

  useEffect(() => { load(); api.channels.list().then(setChannels); }, []);

  const openAdd = () => {
    setEditTemplate(null);
    setForm({ name: '', description: '', content: '' });
    setPreview('');
    setShowModal(true);
  };

  const openEdit = (t: any) => {
    setEditTemplate(t);
    setForm({ name: t.name, description: t.description || '', content: t.content });
    setPreview('');
    setShowModal(true);
  };

  const loadSample = (sample: typeof SAMPLE_TEMPLATES[0]) => {
    setForm({ name: sample.name, description: sample.description, content: sample.content });
  };

  // Extract variables from content
  const extractVars = (content: string) => {
    const matches = [...content.matchAll(/\{\{(\w+)\}\}/g)];
    return [...new Set(matches.map(m => m[1]))];
  };

  const save = async () => {
    if (!form.name || !form.content) return alert('Name and content are required');
    setSaving(true);
    try {
      if (editTemplate) {
        await api.templates.update(editTemplate.id, form);
      } else {
        await api.templates.create(form);
      }
      setShowModal(false);
      load();
    } catch (e: any) { alert(e.message); }
    setSaving(false);
  };

  const del = async (id: number) => {
    if (!confirm('Delete this template?')) return;
    await api.templates.delete(id);
    load();
  };

  const openPush = (t: any) => {
    setPushTemplate(t);
    const vars = extractVars(t.content);
    const initial: Record<string, string> = {};
    vars.forEach(v => { initial[v] = ''; });
    setPushForm(initial);
    setPushChannel('');
    setPushDueDate('');
    setPushAssignee('');
    setShowPushModal(true);
  };

  const push = async () => {
    setSaving(true);
    try {
      const result = await api.templates.push(pushTemplate.id, {
        variables: pushForm,
        slack_channel_id: pushChannel || undefined,
        assignee: pushAssignee || undefined,
        due_date: pushDueDate || undefined,
      });
      alert(`✅ Task created: "${result.task.title}"`);
      setShowPushModal(false);
    } catch (e: any) { alert(e.message); }
    setSaving(false);
  };

  const updatePreview = (content: string, vars: Record<string, string>) => {
    let p = content;
    for (const [k, v] of Object.entries(vars)) {
      p = p.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v || `{{${k}}}`);
    }
    setPreview(p);
  };

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h2>Templates</h2>
            <p>Reusable task templates with variable placeholders for managers</p>
          </div>
          <button className="btn btn-primary" onClick={openAdd}>+ New Template</button>
        </div>
      </div>

      <div className="page-body">
        {templates.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="icon">📋</div>
              <p>No templates yet.</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
                <button className="btn btn-primary" onClick={openAdd}>+ Create Template</button>
                <button className="btn btn-secondary" onClick={() => { loadSample(SAMPLE_TEMPLATES[0]); setShowModal(true); }}>Load Sample</button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {templates.map(t => {
              const vars = extractVars(t.content);
              return (
                <div key={t.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{t.name}</div>
                    {t.description && <div className="text-sm text-muted" style={{ marginTop: 4 }}>{t.description}</div>}
                    {vars.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <div className="text-sm text-muted" style={{ marginBottom: 4 }}>Variables:</div>
                        <div>{vars.map(v => <span key={v} className="tag">{'{{' + v + '}}'}</span>)}</div>
                      </div>
                    )}
                    <pre style={{ marginTop: 12, padding: 10, background: 'var(--surface-2)', borderRadius: 6, fontSize: 11, fontFamily: 'monospace', overflow: 'auto', maxHeight: 120, color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                      {t.content.slice(0, 300)}{t.content.length > 300 ? '...' : ''}
                    </pre>
                  </div>
                  <div className="actions" style={{ marginTop: 16 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => openPush(t)}>Use Template</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(t)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => del(t.id)}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <Modal
          title={editTemplate ? 'Edit Template' : 'New Template'}
          onClose={() => setShowModal(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? <span className="spinner" /> : null}
                {editTemplate ? 'Save' : 'Create'}
              </button>
            </>
          }
        >
          {!editTemplate && (
            <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
              <span className="text-sm text-muted" style={{ alignSelf: 'center' }}>Load sample:</span>
              {SAMPLE_TEMPLATES.map(s => (
                <button key={s.name} className="btn btn-secondary btn-sm" onClick={() => loadSample(s)}>{s.name}</button>
              ))}
            </div>
          )}
          <div className="form-group">
            <label>Template Name *</label>
            <input placeholder="e.g. Feature Release" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Description</label>
            <input placeholder="When to use this template" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Content * (use {'{{variable}}'} for placeholders)</label>
            <textarea
              style={{ minHeight: 200, fontFamily: 'monospace', fontSize: 12 }}
              placeholder="# Task Title&#10;&#10;**Owner:** {{owner}}&#10;**Due date:** {{due_date}}"
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
            />
          </div>
          {form.content && (
            <div>
              <div className="text-sm text-muted">Detected variables:</div>
              <div style={{ marginTop: 4 }}>
                {extractVars(form.content).map(v => <span key={v} className="tag">{'{{' + v + '}}'}</span>)}
                {extractVars(form.content).length === 0 && <span className="text-sm text-muted">None</span>}
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Use Template Modal */}
      {showPushModal && pushTemplate && (
        <Modal
          title={`Use: ${pushTemplate.name}`}
          onClose={() => setShowPushModal(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setShowPushModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={push} disabled={saving}>
                {saving ? <span className="spinner" /> : null} Create Task
              </button>
            </>
          }
        >
          {Object.keys(pushForm).length > 0 && (
            <div>
              <div className="section-title" style={{ marginBottom: 12 }}>Fill in Variables</div>
              {Object.keys(pushForm).map(v => (
                <div className="form-group" key={v}>
                  <label>{'{{'}{v}{'}}'}</label>
                  <input
                    placeholder={v}
                    value={pushForm[v]}
                    onChange={e => {
                      const updated = { ...pushForm, [v]: e.target.value };
                      setPushForm(updated);
                      updatePreview(pushTemplate.content, updated);
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Assignee</label>
              <input placeholder="username" value={pushAssignee} onChange={e => setPushAssignee(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Due Date</label>
              <input type="date" value={pushDueDate} onChange={e => setPushDueDate(e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label>Assign to Channel</label>
            <select value={pushChannel} onChange={e => setPushChannel(e.target.value)}>
              <option value="">No channel</option>
              {channels.map(c => <option key={c.slack_channel_id} value={c.slack_channel_id}>#{c.slack_channel_name}</option>)}
            </select>
          </div>

          {preview && (
            <div>
              <div className="text-sm text-muted" style={{ marginBottom: 8 }}>Preview:</div>
              <pre style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 6, fontSize: 11, fontFamily: 'monospace', overflow: 'auto', maxHeight: 200, border: '1px solid var(--border)', whiteSpace: 'pre-wrap' }}>{preview}</pre>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
