import { Router } from 'express';

let _listChannelsFn: (() => Promise<Array<{ id: string; name: string }>>) | null = null;

export function setListChannelsFn(fn: typeof _listChannelsFn) {
  _listChannelsFn = fn;
}

const router = Router();

// GET /api/slack-channels — list all Slack channels the bot is in
router.get('/', async (_req, res) => {
  if (!_listChannelsFn) {
    return res.status(503).json({ error: 'Slack not connected' });
  }
  try {
    const channels = await _listChannelsFn();
    res.json(channels);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
