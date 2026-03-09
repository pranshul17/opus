import { useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function pollIntervalLabel(interval: number | null, priority: string): string {
  if (interval != null) return `${interval}m`;
  return priority === 'p0' ? '10m (default)' : '30m (default)';
}

const CHANNEL_TYPES = [
  { value: 'work', label: 'Work — extract tasks & blockers' },
  { value: 'learning', label: 'Learning — extract articles & resources' },
  { value: 'mixed', label: 'Mixed — extract both' },
];

const POLL_PRESETS = [
  { label: '5 min', value: 5 },
  { label: '10 min', value: 10 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
];

export default function Channels() {
  const [channels, setChannels] = useState<any[]>([]);
  const [slackChannels, setSlackChannels] = useState<Array<{ id: string; name: string }>>([]);
  const [showModal, setShowModal] = useState(false);
  const [editChannel, setEditChannel] = useState<any>(null);
  const [form, setForm] = useState({
    slack_channel_id: '',
    slack_channel_name: '',
    priority: 'p1',
    channel_type: 'work',
    digest_enabled: true,
    digest_schedule: '0 9 * * 1',
    history_hours: '',
    poll_interval: '' as string | number,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => api.channels.list().then(setChannels).catch(console.error);

  useEffect(() => {
    load();
    api.slackChannels.list().then(setSlackChannels).catch(() => {});
  }, []);

  const openAdd = () => {
    setEditChannel(null);
    setForm({ slack_channel_id: '', slack_channel_name: '', priority: 'p1', channel_type: 'work', digest_enabled: true, digest_schedule: '0 9 * * 1', history_hours: '', poll_interval: '' });
    setError('');
    setShowModal(true);
  };

  const openEdit = (ch: any) => {
    setEditChannel(ch);
    setForm({
      slack_channel_id: ch.slack_channel_id,
      slack_channel_name: ch.slack_channel_name,
      priority: ch.priority,
      channel_type: ch.channel_type || 'work',
      digest_enabled: !!ch.digest_enabled,
      digest_schedule: ch.digest_schedule,
      history_hours: ch.history_hours != null ? String(ch.history_hours) : '',
      poll_interval: ch.poll_interval != null ? ch.poll_interval : '',
    });
    setError('');
    setShowModal(true);
  };

  const handleSlackChannelSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const ch = slackChannels.find(c => c.id === e.target.value);
    if (ch) setForm(f => ({ ...f, slack_channel_id: ch.id, slack_channel_name: ch.name }));
    else setForm(f => ({ ...f, slack_channel_id: e.target.value }));
  };

  const save = async () => {
    if (!form.slack_channel_id || !form.slack_channel_name) {
      setError('Channel ID and name are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, any> = {
        priority: form.priority,
        channel_type: form.channel_type,
        digest_enabled: form.digest_enabled ? 1 : 0,
        digest_schedule: form.digest_schedule,
        slack_channel_name: form.slack_channel_name,
        history_hours: form.history_hours !== '' ? parseInt(String(form.history_hours)) : null,
        poll_interval: form.poll_interval !== '' ? parseInt(String(form.poll_interval)) : null,
      };
      if (editChannel) {
        await api.channels.update(editChannel.id, payload);
      } else {
        await api.channels.create({ ...payload, slack_channel_id: form.slack_channel_id });
      }
      setShowModal(false);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (ch: any) => {
    await api.channels.update(ch.id, { is_active: ch.is_active ? 0 : 1 });
    load();
  };

  const del = async (ch: any) => {
    if (!confirm(`Remove #${ch.slack_channel_name} from monitoring?`)) return;
    await api.channels.delete(ch.id);
    load();
  };

  const CRON_PRESETS = [
    { label: 'Daily 9am', value: '0 9 * * *' },
    { label: 'Mon 9am', value: '0 9 * * 1' },
    { label: 'Weekdays 9am', value: '0 9 * * 1-5' },
    { label: 'Mon & Thu', value: '0 10 * * 1,4' },
  ];

  const typeLabel = (t: string) => CHANNEL_TYPES.find(x => x.value === t)?.label.split(' — ')[0] || t;

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h2>Channels</h2>
            <p>Configure which Slack channels to monitor (P0 = critical, P1 = standard)</p>
          </div>
          <button className="btn btn-primary" onClick={openAdd}>+ Add Channel</button>
        </div>
      </div>

      <div className="page-body">
        {channels.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="icon">📡</div>
              <p>No channels tracked yet.<br />Add a Slack channel to start monitoring.</p>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={openAdd}>+ Add First Channel</button>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th>Priority</th>
                    <th>Type</th>
                    <th>Poll Interval</th>
                    <th>Last Polled</th>
                    <th>History</th>
                    <th>Digest</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map(ch => (
                    <tr key={ch.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>#{ch.slack_channel_name}</div>
                        <div className="text-sm text-muted font-mono">{ch.slack_channel_id}</div>
                      </td>
                      <td><span className={`badge badge-${ch.priority}`}>{ch.priority.toUpperCase()}</span></td>
                      <td>
                        <span className={`badge type-${ch.channel_type || 'work'}`}>
                          {typeLabel(ch.channel_type || 'work')}
                        </span>
                      </td>
                      <td>
                        <span
                          className="text-sm"
                          style={{
                            color: ch.poll_interval != null ? 'var(--accent)' : 'var(--text-muted)',
                            fontWeight: ch.poll_interval != null ? 600 : 400,
                          }}
                        >
                          {pollIntervalLabel(ch.poll_interval, ch.priority)}
                        </span>
                      </td>
                      <td>
                        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                          {relativeTime(ch.last_polled_at)}
                        </span>
                      </td>
                      <td>
                        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                          {ch.history_hours != null ? `${ch.history_hours}h` : 'Global default'}
                        </span>
                      </td>
                      <td>{ch.digest_enabled ? '✅' : '—'}</td>
                      <td>
                        <button
                          className={`toggle ${ch.is_active ? 'active-toggle' : ''}`}
                          onClick={() => toggleActive(ch)}
                          title={ch.is_active ? 'Pause monitoring' : 'Resume monitoring'}
                        >
                          {ch.is_active ? '● Active' : '○ Paused'}
                        </button>
                      </td>
                      <td>
                        <div className="actions">
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(ch)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => del(ch)}>Remove</button>
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
          title={editChannel ? 'Edit Channel' : 'Add Channel'}
          onClose={() => setShowModal(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? <span className="spinner" /> : null}
                {editChannel ? 'Save Changes' : 'Add Channel'}
              </button>
            </>
          }
        >
          {error && <div className="alert alert-error">{error}</div>}

          {!editChannel && slackChannels.length > 0 && (
            <div className="form-group">
              <label>Select from bot's channels</label>
              <select onChange={handleSlackChannelSelect} value={form.slack_channel_id}>
                <option value="">— pick a channel —</option>
                {slackChannels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
              </select>
              <div className="text-sm text-muted" style={{ marginTop: 4 }}>Or enter manually below</div>
            </div>
          )}

          <div className="form-group">
            <label>Slack Channel ID</label>
            <input
              placeholder="C012AB3CD"
              value={form.slack_channel_id}
              onChange={e => setForm(f => ({ ...f, slack_channel_id: e.target.value }))}
              disabled={!!editChannel}
            />
          </div>

          <div className="form-group">
            <label>Channel Name</label>
            <input
              placeholder="general"
              value={form.slack_channel_name}
              onChange={e => setForm(f => ({ ...f, slack_channel_name: e.target.value }))}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Priority</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                <option value="p0">P0 — Critical</option>
                <option value="p1">P1 — Standard</option>
              </select>
            </div>
            <div className="form-group">
              <label>Channel Type</label>
              <select value={form.channel_type} onChange={e => setForm(f => ({ ...f, channel_type: e.target.value }))}>
                {CHANNEL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          {/* ── Poll Interval ────────────────────────────────────────────────── */}
          <div className="form-group">
            <label>Poll Interval</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <button
                className={`btn btn-sm ${form.poll_interval === '' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setForm(f => ({ ...f, poll_interval: '' }))}
              >
                Default ({form.priority === 'p0' ? '10 min' : '30 min'})
              </button>
              {POLL_PRESETS.map(p => (
                <button
                  key={p.value}
                  className={`btn btn-sm ${form.poll_interval === p.value ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setForm(f => ({ ...f, poll_interval: p.value }))}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              type="number"
              placeholder={`Leave blank to use default (${form.priority === 'p0' ? '10' : '30'} min)`}
              value={form.poll_interval}
              onChange={e => setForm(f => ({ ...f, poll_interval: e.target.value }))}
              min="1"
              max="1440"
            />
            <div className="text-sm text-muted" style={{ marginTop: 4 }}>
              How often to poll for new messages. Leave blank to use priority default (P0 = 10 min, P1 = 30 min).
            </div>
          </div>

          {/* ── History Window ───────────────────────────────────────────────── */}
          <div className="form-group">
            <label>History Window (hours)</label>
            <input
              type="number"
              placeholder="Leave blank to use global default"
              value={form.history_hours}
              onChange={e => setForm(f => ({ ...f, history_hours: e.target.value }))}
              min="1"
              max="168"
            />
            <div className="text-sm text-muted" style={{ marginTop: 4 }}>
              How far back to look for messages on each poll. Blank = use server default (HISTORY_HOURS env var).
            </div>
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={form.digest_enabled}
                onChange={e => setForm(f => ({ ...f, digest_enabled: e.target.checked }))}
                style={{ width: 'auto' }}
              />
              Enable scheduled digests
            </label>
          </div>

          {form.digest_enabled && (
            <div className="form-group">
              <label>Digest Schedule (cron)</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {CRON_PRESETS.map(p => (
                  <button
                    key={p.value}
                    className={`btn btn-sm ${form.digest_schedule === p.value ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setForm(f => ({ ...f, digest_schedule: p.value }))}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <input
                placeholder="0 9 * * 1"
                value={form.digest_schedule}
                onChange={e => setForm(f => ({ ...f, digest_schedule: e.target.value }))}
              />
              <div className="text-sm text-muted" style={{ marginTop: 4 }}>Cron expression for when to post the digest</div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
