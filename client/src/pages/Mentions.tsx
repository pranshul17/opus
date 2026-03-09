import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

interface Mention {
  id: number;
  slack_channel_id: string;
  channel_name: string;
  sender_id: string | null;
  message_text: string;
  ts: string;
  thread_ts: string | null;
  summary: string | null;
  relevance: 'high' | 'medium';
  is_read: number;
  linked_task_id: number | null;
  created_at: string;
}

function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Mentions() {
  const navigate = useNavigate();
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'tasks' | 'fyi'>('unread');
  const [channelFilter, setChannelFilter] = useState('');
  const [markingAll, setMarkingAll] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    api.mentions.list()
      .then(setMentions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const unreadCount = mentions.filter(m => !m.is_read).length;

  const channels = Array.from(new Set(mentions.map(m => m.channel_name))).sort();

  const filtered = mentions.filter(m => {
    if (channelFilter && m.channel_name !== channelFilter) return false;
    if (filter === 'unread') return !m.is_read;
    if (filter === 'tasks') return m.linked_task_id !== null;
    if (filter === 'fyi') return m.linked_task_id === null;
    return true;
  });

  const markRead = async (id: number) => {
    await api.mentions.markRead(id);
    setMentions(prev => prev.map(m => m.id === id ? { ...m, is_read: 1 } : m));
  };

  const deleteMention = async (id: number) => {
    await api.mentions.delete(id);
    setMentions(prev => prev.filter(m => m.id !== id));
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await api.mentions.markAllRead();
      setMentions(prev => prev.map(m => ({ ...m, is_read: 1 })));
    } finally {
      setMarkingAll(false);
    }
  };

  const toggleExpanded = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const FILTERS: { key: typeof filter; label: string }[] = [
    { key: 'unread', label: `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}` },
    { key: 'all', label: 'All' },
    { key: 'tasks', label: '✅ Created Tasks' },
    { key: 'fyi', label: '📌 Logged FYI' },
  ];

  return (
    <div className="mentions-page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>
            @Mentions
            {unreadCount > 0 && <span className="unread-badge" style={{ marginLeft: 10 }}>{unreadCount}</span>}
          </h1>
          <p className="text-muted">
            Slack messages that @mentioned you — AI-classified into tasks or FYIs
          </p>
        </div>
        <div className="header-actions">
          {unreadCount > 0 && (
            <button
              className="btn btn-ghost"
              onClick={markAllRead}
              disabled={markingAll}
            >
              {markingAll ? 'Marking…' : '✓ Mark all read'}
            </button>
          )}
          <button className="btn btn-ghost" onClick={load}>↻ Refresh</button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mentions-filters">
        <div className="filter-tabs">
          {FILTERS.map(f => (
            <button
              key={f.key}
              className={`filter-tab ${filter === f.key ? 'active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        {channels.length > 1 && (
          <select
            className="channel-select"
            value={channelFilter}
            onChange={e => setChannelFilter(e.target.value)}
          >
            <option value="">All channels</option>
            {channels.map(c => (
              <option key={c} value={c}>#{c}</option>
            ))}
          </select>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <div className="page-loading">Loading mentions…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🔔</div>
          <h3>{filter === 'unread' ? 'All caught up!' : 'No mentions yet'}</h3>
          <p className="text-muted">
            {filter === 'unread'
              ? 'No unread @mentions. Switch to "All" to see history.'
              : 'Mentions appear here when someone @-tags you in a tracked Slack channel.'}
          </p>
          <p className="text-muted" style={{ marginTop: 8, fontSize: '0.8rem' }}>
            💡 Add your personal context in{' '}
            <button
              className="link-btn"
              onClick={() => navigate('/settings')}
            >
              Settings → AI
            </button>{' '}
            to help Claude decide what's a task vs. an FYI.
          </p>
        </div>
      ) : (
        <div className="mentions-list">
          {filtered.map(m => {
            const isExpanded = expanded.has(m.id);
            const isTask = m.linked_task_id !== null;

            return (
              <div
                key={m.id}
                className={`mention-card ${!m.is_read ? 'unread' : ''} ${m.relevance === 'high' ? 'high-relevance' : ''}`}
                onClick={() => { toggleExpanded(m.id); if (!m.is_read) markRead(m.id); }}
              >
                {/* Top row */}
                <div className="mention-top">
                  <div className="mention-meta">
                    <span className={`relevance-badge ${m.relevance}`}>
                      {m.relevance === 'high' ? '🔴 HIGH' : '🟡 MED'}
                    </span>
                    <span className="channel-tag">#{m.channel_name}</span>
                    {m.sender_id && (
                      <span className="sender-tag">from {`<@${m.sender_id}>`}</span>
                    )}
                  </div>
                  <div className="mention-right">
                    <span className="mention-time">{timeAgo(m.created_at)}</span>
                    {!m.is_read && <span className="unread-dot" />}
                  </div>
                </div>

                {/* Classification badge */}
                <div className="mention-classification">
                  {isTask ? (
                    <span className="class-badge task">
                      ✅ Task #{m.linked_task_id} created
                    </span>
                  ) : (
                    <span className="class-badge fyi">
                      📌 Logged FYI
                    </span>
                  )}
                </div>

                {/* Summary / message */}
                {m.summary && (
                  <div className="mention-summary">{m.summary}</div>
                )}
                <div className={`mention-message ${isExpanded ? 'expanded' : 'truncated'}`}>
                  {m.message_text}
                </div>
                {m.message_text.length > 120 && (
                  <button
                    className="expand-btn"
                    onClick={e => { e.stopPropagation(); toggleExpanded(m.id); }}
                  >
                    {isExpanded ? '▲ show less' : '▼ show full message'}
                  </button>
                )}

                {/* Actions */}
                <div className="mention-actions" onClick={e => e.stopPropagation()}>
                  {isTask && (
                    <button
                      className="btn-sm btn-ghost"
                      onClick={() => navigate('/tasks')}
                    >
                      View Task →
                    </button>
                  )}
                  {!m.is_read && (
                    <button className="btn-sm btn-ghost" onClick={() => markRead(m.id)}>
                      Mark read
                    </button>
                  )}
                  <button
                    className="btn-sm btn-ghost btn-danger"
                    onClick={() => deleteMention(m.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
