import { Router } from 'express';
import { channelQueries, summaryQueries } from '../db/database';
import { refreshDigestSchedules, refreshPollingSchedules } from '../services/scheduler';
import { processChannel } from '../services/channel-monitor';

const router = Router();

// GET /api/channels
router.get('/', (_req, res) => {
  try {
    res.json(channelQueries.getAll());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/channels/:id/summary
router.get('/:id/summary', (req, res) => {
  try {
    const channel = channelQueries.getById(parseInt(req.params.id));
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const summary = summaryQueries.getLatest(channel.slack_channel_id);
    if (!summary) return res.json(null);
    res.json({
      ...summary,
      key_topics: JSON.parse(summary.key_topics),
      top_contributors: JSON.parse(summary.top_contributors),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/channels/summaries — all latest summaries
router.get('/summaries/all', (_req, res) => {
  try {
    const summaries = summaryQueries.getAll();
    res.json(summaries.map(s => ({
      ...s,
      key_topics: JSON.parse(s.key_topics),
      top_contributors: JSON.parse(s.top_contributors),
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/channels
router.post('/', (req, res) => {
  const { slack_channel_id, slack_channel_name, priority, channel_type, digest_enabled, digest_schedule, history_hours, poll_interval } = req.body;
  if (!slack_channel_id || !slack_channel_name || !priority) {
    return res.status(400).json({ error: 'slack_channel_id, slack_channel_name, and priority are required' });
  }
  if (!['p0', 'p1'].includes(priority)) {
    return res.status(400).json({ error: 'priority must be p0 or p1' });
  }

  try {
    const channel = channelQueries.create({
      slack_channel_id,
      slack_channel_name,
      priority,
      channel_type: channel_type || 'work',
      is_active: 1,
      digest_enabled: digest_enabled !== false ? 1 : 0,
      digest_schedule: digest_schedule || '0 9 * * 1',
      history_hours: history_hours ? parseInt(history_hours) : null,
      poll_interval: poll_interval ? parseInt(poll_interval) : null,
      last_polled_at: null,
    });
    refreshDigestSchedules();
    refreshPollingSchedules();
    res.status(201).json(channel);
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Channel already tracked' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/channels/:id
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const allowed = ['slack_channel_name', 'priority', 'channel_type', 'is_active', 'digest_enabled', 'digest_schedule', 'history_hours', 'poll_interval'];
  const updates: Record<string, any> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (updates.history_hours !== undefined) {
    updates.history_hours = updates.history_hours === '' || updates.history_hours === null ? null : parseInt(updates.history_hours);
  }
  if (updates.poll_interval !== undefined) {
    updates.poll_interval = updates.poll_interval === '' || updates.poll_interval === null ? null : parseInt(updates.poll_interval);
  }

  try {
    const channel = channelQueries.update(id, updates);
    refreshDigestSchedules();
    refreshPollingSchedules();
    res.json(channel);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/channels/:id/poll — manually poll a single channel now
router.post('/:id/poll', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const channel = channelQueries.getById(id);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    // Run in background
    processChannel(channel).catch(err => console.error(`[Channels Route] Poll error for #${channel.slack_channel_name}:`, err));
    res.json({ message: `Poll started for #${channel.slack_channel_name}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/channels/:id
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  try {
    channelQueries.delete(id);
    refreshDigestSchedules();
    refreshPollingSchedules();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
