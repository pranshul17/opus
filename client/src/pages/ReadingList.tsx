import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

const CATEGORIES = ['article', 'tool', 'video', 'doc', 'other'];

const CAT_META: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
  article: { icon: '📄', label: 'Articles',  color: '#60a5fa', bg: 'rgba(74,144,226,0.1)',   border: 'rgba(74,144,226,0.25)' },
  tool:    { icon: '🔧', label: 'Tools',     color: '#a78bfa', bg: 'rgba(167,139,250,0.1)',  border: 'rgba(167,139,250,0.25)' },
  video:   { icon: '🎥', label: 'Videos',    color: '#f87171', bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.25)' },
  doc:     { icon: '📚', label: 'Docs',      color: '#34d399', bg: 'rgba(52,211,153,0.1)',   border: 'rgba(52,211,153,0.25)' },
  other:   { icon: '🔗', label: 'Links',     color: '#94a3b8', bg: 'rgba(148,163,184,0.1)',  border: 'rgba(148,163,184,0.2)' },
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
    const domain = new URL(url).origin;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch { return null; }
}

// Magazine card component
function MagCard({ link, channelName, onMarkRead, onNotes, onDelete, onSave, saving, featured = false }: {
  link: any; channelName: (id: string) => string;
  onMarkRead: (link: any, val: number) => void;
  onNotes: (link: any) => void;
  onDelete: (id: number) => void;
  onSave: (link: any) => void;
  saving: boolean;
  featured?: boolean;
}) {
  const meta = CAT_META[link.category || 'other'] || CAT_META.other;
  const favicon = getFaviconUrl(link.url);
  const domain = getDomain(link.url);
  const concepts: string[] = (() => { try { return JSON.parse(link.key_concepts || '[]'); } catch { return []; } })();

  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${link.is_read ? 'var(--border)' : link.is_saved ? 'rgba(251,191,36,0.4)' : meta.border}`,
      borderRadius: 12,
      overflow: 'hidden',
      opacity: link.is_read ? 0.55 : 1,
      transition: 'all 0.2s',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
    }}
      onMouseEnter={e => { if (!link.is_read) (e.currentTarget as HTMLElement).style.borderColor = link.is_saved ? 'rgba(251,191,36,0.7)' : meta.color; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = link.is_read ? 'var(--border)' : link.is_saved ? 'rgba(251,191,36,0.4)' : meta.border; }}
    >
      {/* Colour accent bar */}
      {!link.is_read && (
        <div style={{ height: 3, background: link.is_saved ? 'linear-gradient(90deg, #fbbf24, #f59e0b, transparent)' : `linear-gradient(90deg, ${meta.color}, transparent)` }} />
      )}

      {/* Saved badge */}
      {link.is_saved && (
        <div style={{
          position: 'absolute', top: 8, right: 8, zIndex: 2,
          background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.4)',
          borderRadius: 6, padding: '2px 6px', fontSize: 10, fontWeight: 700,
          color: '#fbbf24', letterSpacing: '0.05em',
        }}>
          ✦ SAVED
        </div>
      )}

      <div style={{ padding: featured ? '20px 22px' : '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Top row: category + read toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 4, padding: '2px 7px' }}>
            {meta.icon} {meta.label.replace(/s$/, '')}
          </span>
          <input
            type="checkbox"
            checked={!!link.is_read}
            onChange={e => onMarkRead(link, e.target.checked ? 1 : 0)}
            title={link.is_read ? 'Mark unread' : 'Mark as read'}
            style={{ accentColor: 'var(--primary)', cursor: 'pointer', width: 14, height: 14 }}
          />
        </div>

        {/* Title */}
        <a
          href={link.url}
          target="_blank"
          rel="noreferrer"
          style={{
            color: 'var(--text)',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: featured ? 17 : 14,
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: featured ? 3 : 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = meta.color}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text)'}
        >
          {link.title || link.url}
        </a>

        {/* Description */}
        {link.description && !link.summary && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0, display: '-webkit-box', WebkitLineClamp: featured ? 3 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {link.description}
          </p>
        )}

        {/* AI Summary */}
        {link.summary && (
          <div style={{
            fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0,
            background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)',
            borderRadius: 6, padding: '8px 10px',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', marginBottom: 4, letterSpacing: '0.05em' }}>✦ AI SUMMARY</div>
            <span style={{ display: '-webkit-box', WebkitLineClamp: featured ? 4 : 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {link.summary}
            </span>
          </div>
        )}

        {/* Key concepts */}
        {concepts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {concepts.slice(0, featured ? 8 : 4).map((c: string) => (
              <span key={c} style={{
                fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
                background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
                color: '#818cf8', letterSpacing: '0.03em',
              }}>
                {c}
              </span>
            ))}
          </div>
        )}

        {/* Notes */}
        {link.notes && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', cursor: 'pointer' }} onClick={() => onNotes(link)}>
            📝 {link.notes}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 'auto', paddingTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {favicon && <img src={favicon} alt="" width={12} height={12} style={{ borderRadius: 2, opacity: 0.8 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{domain}</span>
            {link.slack_channel_id && (
              <span style={{ fontSize: 10, color: 'var(--text-dim)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px' }}>
                #{channelName(link.slack_channel_id)}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{timeAgo(link.created_at)}</span>
            {/* Save to knowledge base */}
            <button
              className="btn btn-ghost btn-sm"
              style={{
                padding: '2px 6px', fontSize: 11,
                color: link.is_saved ? '#fbbf24' : 'var(--text-dim)',
                opacity: saving ? 0.6 : 1,
              }}
              onClick={() => !link.is_saved && onSave(link)}
              disabled={saving || link.is_saved}
              title={link.is_saved ? 'Saved to knowledge base' : 'Save + summarize with AI'}
            >
              {saving ? '⏳' : link.is_saved ? '✦' : '🔖'}
            </button>
            <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: 11 }} onClick={() => onNotes(link)} title="Notes">📝</button>
            <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: 11, color: 'var(--danger)' }} onClick={() => onDelete(link.id)} title="Remove">✕</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReadingList() {
  const [links, setLinks] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [filterChannel, setFilterChannel] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [filterRead, setFilterRead] = useState('unread');
  const [search, setSearch] = useState('');
  const [editingNotes, setEditingNotes] = useState<{ link: any; text: string } | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingLinks, setSavingLinks] = useState<Set<number>>(new Set());
  const navigate = useNavigate();

  const load = () => {
    const params: Record<string, string> = {};
    if (filterChannel) params.slack_channel_id = filterChannel;
    if (filterRead === 'unread') params.is_read = '0';
    else if (filterRead === 'read') params.is_read = '1';
    api.tasks.links(params).then(setLinks).catch(console.error);
  };

  useEffect(() => { load(); }, [filterChannel, filterRead]);
  useEffect(() => { api.channels.list().then(setChannels); }, []);

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

  // Category counts
  const catCounts = useMemo(() => {
    const counts: Record<string, number> = { all: links.length };
    for (const l of links) {
      const c = l.category || 'other';
      counts[c] = (counts[c] || 0) + 1;
    }
    return counts;
  }, [links]);

  const savedCount = links.filter(l => l.is_saved).length;
  const unreadTotal = links.filter(l => !l.is_read).length;
  const channelName = (id: string) => channels.find(c => c.slack_channel_id === id)?.slack_channel_name || id;

  const markRead = async (link: any, is_read: number) => {
    await api.tasks.updateLink(link.id, { is_read });
    load();
  };

  const saveNotes = async () => {
    if (!editingNotes) return;
    setSavingNotes(true);
    try {
      await api.tasks.updateLink(editingNotes.link.id, { notes: editingNotes.text });
      setEditingNotes(null);
      load();
    } finally { setSavingNotes(false); }
  };

  const del = async (id: number) => {
    if (!confirm('Remove this link?')) return;
    await api.tasks.deleteLink(id);
    load();
  };

  const markAllRead = async () => {
    const unread = filtered.filter(l => !l.is_read);
    for (const l of unread) await api.tasks.updateLink(l.id, { is_read: 1 });
    load();
  };

  const saveLink = async (link: any) => {
    setSavingLinks(prev => new Set(prev).add(link.id));
    try {
      await api.tasks.saveLink(link.id);
      load();
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSavingLinks(prev => { const s = new Set(prev); s.delete(link.id); return s; });
    }
  };

  const featured = filtered.find(l => !l.is_read) || filtered[0];
  const rest = featured ? filtered.filter(l => l.id !== featured.id) : filtered;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h2>Reading List</h2>
            <p>Articles, tools & resources captured from your channels</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {savedCount > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 12, color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.08)' }}
                onClick={() => navigate('/knowledge-graph')}
              >
                ✦ Knowledge Graph ({savedCount})
              </button>
            )}
            {unreadTotal > 0 && (
              <>
                <span className="unread-badge" style={{ fontSize: 13 }}>{unreadTotal} unread</span>
                <button className="btn btn-ghost btn-sm" onClick={markAllRead} style={{ fontSize: 12 }}>
                  ✓ Mark all read
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="page-body">

        {/* Category Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          {[{ key: 'all', icon: '✦', label: 'All' }, ...CATEGORIES.map(c => ({ key: c, icon: CAT_META[c].icon, label: CAT_META[c].label }))].map(tab => {
            const count = catCounts[tab.key] || 0;
            const isActive = activeTab === tab.key;
            const meta = CAT_META[tab.key] || { color: 'var(--text)', bg: 'var(--surface-2)', border: 'var(--border)' };
            return count > 0 || tab.key === 'all' ? (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  border: `1px solid ${isActive ? (tab.key === 'all' ? 'var(--primary)' : meta.border) : 'var(--border)'}`,
                  background: isActive ? (tab.key === 'all' ? 'var(--primary-dim)' : meta.bg) : 'transparent',
                  color: isActive ? (tab.key === 'all' ? 'var(--primary-hover)' : meta.color) : 'var(--text-muted)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s',
                }}
              >
                {tab.icon} {tab.label}
                {count > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, background: isActive ? (tab.key === 'all' ? 'rgba(99,102,241,0.3)' : `${meta.color}30`) : 'var(--surface-2)', color: isActive ? (tab.key === 'all' ? 'var(--primary-hover)' : meta.color) : 'var(--text-dim)', borderRadius: 8, padding: '0 5px', minWidth: 16, textAlign: 'center' }}>
                    {count}
                  </span>
                )}
              </button>
            ) : null;
          })}

          {/* Spacer + filters */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              className="search-input"
              placeholder="🔍 Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ minWidth: 160, maxWidth: 200 }}
            />
            <select className="filter-select" value={filterRead} onChange={e => setFilterRead(e.target.value)}>
              <option value="all">All</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
            </select>
            <select className="filter-select" value={filterChannel} onChange={e => setFilterChannel(e.target.value)}>
              <option value="">All Channels</option>
              {channels.map(c => <option key={c.slack_channel_id} value={c.slack_channel_id}>#{c.slack_channel_name}</option>)}
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="icon">📚</div>
              <p>
                {filterRead === 'unread'
                  ? '🎉 All caught up! No unread items.'
                  : 'No items found. Tag channels as "Learning" to start capturing resources.'}
              </p>
            </div>
          </div>
        ) : (
          <div>
            {/* Featured card + sidebar grid */}
            {featured && (
              <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 14, marginBottom: 14 }}>
                <MagCard link={featured} channelName={channelName} onMarkRead={markRead} onNotes={l => setEditingNotes({ link: l, text: l.notes || '' })} onDelete={del} onSave={saveLink} saving={savingLinks.has(featured.id)} featured />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {rest.slice(0, 2).map(l => (
                    <MagCard key={l.id} link={l} channelName={channelName} onMarkRead={markRead} onNotes={link => setEditingNotes({ link, text: link.notes || '' })} onDelete={del} onSave={saveLink} saving={savingLinks.has(l.id)} />
                  ))}
                </div>
              </div>
            )}

            {/* Grid of remaining cards */}
            {rest.length > 2 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                {rest.slice(2).map(l => (
                  <MagCard key={l.id} link={l} channelName={channelName} onMarkRead={markRead} onNotes={link => setEditingNotes({ link, text: link.notes || '' })} onDelete={del} onSave={saveLink} saving={savingLinks.has(l.id)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Notes Modal */}
      {editingNotes && (
        <div className="modal-overlay" onClick={() => setEditingNotes(null)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📝 Notes</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingNotes(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, color: 'var(--text-muted)' }}>
                {editingNotes.link.title || editingNotes.link.url}
              </div>
              <textarea
                value={editingNotes.text}
                onChange={e => setEditingNotes(n => n ? { ...n, text: e.target.value } : null)}
                rows={4}
                placeholder="Add your notes, thoughts, or key takeaways..."
                autoFocus
                style={{ width: '100%' }}
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditingNotes(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveNotes} disabled={savingNotes}>
                {savingNotes ? <span className="spinner" /> : '💾 Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
