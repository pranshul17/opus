import { Router } from 'express';
import { mentionQueries } from '../db/database';

const router = Router();

// GET /api/mentions — list mentions (supports ?is_read=0&slack_channel_id=C123)
router.get('/', (req, res) => {
  try {
    const { is_read, slack_channel_id } = req.query as Record<string, string>;
    const filters: { is_read?: number; slack_channel_id?: string } = {};
    if (is_read !== undefined) filters.is_read = parseInt(is_read, 10);
    if (slack_channel_id) filters.slack_channel_id = slack_channel_id;
    res.json(mentionQueries.getAll(filters));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mentions/unread-count
router.get('/unread-count', (_req, res) => {
  try {
    res.json({ count: mentionQueries.getUnreadCount() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/mentions/:id — mark as read (body: { is_read: 1 })
router.put('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (req.body.is_read === 1 || req.body.is_read === true) {
      mentionQueries.markRead(id);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mentions/read-all — mark all mentions as read
router.post('/read-all', (_req, res) => {
  try {
    mentionQueries.markAllRead();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/mentions/:id
router.delete('/:id', (req, res) => {
  try {
    mentionQueries.delete(parseInt(req.params.id, 10));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
