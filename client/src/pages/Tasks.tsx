import { useEffect, useState, useMemo, useRef } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';

const STATUS_OPTIONS = ['open', 'in_progress', 'completed', 'cancelled'];
const PRIORITY_OPTIONS = ['high', 'medium', 'low'];
const CATEGORY_OPTIONS = ['action_item', 'decision', 'question', 'fyi'];

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string; icon: string }> = {
  open:        { label: 'Open',        color: 'var(--primary-hover)', bg: 'var(--primary-dim)',  border: 'rgba(99,102,241,0.3)',  icon: '○' },
  in_progress: { label: 'In Progress', color: 'var(--warning)',       bg: 'var(--warning-dim)',  border: 'rgba(245,158,11,0.3)',  icon: '◑' },
  completed:   { label: 'Completed',   color: 'var(--success)',       bg: 'var(--success-dim)',  border: 'rgba(34,197,94,0.3)',   icon: '●' },
  cancelled:   { label: 'Cancelled',   color: 'var(--text-muted)',    bg: 'rgba(100,100,100,0.1)', border: 'var(--border)',       icon: '✕' },
};

const PRIORITY_META: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  high:   { label: 'High',   color: '#f87171', bg: 'rgba(239,68,68,0.12)',   dot: '🔴' },
  medium: { label: 'Medium', color: '#fbbf24', bg: 'rgba(245,158,11,0.12)',  dot: '🟡' },
  low:    { label: 'Low',    color: '#4ade80', bg: 'rgba(34,197,94,0.1)',    dot: '🟢' },
};

const UPDATE_TYPE_META: Record<string, { icon: string; color: string }> = {
  comment:       { icon: '💬', color: 'var(--text-muted)' },
  status_change: { icon: '🔄', color: 'var(--primary-hover)' },
  blocker:       { icon: '🚫', color: 'var(--danger)' },
  unblocked:     { icon: '✅', color: 'var(--success)' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function isOverdue(task: any) {
  return task.due_date && task.status !== 'completed' && task.status !== 'cancelled' && new Date(task.due_date) < new Date();
}

function formatDate(d: string) {
  if (!d) return null;
  const date = new Date(d + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function sourceBadge(type: string) {
  const m: Record<string, [string, string]> = {
    slack_batch: ['🤖', 'Slack'],
    bot_mention: ['@', 'Mention'],
    template: ['📋', 'Template'],
    manual: ['✏️', 'Manual'],
  };
  const [icon, label] = m[type] || ['✏️', 'Manual'];
  return <span className={`source-badge source-${type === 'slack_batch' ? 'slack' : type === 'bot_mention' ? 'mention' : type === 'template' ? 'template' : 'manual'}`}>{icon} {label}</span>;
}

// ─── Task Detail Panel ────────────────────────────────────────────────────────

function TaskDetailPanel({ task, channels, onClose, onUpdate, onDelete }: {
  task: any; channels: any[];
  onClose: () => void;
  onUpdate: (id: number, data: any) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [updates, setUpdates] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [editingBlocker, setEditingBlocker] = useState(false);
  const [blockerText, setBlockerText] = useState(task.blocker || '');
  const [localTask, setLocalTask] = useState(task);
  const [saving, setSaving] = useState<string | null>(null);
  const updatesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setLocalTask(task); setBlockerText(task.blocker || ''); }, [task]);

  const loadUpdates = () => api.tasks.getUpdates(task.id).then(setUpdates).catch(console.error);
  useEffect(() => { loadUpdates(); }, [task.id]);
  useEffect(() => { updatesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [updates]);

  const channelName = (id: string) => channels.find(c => c.slack_channel_id === id)?.slack_channel_name || id;

  const save = async (field: string, value: any) => {
    setSaving(field);
    await onUpdate(task.id, { [field]: value });
    setLocalTask((t: any) => ({ ...t, [field]: value }));
    setSaving(null);
    if (field === 'status' || field === 'blocker') loadUpdates();
  };

  const postComment = async () => {
    if (!newComment.trim()) return;
    setPostingComment(true);
    await api.tasks.addUpdate(task.id, { content: newComment.trim(), author: newAuthor.trim() || undefined, update_type: 'comment' });
    setNewComment('');
    await loadUpdates();
    setPostingComment(false);
  };

  const deleteUpdate = async (uid: number) => {
    await api.tasks.deleteUpdate(uid);
    loadUpdates();
  };

  const saveBlocker = async () => {
    await save('blocker', blockerText.trim() || null);
    setEditingBlocker(false);
  };

  const clearBlocker = async () => {
    setBlockerText('');
    await save('blocker', null);
    setEditingBlocker(false);
  };

  const sm = STATUS_META[localTask.status] || STATUS_META.open;
  const pm = PRIORITY_META[localTask.priority || 'medium'];
  const overdue = isOverdue(localTask);

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, backdropFilter: 'blur(2px)' }} />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 520,
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        zIndex: 201, display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
        animation: 'slideIn 0.2s ease',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'monospace', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px' }}>
                #{task.id}
              </span>
              {sourceBadge(task.source_type || 'manual')}
              {task.slack_channel_id && (
                <span style={{ fontSize: 11, color: 'var(--text-dim)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px' }}>
                  #{channelName(task.slack_channel_id)}
                </span>
              )}
            </div>
            <div
              contentEditable
              suppressContentEditableWarning
              onBlur={e => { const v = (e.target as HTMLElement).innerText.trim(); if (v && v !== localTask.title) save('title', v); }}
              style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', outline: 'none', lineHeight: 1.4, cursor: 'text', borderRadius: 4, padding: '2px 4px', margin: '-2px -4px' }}
              onFocus={e => (e.target as HTMLElement).style.background = 'var(--surface-2)'}
              onBlurCapture={e => (e.target as HTMLElement).style.background = 'transparent'}
            >
              {localTask.title}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, padding: 4, flexShrink: 0 }}>✕</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Status + Priority row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {/* Status */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Status</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {STATUS_OPTIONS.map(s => {
                  const m = STATUS_META[s];
                  const active = localTask.status === s;
                  return (
                    <button key={s} onClick={() => save('status', s)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, border: `1px solid ${active ? m.border : 'var(--border)'}`, background: active ? m.bg : 'transparent', cursor: 'pointer', transition: 'all 0.12s', textAlign: 'left' }}
                    >
                      <span style={{ color: m.color, fontSize: 13 }}>{m.icon}</span>
                      <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? m.color : 'var(--text-muted)' }}>{m.label}</span>
                      {saving === 'status' && active && <span className="spinner" style={{ width: 10, height: 10, marginLeft: 'auto' }} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Priority */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Priority</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {PRIORITY_OPTIONS.map(p => {
                  const m = PRIORITY_META[p];
                  const active = (localTask.priority || 'medium') === p;
                  return (
                    <button key={p} onClick={() => save('priority', p)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, border: `1px solid ${active ? 'rgba(255,255,255,0.15)' : 'var(--border)'}`, background: active ? m.bg : 'transparent', cursor: 'pointer', transition: 'all 0.12s' }}
                    >
                      <span style={{ fontSize: 11 }}>{m.dot}</span>
                      <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? m.color : 'var(--text-muted)' }}>{m.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Category */}
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Category</div>
                <select value={localTask.task_category || 'action_item'} onChange={e => save('task_category', e.target.value)}
                  style={{ width: '100%', fontSize: 12, padding: '6px 8px' }}>
                  {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Assignee + Due date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Assignee</div>
              <input defaultValue={localTask.assignee || ''} placeholder="username"
                onBlur={e => { const v = e.target.value.trim() || null; if (v !== localTask.assignee) save('assignee', v); }}
                style={{ fontSize: 13 }} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                Due Date {overdue && <span style={{ color: 'var(--danger)', marginLeft: 4 }}>⚠️ Overdue</span>}
              </div>
              <input type="date" defaultValue={localTask.due_date || ''}
                onChange={e => save('due_date', e.target.value || null)}
                style={{ fontSize: 13, borderColor: overdue ? 'var(--danger)' : 'var(--border)' }} />
            </div>
          </div>

          {/* Description */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Description</div>
            <textarea defaultValue={localTask.description || ''} placeholder="Add a description..."
              rows={3}
              onBlur={e => { const v = e.target.value.trim() || null; if (v !== localTask.description) save('description', v); }}
              style={{ fontSize: 13, resize: 'vertical' }} />
          </div>

          {/* Blocker */}
          <div style={{ borderRadius: 10, border: `1px solid ${localTask.blocker ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`, background: localTask.blocker ? 'rgba(239,68,68,0.06)' : 'var(--surface-2)', padding: '12px 14px', transition: 'all 0.2s' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: localTask.blocker || editingBlocker ? 8 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 14 }}>🚫</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: localTask.blocker ? 'var(--danger)' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {localTask.blocker ? 'Blocked' : 'Blocker'}
                </span>
              </div>
              {!editingBlocker && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setEditingBlocker(true)}
                    style={{ fontSize: 11, padding: '3px 9px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    {localTask.blocker ? 'Edit' : '+ Add'}
                  </button>
                  {localTask.blocker && (
                    <button onClick={clearBlocker}
                      style={{ fontSize: 11, padding: '3px 9px', borderRadius: 5, border: '1px solid rgba(34,197,94,0.3)', background: 'var(--success-dim)', color: 'var(--success)', cursor: 'pointer' }}>
                      Resolve ✓
                    </button>
                  )}
                </div>
              )}
            </div>

            {localTask.blocker && !editingBlocker && (
              <p style={{ fontSize: 13, color: '#f87171', margin: 0, lineHeight: 1.5 }}>{localTask.blocker}</p>
            )}

            {editingBlocker && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <textarea value={blockerText} onChange={e => setBlockerText(e.target.value)}
                  placeholder="Describe the blocker..." rows={2} autoFocus
                  style={{ flex: 1, fontSize: 13, resize: 'none', borderColor: 'rgba(239,68,68,0.4)', background: 'var(--surface)' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <button onClick={saveBlocker}
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 5, border: '1px solid rgba(239,68,68,0.4)', background: 'var(--danger-dim)', color: 'var(--danger)', cursor: 'pointer' }}>
                    Save
                  </button>
                  <button onClick={() => { setEditingBlocker(false); setBlockerText(localTask.blocker || ''); }}
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Updates / Activity */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Activity & Updates</span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none' }}>{updates.length} entries</span>
            </div>

            {updates.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', padding: '16px 0' }}>No activity yet</div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {updates.map(u => {
                const um = UPDATE_TYPE_META[u.update_type] || UPDATE_TYPE_META.comment;
                const isComment = u.update_type === 'comment';
                return (
                  <div key={u.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 8, background: isComment ? 'var(--surface-2)' : 'transparent', border: isComment ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{um.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {u.author && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary-hover)', marginRight: 5 }}>@{u.author}</span>}
                      <span style={{ fontSize: 12, color: isComment ? 'var(--text)' : um.color, lineHeight: 1.5 }}>{u.content}</span>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3 }}>{timeAgo(u.created_at)}</div>
                    </div>
                    {isComment && (
                      <button onClick={() => deleteUpdate(u.id)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 11, padding: 2, flexShrink: 0 }} title="Delete">✕</button>
                    )}
                  </div>
                );
              })}
              <div ref={updatesEndRef} />
            </div>
          </div>
        </div>

        {/* Add comment footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={newAuthor} onChange={e => setNewAuthor(e.target.value)} placeholder="Your name (optional)"
              style={{ width: 140, fontSize: 12, flexShrink: 0 }} />
            <textarea value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Add an update or comment..."
              rows={2} style={{ flex: 1, fontSize: 13, resize: 'none' }}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); postComment(); } }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>⌘+Enter to post</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => onDelete(task.id)}
                style={{ fontSize: 11, padding: '5px 10px', borderRadius: 5, border: '1px solid rgba(239,68,68,0.3)', background: 'var(--danger-dim)', color: 'var(--danger)', cursor: 'pointer' }}>
                🗑 Delete Task
              </button>
              <button onClick={postComment} disabled={!newComment.trim() || postingComment}
                style={{ fontSize: 12, padding: '5px 14px', borderRadius: 5, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', opacity: !newComment.trim() ? 0.5 : 1 }}>
                {postingComment ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Post'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
    </>
  );
}

// ─── Board column card ────────────────────────────────────────────────────────

function BoardCard({ task, channelName, onClick, onQuickStatus }: {
  task: any; channelName: (id: string) => string;
  onClick: () => void; onQuickStatus: (t: any, s: string) => void;
}) {
  const pm = PRIORITY_META[task.priority || 'medium'];
  const overdue = isOverdue(task);
  const hasBlocker = !!task.blocker;

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface-2)', border: `1px solid ${hasBlocker ? 'rgba(239,68,68,0.5)' : overdue ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
        borderRadius: 9, padding: '11px 13px', cursor: 'pointer',
        transition: 'border-color 0.15s, transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
    >
      {/* Blocker banner */}
      {hasBlocker && (
        <div style={{ fontSize: 11, color: '#f87171', background: 'rgba(239,68,68,0.1)', borderRadius: 4, padding: '3px 7px', marginBottom: 7, display: 'flex', alignItems: 'center', gap: 4 }}>
          🚫 <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{task.blocker}</span>
        </div>
      )}

      <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.4, marginBottom: 7, display: 'flex', gap: 5 }}>
        {overdue && <span style={{ color: 'var(--danger)', flexShrink: 0 }}>⚠️</span>}
        <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{task.title}</span>
      </div>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: pm.color, background: pm.bg, borderRadius: 4, padding: '1px 6px' }}>{pm.dot} {pm.label}</span>
        {task.task_category && task.task_category !== 'action_item' && (
          <span className={`cat-badge cat-${task.task_category}`}>{task.task_category.replace('_', ' ')}</span>
        )}
        {task.slack_channel_id && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px' }}>#{channelName(task.slack_channel_id)}</span>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {task.assignee
          ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>@{task.assignee}</span>
          : <span />}
        {task.due_date && (
          <span style={{ fontSize: 11, color: overdue ? 'var(--danger)' : 'var(--text-dim)', fontWeight: overdue ? 600 : 400 }}>📅 {formatDate(task.due_date)}</span>
        )}
      </div>
    </div>
  );
}

// ─── Main Tasks Page ──────────────────────────────────────────────────────────

export default function Tasks() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterChannel, setFilterChannel] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterBlocker, setFilterBlocker] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('created:desc');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [view, setView] = useState<'table' | 'board'>('table');
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addForm, setAddForm] = useState({ title: '', description: '', assignee: '', due_date: '', status: 'open', priority: 'medium', slack_channel_id: '' });

  const load = () => {
    const params: Record<string, string> = {};
    if (filterStatus) params.status = filterStatus;
    if (filterChannel) params.slack_channel_id = filterChannel;
    if (filterPriority) params.priority = filterPriority;
    if (filterSource) params.source_type = filterSource;
    if (sort) params.sort = sort;
    api.tasks.list(params).then(data => {
      setTasks(data);
      // Refresh selected task if open
      if (selectedTask) {
        const refreshed = data.find((t: any) => t.id === selectedTask.id);
        if (refreshed) setSelectedTask(refreshed);
      }
    }).catch(console.error);
  };

  useEffect(() => { load(); }, [filterStatus, filterChannel, filterPriority, filterSource, sort]);
  useEffect(() => { api.channels.list().then(setChannels); }, []);

  const filtered = useMemo(() => {
    let result = tasks;
    if (filterBlocker) result = result.filter(t => !!t.blocker);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(t => t.title?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q));
    }
    return result;
  }, [tasks, search, filterBlocker]);

  const stats = useMemo(() => ({
    total: filtered.length,
    open: filtered.filter(t => t.status === 'open').length,
    in_progress: filtered.filter(t => t.status === 'in_progress').length,
    completed: filtered.filter(t => t.status === 'completed').length,
    blocked: filtered.filter(t => !!t.blocker).length,
    overdue: filtered.filter(t => isOverdue(t)).length,
  }), [filtered]);

  const channelName = (id: string) => channels.find(c => c.slack_channel_id === id)?.slack_channel_name || id;

  const allSelected = filtered.length > 0 && filtered.every(t => selected.has(t.id));
  const toggleAll = () => { if (allSelected) setSelected(new Set()); else setSelected(new Set(filtered.map(t => t.id))); };
  const toggleOne = (id: number) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const bulkAction = async (action: string, status?: string) => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (action === 'delete' && !confirm(`Delete ${ids.length} task(s)?`)) return;
    await api.tasks.bulk(ids, action, status);
    setSelected(new Set());
    load();
  };

  const updateTask = async (id: number, data: any) => {
    await api.tasks.update(id, data);
    load();
  };

  const deleteTask = async (id: number) => {
    if (!confirm('Delete this task?')) return;
    await api.tasks.delete(id);
    setSelectedTask(null);
    load();
  };

  const quickStatus = async (task: any, status: string) => {
    await api.tasks.update(task.id, { status });
    load();
  };

  const saveAdd = async () => {
    if (!addForm.title) return alert('Title is required');
    setSaving(true);
    try {
      await api.tasks.create(addForm);
      setShowAddModal(false);
      setAddForm({ title: '', description: '', assignee: '', due_date: '', status: 'open', priority: 'medium', slack_channel_id: '' });
      load();
    } catch (e: any) { alert(e.message); }
    setSaving(false);
  };

  const STATUS_COLUMNS = [
    { key: 'open', label: 'Open', sm: STATUS_META.open },
    { key: 'in_progress', label: 'In Progress', sm: STATUS_META.in_progress },
    { key: 'completed', label: 'Completed', sm: STATUS_META.completed },
    { key: 'cancelled', label: 'Cancelled', sm: STATUS_META.cancelled },
  ];

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div><h2>Tasks</h2><p>Manage tasks extracted from Slack channels</p></div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {/* View toggle */}
            <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
              {(['table', 'board'] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  style={{ padding: '6px 14px', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer', background: view === v ? 'var(--primary)' : 'transparent', color: view === v ? '#fff' : 'var(--text-muted)', transition: 'all 0.15s' }}>
                  {v === 'table' ? '☰ Table' : '⬛ Board'}
                </button>
              ))}
            </div>
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>+ New Task</button>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Stats Bar */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Total', value: stats.total, color: 'var(--text)', bg: 'var(--surface)', border: 'var(--border)', onClick: undefined },
            { label: 'Open', value: stats.open, color: STATUS_META.open.color, bg: STATUS_META.open.bg, border: STATUS_META.open.border, onClick: () => setFilterStatus('open') },
            { label: 'In Progress', value: stats.in_progress, color: STATUS_META.in_progress.color, bg: STATUS_META.in_progress.bg, border: STATUS_META.in_progress.border, onClick: () => setFilterStatus('in_progress') },
            { label: 'Completed', value: stats.completed, color: STATUS_META.completed.color, bg: STATUS_META.completed.bg, border: STATUS_META.completed.border, onClick: () => setFilterStatus('completed') },
            { label: '🚫 Blocked', value: stats.blocked, color: 'var(--danger)', bg: 'var(--danger-dim)', border: 'rgba(239,68,68,0.3)', onClick: () => setFilterBlocker(b => !b) },
            { label: '⚠️ Overdue', value: stats.overdue, color: '#f97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.3)', onClick: undefined },
          ].map(s => (
            <div key={s.label} onClick={s.onClick}
              style={{ flex: 1, minWidth: 90, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, padding: '10px 14px', cursor: s.onClick ? 'pointer' : 'default', transition: 'opacity 0.15s' }}
              onMouseEnter={e => s.onClick && ((e.currentTarget as HTMLElement).style.opacity = '0.85')}
              onMouseLeave={e => s.onClick && ((e.currentTarget as HTMLElement).style.opacity = '1')}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="card mb-4" style={{ padding: '12px 16px' }}>
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <input className="search-input" placeholder="🔍 Search tasks..." value={search} onChange={e => setSearch(e.target.value)} />
            <select className="filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
            <select className="filter-select" value={filterChannel} onChange={e => setFilterChannel(e.target.value)}>
              <option value="">All Channels</option>
              {channels.map(c => <option key={c.slack_channel_id} value={c.slack_channel_id}>#{c.slack_channel_name}</option>)}
            </select>
            <select className="filter-select" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
              <option value="">All Priorities</option>
              {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className="filter-select" value={sort} onChange={e => setSort(e.target.value)}>
              <option value="created:desc">Newest</option>
              <option value="created:asc">Oldest</option>
              <option value="due_date:asc">Due ↑</option>
              <option value="priority:desc">Priority</option>
            </select>
            <button
              onClick={() => setFilterBlocker(b => !b)}
              style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, border: `1px solid ${filterBlocker ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`, background: filterBlocker ? 'var(--danger-dim)' : 'transparent', color: filterBlocker ? 'var(--danger)' : 'var(--text-muted)', cursor: 'pointer' }}>
              🚫 Blocked
            </button>
            {(filterStatus || filterChannel || filterPriority || filterSource || search || filterBlocker) && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setFilterStatus(''); setFilterChannel(''); setFilterPriority(''); setFilterSource(''); setSearch(''); setFilterBlocker(false); setSort('created:desc'); }}>✕ Clear</button>
            )}
            <div style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 12 }}>{filtered.length} tasks</div>
          </div>
        </div>

        {/* Bulk bar */}
        {selected.size > 0 && (
          <div className="bulk-bar" style={{ marginBottom: 12 }}>
            <span style={{ fontWeight: 500 }}>{selected.size} selected</span>
            <button className="btn btn-sm btn-secondary" onClick={() => bulkAction('status', 'in_progress')}>▶ In Progress</button>
            <button className="btn btn-sm btn-secondary" onClick={() => bulkAction('status', 'completed')}>✅ Complete</button>
            <button className="btn btn-sm btn-secondary" onClick={() => bulkAction('status', 'cancelled')}>✕ Cancel</button>
            <button className="btn btn-sm btn-danger" onClick={() => bulkAction('delete')}>🗑 Delete</button>
            <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set())}>Deselect</button>
          </div>
        )}

        {/* Empty state */}
        {filtered.length === 0 ? (
          <div className="card"><div className="empty-state"><div className="icon">✅</div><p>No tasks found. Try polling channels or adjusting filters.</p></div></div>
        ) : view === 'table' ? (
          /* ── TABLE VIEW ── */
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 36, paddingLeft: 16 }}><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
                    <th>Task</th>
                    <th style={{ width: 110 }}>Status</th>
                    <th style={{ width: 90 }}>Priority</th>
                    <th style={{ width: 120 }}>Channel</th>
                    <th style={{ width: 110 }}>Assignee</th>
                    <th style={{ width: 100 }}>Due</th>
                    <th style={{ width: 70 }}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(t => {
                    const sm = STATUS_META[t.status] || STATUS_META.open;
                    const pm = PRIORITY_META[t.priority || 'medium'];
                    const overdue = isOverdue(t);
                    const isSelected = selectedTask?.id === t.id;
                    return (
                      <tr key={t.id}
                        onClick={() => setSelectedTask(t)}
                        style={{ cursor: 'pointer', background: isSelected ? 'rgba(99,102,241,0.06)' : selected.has(t.id) ? 'var(--surface-2)' : 'transparent' }}
                      >
                        <td style={{ paddingLeft: 16 }} onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleOne(t.id)} />
                        </td>
                        <td style={{ maxWidth: 300 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                            {t.blocker && <span title={t.blocker} style={{ color: 'var(--danger)', flexShrink: 0, fontSize: 13, marginTop: 1 }}>🚫</span>}
                            {overdue && !t.blocker && <span style={{ color: 'var(--danger)', flexShrink: 0, fontSize: 12, marginTop: 1 }}>⚠️</span>}
                            <div>
                              <div style={{ fontWeight: 500, fontSize: 13 }}>{t.title}</div>
                              {t.blocker && <div style={{ fontSize: 11, color: '#f87171', marginTop: 2 }}>🚫 {t.blocker}</div>}
                              {t.description && !t.blocker && (
                                <div className="text-sm text-muted" style={{ marginTop: 2, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.description}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <select value={t.status} onChange={e => { e.stopPropagation(); quickStatus(t, e.target.value); }}
                            style={{ fontSize: 11, padding: '3px 6px', color: sm.color, background: sm.bg, border: `1px solid ${sm.border}`, borderRadius: 5, fontWeight: 600 }}>
                            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                          </select>
                        </td>
                        <td><span style={{ fontSize: 11, fontWeight: 600, color: pm.color }}>{pm.dot} {pm.label}</span></td>
                        <td><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.slack_channel_id ? `#${channelName(t.slack_channel_id)}` : '—'}</span></td>
                        <td>{t.assignee ? <span style={{ fontSize: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px' }}>@{t.assignee}</span> : <span className="text-muted">—</span>}</td>
                        <td><span style={{ fontSize: 12, color: overdue ? 'var(--danger)' : 'var(--text-muted)', fontWeight: overdue ? 600 : 400 }}>{t.due_date ? formatDate(t.due_date) : '—'}</span></td>
                        <td>{sourceBadge(t.source_type || 'manual')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ── BOARD VIEW ── */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, alignItems: 'start' }}>
            {STATUS_COLUMNS.map(col => {
              const colTasks = filtered.filter(t => t.status === col.key);
              return (
                <div key={col.key} style={{ background: 'var(--surface)', border: `1px solid ${col.sm.border}`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', background: col.sm.bg, borderBottom: `1px solid ${col.sm.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: col.sm.color }}>{col.sm.icon} {col.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: col.sm.color, background: col.sm.bg, border: `1px solid ${col.sm.border}`, borderRadius: 10, padding: '1px 8px' }}>{colTasks.length}</span>
                  </div>
                  <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 60 }}>
                    {colTasks.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-dim)', fontSize: 12 }}>Empty</div>
                    ) : colTasks.map(t => (
                      <BoardCard key={t.id} task={t} channelName={channelName} onClick={() => setSelectedTask(t)} onQuickStatus={quickStatus} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Task Detail Panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          channels={channels}
          onClose={() => setSelectedTask(null)}
          onUpdate={updateTask}
          onDelete={deleteTask}
        />
      )}

      {/* Add Task Modal */}
      {showAddModal && (
        <Modal title="New Task" onClose={() => setShowAddModal(false)}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveAdd} disabled={saving}>{saving ? <span className="spinner" /> : 'Create'}</button>
          </>}>
          <div className="form-group"><label>Title *</label><input placeholder="Task title" value={addForm.title} onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))} /></div>
          <div className="form-group"><label>Description</label><textarea placeholder="Optional details..." value={addForm.description} onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group"><label>Assignee</label><input placeholder="username" value={addForm.assignee} onChange={e => setAddForm(f => ({ ...f, assignee: e.target.value }))} /></div>
            <div className="form-group"><label>Due Date</label><input type="date" value={addForm.due_date} onChange={e => setAddForm(f => ({ ...f, due_date: e.target.value }))} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Channel</label>
              <select value={addForm.slack_channel_id} onChange={e => setAddForm(f => ({ ...f, slack_channel_id: e.target.value }))}>
                <option value="">None</option>
                {channels.map(c => <option key={c.slack_channel_id} value={c.slack_channel_id}>#{c.slack_channel_name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={addForm.status} onChange={e => setAddForm(f => ({ ...f, status: e.target.value }))}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Priority</label>
              <select value={addForm.priority} onChange={e => setAddForm(f => ({ ...f, priority: e.target.value }))}>
                {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
