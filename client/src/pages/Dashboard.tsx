import { useEffect, useState } from 'react';
import { api } from '../api/client';

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never polled';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [summaries, setSummaries] = useState<any[]>([]);
  const [recentTasks, setRecentTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pollingChannels, setPollingChannels] = useState<Set<number>>(new Set());

  useEffect(() => {
    Promise.all([
      api.tasks.stats(),
      api.channels.list(),
      api.channels.allSummaries(),
      api.tasks.list({ sort: 'created:desc' }),
    ]).then(([s, c, sm, t]) => {
      setStats(s);
      setChannels(c);
      setSummaries(sm);
      setRecentTasks(t.slice(0, 8));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const p0 = channels.filter(c => c.priority === 'p0' && c.is_active);
  const p1 = channels.filter(c => c.priority === 'p1' && c.is_active);

  const getSummary = (slackChannelId: string) =>
    summaries.find(s => s.slack_channel_id === slackChannelId);

  const handlePollNow = async () => {
    try {
      await api.digest.poll();
      alert('Poll started! Check back in a minute for new tasks and links.');
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handlePollChannel = async (channelId: number, channelName: string) => {
    if (pollingChannels.has(channelId)) return;
    setPollingChannels(prev => new Set(prev).add(channelId));
    try {
      await api.channels.poll(channelId);
      alert(`Poll started for #${channelName}! Check back in a moment.`);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setPollingChannels(prev => {
        const next = new Set(prev);
        next.delete(channelId);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <h2>Dashboard</h2>
          <p>Overview of all monitored channels and tasks</p>
        </div>
        <div className="page-body" style={{ textAlign: 'center', paddingTop: 48 }}>
          <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h2>Dashboard</h2>
            <p>Overview of monitored channels and tasks</p>
          </div>
          <button className="btn btn-secondary" onClick={handlePollNow}>
            🔄 Poll Now
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* Stats row */}
        <div className="stat-grid">
          <div className="stat-card p0">
            <div className="label">P0 Channels</div>
            <div className="value">{p0.length}</div>
            <div className="sub">Critical monitoring</div>
          </div>
          <div className="stat-card p1">
            <div className="label">P1 Channels</div>
            <div className="value">{p1.length}</div>
            <div className="sub">Standard monitoring</div>
          </div>
          <div className="stat-card primary">
            <div className="label">Open Tasks</div>
            <div className="value">{stats?.open ?? 0}</div>
            <div className="sub">{stats?.in_progress ?? 0} in progress</div>
          </div>
          <div className="stat-card success">
            <div className="label">Completed</div>
            <div className="value">{stats?.completed ?? 0}</div>
            <div className="sub">of {stats?.total ?? 0} total</div>
          </div>
        </div>

        {/* Channel summary cards */}
        {channels.length > 0 && (
          <>
            <div className="section-title" style={{ marginBottom: 12 }}>Channel Activity</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16, marginBottom: 24 }}>
              {channels.map(ch => {
                const summary = getSummary(ch.slack_channel_id);
                return (
                  <div key={ch.id} className="summary-card">
                    <div className="summary-card-header">
                      <div>
                        <span style={{ fontWeight: 600 }}>#{ch.slack_channel_name}</span>
                        {!ch.is_active && <span className="text-muted text-sm"> (paused)</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span className={`badge badge-${ch.priority}`}>{ch.priority.toUpperCase()}</span>
                        {ch.channel_type && ch.channel_type !== 'work' && (
                          <span className={`badge type-${ch.channel_type}`}>{ch.channel_type}</span>
                        )}
                      </div>
                    </div>

                    {summary ? (
                      <div className="summary-card-body">
                        <p className="summary-text">{summary.summary_text}</p>

                        {summary.key_topics?.length > 0 && (
                          <div className="topic-pills">
                            {summary.key_topics.map((topic: string, i: number) => (
                              <span key={i} className="topic-pill">{topic}</span>
                            ))}
                          </div>
                        )}

                        <div className="summary-meta">
                          <span>👤 {summary.top_contributors?.slice(0, 3).join(', ') || '—'}</span>
                          <span>·</span>
                          <span>✅ {summary.task_count} tasks</span>
                          <span>·</span>
                          <span>🔗 {summary.link_count} links</span>
                        </div>
                      </div>
                    ) : (
                      <div className="summary-card-body" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                        No summary yet — poll the channel to generate one.
                      </div>
                    )}

                    <div className="summary-card-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Last polled: {relativeTime(ch.last_polled_at)}
                      </span>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 12, padding: '3px 10px' }}
                        onClick={() => handlePollChannel(ch.id, ch.slack_channel_name)}
                        disabled={pollingChannels.has(ch.id)}
                      >
                        {pollingChannels.has(ch.id) ? '⏳ Polling…' : '🔄 Poll'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Recent tasks */}
        <div style={{ display: 'grid', gridTemplateColumns: channels.length === 0 ? '1fr' : '1fr', gap: 20 }}>
          <div className="card">
            <div className="section-title">Recent Tasks</div>
            {recentTasks.length === 0 ? (
              <div className="empty-state">
                <div className="icon">✅</div>
                <p>No tasks yet. Poll channels to extract tasks.</p>
              </div>
            ) : (
              <div>
                {recentTasks.map(t => (
                  <div key={t.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="truncate" style={{ fontWeight: 500 }}>{t.title}</div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                          {t.assignee && <span className="text-sm text-muted">@{t.assignee}</span>}
                          {t.priority && t.priority !== 'medium' && (
                            <span className={`priority-badge priority-${t.priority}`} style={{ fontSize: 11 }}>
                              {t.priority === 'high' ? '🔴' : '🟢'} {t.priority}
                            </span>
                          )}
                          {t.due_date && <span className="text-sm text-muted">Due: {t.due_date}</span>}
                        </div>
                      </div>
                      <span className={`badge badge-${t.status}`} style={{ flexShrink: 0 }}>
                        {t.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Getting started */}
        {channels.length === 0 && (
          <div className="card mt-4" style={{ borderColor: 'var(--primary)', borderStyle: 'dashed' }}>
            <div className="section-title">🚀 Getting Started</div>
            <ol style={{ paddingLeft: 20, lineHeight: 2, color: 'var(--text-muted)' }}>
              <li>Copy <code style={{ fontFamily: 'monospace', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4 }}>.env.example</code> to <code style={{ fontFamily: 'monospace', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4 }}>.env</code> and fill in your credentials</li>
              <li>Go to <strong style={{ color: 'var(--text)' }}>Channels</strong> and add Slack channels to monitor</li>
              <li>Tag channels as <strong style={{ color: 'var(--text)' }}>Learning</strong> to capture articles into your Reading List</li>
              <li>The bot will automatically poll and extract tasks every 10–30 minutes</li>
              <li>Use <strong style={{ color: 'var(--text)' }}>Push to Slack</strong> to send daily updates to your channels</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
