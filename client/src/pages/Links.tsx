import { useEffect, useState, useMemo } from 'react';
import { api } from '../api/client';

const CAT_META: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
  article: { icon: '📄', label: 'Article',  color: '#60a5fa', bg: 'rgba(74,144,226,0.1)',   border: 'rgba(74,144,226,0.25)' },
  tool:    { icon: '🔧', label: 'Tool',     color: '#a78bfa', bg: 'rgba(167,139,250,0.1)',  border: 'rgba(167,139,250,0.25)' },
  video:   { icon: '🎥', label: 'Video',    color: '#f87171', bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.25)' },
  doc:     { icon: '📚', label: 'Doc',      color: '#34d399', bg: 'rgba(52,211,153,0.1)',   border: 'rgba(52,211,153,0.25)' },
  other:   { icon: '🔗', label: 'Link',     color: '#94a3b8', bg: 'rgba(148,163,184,0.1)',  border: 'rgba(148,163,184,0.2)' },
};

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getDomain(url: string) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

function getFaviconUrl(url: string) {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).origin}&sz=32`;
  } catch { return null; }
}

export default function Links() {
  const [links, setLinks] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [filterChannel, setFilterChannel] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  const load = () => {
    const params: Record<string, string> = {};
    if (filterChannel) params.slack_channel_id = filterChannel;
    api.tasks.links(params).then(setLinks).catch(console.error);
  };

  useEffect(() => { load(); }, [filterChannel]);
  useEffect(() => { api.channels.list().then(setChannels); }, []);

  const del = async (id: number) => {
    if (!confirm('Remove this link?')) return;
    await api.tasks.deleteLink(id);
    load();
  };

  const channelName = (id: string) => channels.find(c => c.slack_channel_id === id)?.slack_channel_name || id;

  const filtered = useMemo(() => {
    let result = links;
    if (activeTab !== 'all') result = result.filter(l => (l.category || 'other') === activeTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(l =>
        l.url?.toLowerCase().includes(q) ||
        l.title?.toLowerCase().includes(q) ||
        l.description?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [links, activeTab, search]);

  const catCounts = useMemo(() => {
    const counts: Record<string, number> = { all: links.length };
    for (const l of links) {
      const c = l.category || 'other';
      counts[c] = (counts[c] || 0) + 1;
    }
    return counts;
  }, [links]);

  const TABS = [
    { key: 'all', icon: '✦', label: 'All' },
    ...Object.entries(CAT_META).map(([key, m]) => ({ key, icon: m.icon, label: `${m.label}s` }))
  ];

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h2>Links</h2>
            <p>All URLs extracted from monitored channels</p>
          </div>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{links.length} link{links.length !== 1 ? 's' : ''} captured</span>
        </div>
      </div>

      <div className="page-body">
        {/* Tabs + filters */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          {TABS.map(tab => {
            const count = catCounts[tab.key] || 0;
            const isActive = activeTab === tab.key;
            const meta = CAT_META[tab.key];
            return (count > 0 || tab.key === 'all') ? (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  border: `1px solid ${isActive ? (meta ? meta.border : 'var(--primary)') : 'var(--border)'}`,
                  background: isActive ? (meta ? meta.bg : 'var(--primary-dim)') : 'transparent',
                  color: isActive ? (meta ? meta.color : 'var(--primary-hover)') : 'var(--text-muted)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s',
                }}
              >
                {tab.icon} {tab.label}
                {count > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--surface-2)', color: 'var(--text-dim)', borderRadius: 8, padding: '0 5px' }}>
                    {count}
                  </span>
                )}
              </button>
            ) : null;
          })}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <input
              className="search-input"
              placeholder="🔍 Search links..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ minWidth: 160, maxWidth: 220 }}
            />
            <select className="filter-select" value={filterChannel} onChange={e => setFilterChannel(e.target.value)}>
              <option value="">All Channels</option>
              {channels.map(c => <option key={c.slack_channel_id} value={c.slack_channel_id}>#{c.slack_channel_name}</option>)}
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="icon">🔗</div>
              <p>No links captured yet. Links are extracted when channels are polled.</p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {filtered.map(l => {
              const meta = CAT_META[l.category || 'other'] || CAT_META.other;
              const favicon = getFaviconUrl(l.url);
              const domain = getDomain(l.url);
              return (
                <div
                  key={l.id}
                  style={{ background: 'var(--surface)', border: `1px solid ${meta.border}`, borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.15s, transform 0.15s', display: 'flex', flexDirection: 'column' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = meta.color; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = meta.border; (e.currentTarget as HTMLElement).style.transform = 'none'; }}
                >
                  <div style={{ height: 2, background: `linear-gradient(90deg, ${meta.color}, transparent)` }} />
                  <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {/* Category badge */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 4, padding: '2px 6px' }}>
                        {meta.icon} {meta.label}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{timeAgo(l.created_at)}</span>
                    </div>

                    {/* Title */}
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 600, fontSize: 13.5, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                    >
                      {l.title || l.url}
                    </a>

                    {/* Description */}
                    {l.description && (
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {l.description}
                      </p>
                    )}

                    {/* Footer */}
                    <div style={{ marginTop: 'auto', paddingTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {favicon && <img src={favicon} alt="" width={12} height={12} style={{ borderRadius: 2, opacity: 0.7 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{domain}</span>
                        {l.slack_channel_id && (
                          <span style={{ fontSize: 10, color: 'var(--text-dim)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px' }}>
                            #{channelName(l.slack_channel_id)}
                          </span>
                        )}
                      </div>
                      <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: 11, color: 'var(--danger)' }} onClick={() => del(l.id)}>✕</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
