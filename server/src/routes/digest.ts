import { Router, Request, Response } from 'express';
import { channelQueries, taskQueries, digestQueries } from '../db/database';
import { triggerManualDigest } from '../services/scheduler';
import { processAllChannels } from '../services/channel-monitor';

let _slackPostFn: ((channelId: string, text: string) => Promise<string | undefined>) | null = null;

export function setDigestSlackPostFn(fn: typeof _slackPostFn) {
  _slackPostFn = fn;
}

const router = Router();

// POST /api/digest/push — push a custom message to one or more channels
router.post('/push', async (req: Request, res: Response) => {
  const { message, channel_ids } = req.body;
  if (!message || !channel_ids?.length) {
    return res.status(400).json({ error: 'message and channel_ids are required' });
  }
  if (!_slackPostFn) {
    return res.status(503).json({ error: 'Slack not connected' });
  }

  const results: Array<{ channel_id: string; channel_name: string; success: boolean; error?: string }> = [];

  for (const channelId of channel_ids) {
    const channel = channelQueries.getBySlackId(channelId);
    if (!channel) {
      results.push({ channel_id: channelId, channel_name: channelId, success: false, error: 'Channel not tracked' });
      continue;
    }

    try {
      const ts = await _slackPostFn(channelId, message);
      digestQueries.save(channelId, message, ts);
      results.push({ channel_id: channelId, channel_name: channel.slack_channel_name, success: true });
    } catch (err: any) {
      results.push({ channel_id: channelId, channel_name: channel.slack_channel_name, success: false, error: err.message });
    }
  }

  res.json({ results });
});

// POST /api/digest/generate — generate (but don't send) a digest for a channel
router.post('/generate', async (req: Request, res: Response) => {
  const { slack_channel_id } = req.body;
  if (!slack_channel_id) return res.status(400).json({ error: 'slack_channel_id is required' });

  try {
    const digest = await triggerManualDigest(slack_channel_id);
    res.json({ digest });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/digest/send — generate and send a digest for a channel
router.post('/send', async (req: Request, res: Response) => {
  const { slack_channel_id } = req.body;
  if (!slack_channel_id) return res.status(400).json({ error: 'slack_channel_id is required' });
  if (!_slackPostFn) return res.status(503).json({ error: 'Slack not connected' });

  const channel = channelQueries.getBySlackId(slack_channel_id);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });

  try {
    const digest = await triggerManualDigest(slack_channel_id);
    const ts = await _slackPostFn(slack_channel_id, digest);
    digestQueries.save(slack_channel_id, digest, ts);
    res.json({ digest, ts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/digest/poll — manually trigger a channel poll now
router.post('/poll', async (_req: Request, res: Response) => {
  try {
    // Run in background
    processAllChannels().catch(err => console.error('[Digest Route] Poll error:', err));
    res.json({ message: 'Poll started' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/digest/history/:channelId — get digest history
router.get('/history/:channelId', (req: Request, res: Response) => {
  try {
    const history = digestQueries.getRecent(req.params.channelId, 20);
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
