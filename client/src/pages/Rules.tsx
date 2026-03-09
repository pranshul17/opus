import { useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';

export default function Rules() {
  const [rules, setRules] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editRule, setEditRule] = useState<any>(null);
  const [form, setForm] = useState({ name: '', trigger_type: 'keyword', trigger_value: '', response_template: '', applies_to: 'all', is_active: 1 });
  const [saving, setSaving] = useState(false);

  const load = () => api.rules.list().then(setRules).catch(console.error);
  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditRule(null);
    setForm({ name: '', trigger_type: 'keyword', trigger_value: '', response_template: '', applies_to: 'all', is_active: 1 });
    setShowModal(true);
  };

  const openEdit = (r: any) => {
    setEditRule(r);
    setForm({ name: r.name, trigger_type: r.trigger_type, trigger_value: r.trigger_value, response_template: r.response_template, applies_to: r.applies_to, is_active: r.is_active });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name || !form.trigger_value || !form.response_template) return alert('All fields required');
    setSaving(true);
    try {
      if (editRule) await api.rules.update(editRule.id, form);
      else await api.rules.create(form);
      setShowModal(false);
      load();
    } catch (e: any) { alert(e.message); }
    setSaving(false);
  };

  const del = async (id: number) => {
    if (!confirm('Delete this rule?')) return;
    await api.rules.delete(id);
    load();
  };

  const toggle = async (r: any) => {
    await api.rules.update(r.id, { is_active: r.is_active ? 0 : 1 });
    load();
  };

  const TRIGGER_HELP: Record<string, string> = {
    keyword: 'Pipe-separated keywords: noted|acknowledged|ack',
    mention: 'Leave as "@mention" — triggers when bot is @mentioned',
    pattern: 'JavaScript regex pattern, e.g. (urgent|asap|blocker)',
  };

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h2>Auto-Reply Rules</h2>
            <p>Configure automatic Slack replies for tracked channels</p>
          </div>
          <button className="btn btn-primary" onClick={openAdd}>+ New Rule</button>
        </div>
      </div>

      <div className="page-body">
        {rules.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="icon">⚡</div>
              <p>No auto-reply rules. Default rules are seeded on first start.</p>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Rule</th>
                    <th>Trigger</th>
                    <th>Matches</th>
                    <th>Applies To</th>
                    <th>Response</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 500 }}>{r.name}</td>
                      <td><span className="badge badge-open">{r.trigger_type}</span></td>
                      <td><code style={{ fontSize: 11, background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>{r.trigger_value}</code></td>
                      <td><span className={`badge badge-${r.applies_to === 'p0' ? 'p0' : r.applies_to === 'p1' ? 'p1' : 'open'}`}>{r.applies_to}</span></td>
                      <td style={{ maxWidth: 240 }}><span className="truncate text-muted">{r.response_template}</span></td>
                      <td>
                        <button className={`toggle ${r.is_active ? 'active-toggle' : ''}`} onClick={() => toggle(r)}>
                          {r.is_active ? '● On' : '○ Off'}
                        </button>
                      </td>
                      <td>
                        <div className="actions">
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => del(r.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <Modal
          title={editRule ? 'Edit Rule' : 'New Rule'}
          onClose={() => setShowModal(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? <span className="spinner" /> : null} Save
              </button>
            </>
          }
        >
          <div className="form-group">
            <label>Rule Name *</label>
            <input placeholder="e.g. Noted Acknowledgment" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Trigger Type *</label>
              <select value={form.trigger_type} onChange={e => setForm(f => ({ ...f, trigger_type: e.target.value }))}>
                <option value="keyword">Keyword</option>
                <option value="mention">@Mention</option>
                <option value="pattern">Regex Pattern</option>
              </select>
            </div>
            <div className="form-group">
              <label>Applies To</label>
              <select value={form.applies_to} onChange={e => setForm(f => ({ ...f, applies_to: e.target.value }))}>
                <option value="all">All Channels</option>
                <option value="p0">P0 Only</option>
                <option value="p1">P1 Only</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Trigger Value *</label>
            <input placeholder={TRIGGER_HELP[form.trigger_type]} value={form.trigger_value} onChange={e => setForm(f => ({ ...f, trigger_value: e.target.value }))} />
            <div className="text-sm text-muted" style={{ marginTop: 4 }}>{TRIGGER_HELP[form.trigger_type]}</div>
          </div>
          <div className="form-group">
            <label>Response Message *</label>
            <textarea placeholder="What the bot should reply..." value={form.response_template} onChange={e => setForm(f => ({ ...f, response_template: e.target.value }))} />
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={!!form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked ? 1 : 0 }))} style={{ width: 'auto' }} />
              Rule is active
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
