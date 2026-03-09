import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function PushToSlack() {
  const [channels, setChannels] = useState<any[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [previewChannel, setPreviewChannel] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [pollLoading, setPollLoading] = useState(false);

  useEffect(() => { api.channels.list().then(c => setChannels(c.filter((ch: any) => ch.is_active))); }, []);

  const toggleChannel = (id: string) => {
    setSelectedChannels(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const generateDigest = async () => {
    if (!previewChannel) return alert('Select a channel first');
    setGeneratingPreview(true);
    setPreviewText('');
    try {
      const { digest } = await api.digest.generate(previewChannel);
      setPreviewText(digest);
      setMessage(digest);
    } catch (e: any) {
      alert('Error generating digest: ' + e.message);
    } finally {
      setGeneratingPreview(false);
    }
  };

  const send = async () => {
    if (!message.trim()) return alert('Message cannot be empty');
    if (selectedChannels.length === 0) return alert('Select at least one channel');
    setSending(true);
    setResults([]);
    try {
      const { results: r } = await api.digest.push(message, selectedChannels);
      setResults(r);
    } catch (e: any) {
      alert('Error sending: ' + e.message);
    } finally {
      setSending(false);
    }
  };

  const pollNow = async () => {
    setPollLoading(true);
    try {
      await api.digest.poll();
      alert('Poll started! New tasks and links will be extracted from all channels shortly.');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setPollLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Push to Slack</h2>
        <p>Send daily updates, digests, or custom messages to monitored channels</p>
      </div>

      <div className="page-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 20 }}>
          {/* Left: Controls */}
          <div>
            {/* Poll trigger */}
            <div className="card mb-4">
              <div className="section-title">Manual Poll</div>
              <p className="text-muted text-sm" style={{ marginBottom: 12 }}>Force an immediate poll of all active channels to extract new tasks and links.</p>
              <button className="btn btn-secondary" onClick={pollNow} disabled={pollLoading}>
                {pollLoading ? <span className="spinner" /> : '🔄'} Poll All Channels Now
              </button>
            </div>

            {/* AI Digest generator */}
            <div className="card mb-4">
              <div className="section-title">Generate AI Digest</div>
              <p className="text-muted text-sm" style={{ marginBottom: 12 }}>Generate a smart digest summary for a channel using Claude AI.</p>
              <div className="form-group">
                <label>Channel</label>
                <select value={previewChannel} onChange={e => setPreviewChannel(e.target.value)}>
                  <option value="">Select channel</option>
                  {channels.map(c => <option key={c.slack_channel_id} value={c.slack_channel_id}>#{c.slack_channel_name}</option>)}
                </select>
              </div>
              <button className="btn btn-secondary" onClick={generateDigest} disabled={generatingPreview || !previewChannel}>
                {generatingPreview ? <><span className="spinner" /> Generating...</> : '✨ Generate Digest'}
              </button>
            </div>

            {/* Channel selection */}
            <div className="card">
              <div className="section-title">Select Target Channels</div>
              {channels.length === 0 ? (
                <div className="text-muted text-sm">No active channels. Add channels first.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {channels.map(c => (
                    <label key={c.slack_channel_id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 10px', borderRadius: 6, border: '1px solid', borderColor: selectedChannels.includes(c.slack_channel_id) ? 'var(--primary)' : 'var(--border)', background: selectedChannels.includes(c.slack_channel_id) ? 'var(--primary-dim)' : 'transparent', transition: 'all 0.15s' }}>
                      <input type="checkbox" checked={selectedChannels.includes(c.slack_channel_id)} onChange={() => toggleChannel(c.slack_channel_id)} style={{ width: 'auto' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500 }}>#{c.slack_channel_name}</div>
                        <span className={`badge badge-${c.priority}`} style={{ marginTop: 2 }}>{c.priority.toUpperCase()}</span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedChannels(channels.map(c => c.slack_channel_id))}>All</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedChannels([])}>None</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedChannels(channels.filter(c => c.priority === 'p0').map(c => c.slack_channel_id))}>P0 Only</button>
              </div>
            </div>
          </div>

          {/* Right: Message composer */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="section-title">Message</div>
            <div className="text-sm text-muted" style={{ marginBottom: 12 }}>
              Compose your update or use the generated digest above. Supports Slack markdown (*bold*, _italic_, `code`).
            </div>
            <textarea
              style={{ flex: 1, minHeight: 300, fontFamily: 'monospace', fontSize: 12 }}
              placeholder={`*📊 Daily Update*\n\n*Highlights:*\n• ...\n\n*Action Items:*\n• ...`}
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="text-muted text-sm">
                {selectedChannels.length === 0 ? 'No channels selected' : `Sending to ${selectedChannels.length} channel${selectedChannels.length > 1 ? 's' : ''}`}
              </div>
              <button
                className="btn btn-primary"
                onClick={send}
                disabled={sending || !message.trim() || selectedChannels.length === 0}
              >
                {sending ? <><span className="spinner" /> Sending...</> : '📤 Send to Slack'}
              </button>
            </div>

            {/* Results */}
            {results.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div className="text-sm text-muted" style={{ marginBottom: 8 }}>Results:</div>
                {results.map((r, i) => (
                  <div key={i} className={`alert ${r.success ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: 6 }}>
                    {r.success ? '✅' : '❌'} #{r.channel_name}{r.error ? ` — ${r.error}` : ' — Sent!'}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
