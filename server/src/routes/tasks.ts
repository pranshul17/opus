import { Router } from 'express';
import { taskQueries, linkQueries, taskUpdateQueries } from '../db/database';
import { summarizeArticle } from '../services/claude';

const router = Router();

// GET /api/tasks — list tasks (with optional filters + sort)
router.get('/', (req, res) => {
  try {
    const { status, slack_channel_id, priority, source_type, assignee, sort } = req.query as Record<string, string>;
    const tasks = taskQueries.getAll({ status, slack_channel_id, priority, source_type, assignee, sort });
    res.json(tasks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasks/stats
router.get('/stats', (_req, res) => {
  try {
    res.json(taskQueries.getStats());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasks/links/graph — knowledge graph data (saved articles + their concepts)
router.get('/links/graph', (_req, res) => {
  try {
    const saved = linkQueries.getSaved();

    const nodes: any[] = [];
    const edges: any[] = [];
    const conceptMap = new Map<string, { count: number; links: number[] }>();

    for (const link of saved) {
      const concepts: string[] = (() => {
        try { return JSON.parse(link.key_concepts || '[]'); } catch { return []; }
      })();

      nodes.push({
        id: `article_${link.id}`,
        type: 'article',
        label: link.title || new URL(link.url).hostname,
        url: link.url,
        summary: link.summary,
        category: link.category,
        key_concepts: concepts,
        domain: (() => { try { return new URL(link.url).hostname.replace('www.', ''); } catch { return link.url; } })(),
        created_at: link.created_at,
        slack_channel_id: link.slack_channel_id,
      });

      for (const concept of concepts) {
        if (!conceptMap.has(concept)) conceptMap.set(concept, { count: 0, links: [] });
        const c = conceptMap.get(concept)!;
        c.count++;
        c.links.push(link.id);
        edges.push({ source: `article_${link.id}`, target: `concept_${concept}` });
      }
    }

    for (const [concept, data] of conceptMap.entries()) {
      nodes.push({
        id: `concept_${concept}`,
        type: 'concept',
        label: concept,
        count: data.count,
        article_ids: data.links,
      });
    }

    res.json({ nodes, edges });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasks/links/all — list captured links
router.get('/links/all', (req, res) => {
  try {
    const { slack_channel_id, is_read, category } = req.query as Record<string, string>;
    res.json(linkQueries.getAll({
      slack_channel_id,
      is_read: is_read !== undefined ? parseInt(is_read) : undefined,
      category,
    }));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tasks/links/:id
router.delete('/links/:id', (req, res) => {
  try {
    linkQueries.delete(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/tasks/links/:id — update link (is_read, notes, category)
router.put('/links/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const allowed = ['is_read', 'notes', 'category', 'title', 'description', 'is_saved', 'summary', 'key_concepts'] as const;
    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    res.json(linkQueries.update(id, updates));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tasks/links/:id/save — AI summarize + save to knowledge base
router.post('/links/:id/save', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const link = linkQueries.getById(id);
    if (!link) return res.status(404).json({ error: 'Link not found' });

    // Already saved — just return it
    if (link.is_saved) return res.json(link);

    console.log(`[Tasks] Summarizing article: ${link.title || link.url}`);
    const result = await summarizeArticle(link.url, link.title, link.description);

    const updated = linkQueries.update(id, {
      is_saved: 1,
      summary: result.summary,
      key_concepts: JSON.stringify(result.key_concepts),
    });
    res.json(updated);
  } catch (err: any) {
    console.error('[Tasks] Error saving article:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasks/:id
router.get('/:id', (req, res) => {
  const task = taskQueries.getById(parseInt(req.params.id));
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

// POST /api/tasks — create a task manually
router.post('/', (req, res) => {
  const { title, description, slack_channel_id, assignee, due_date, status, priority, task_category, source_message, source_ts, template_id } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  try {
    const task = taskQueries.create({
      title,
      description: description ?? null,
      slack_channel_id: slack_channel_id ?? null,
      assignee: assignee ?? null,
      due_date: due_date ?? null,
      status: status || 'open',
      priority: priority || 'medium',
      task_category: task_category || 'action_item',
      source_type: 'manual',
      source_message: source_message ?? null,
      source_ts: source_ts ?? null,
      template_id: template_id ?? null,
    });
    res.status(201).json(task);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/tasks/:id — update a task
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const allowed = ['title', 'description', 'assignee', 'due_date', 'status', 'priority', 'task_category', 'slack_channel_id', 'blocker'];
  const updates: Record<string, any> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  try {
    const prevTask = taskQueries.getById(id);
    const updated = taskQueries.update(id, updates);

    // Auto-log status changes
    if (prevTask && updates.status && updates.status !== prevTask.status) {
      taskUpdateQueries.create({
        task_id: id,
        author: null,
        content: `Status changed from **${prevTask.status.replace('_', ' ')}** → **${updates.status.replace('_', ' ')}**`,
        update_type: 'status_change',
      });
    }
    // Auto-log blocker changes
    if (prevTask && updates.blocker !== undefined) {
      if (updates.blocker && !prevTask.blocker) {
        taskUpdateQueries.create({ task_id: id, author: null, content: `🚫 Blocker added: ${updates.blocker}`, update_type: 'blocker' });
      } else if (!updates.blocker && prevTask.blocker) {
        taskUpdateQueries.create({ task_id: id, author: null, content: `✅ Blocker resolved`, update_type: 'unblocked' });
      } else if (updates.blocker && prevTask.blocker && updates.blocker !== prevTask.blocker) {
        taskUpdateQueries.create({ task_id: id, author: null, content: `🚫 Blocker updated: ${updates.blocker}`, update_type: 'blocker' });
      }
    }

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasks/:id/updates
router.get('/:id/updates', (req, res) => {
  try {
    res.json(taskUpdateQueries.getByTaskId(parseInt(req.params.id)));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tasks/:id/updates
router.post('/:id/updates', (req, res) => {
  const { content, author, update_type } = req.body;
  if (!content) return res.status(400).json({ error: 'content is required' });
  try {
    const update = taskUpdateQueries.create({
      task_id: parseInt(req.params.id),
      author: author || null,
      content,
      update_type: update_type || 'comment',
    });
    res.status(201).json(update);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tasks/updates/:updateId
router.delete('/updates/:updateId', (req, res) => {
  try {
    taskUpdateQueries.delete(parseInt(req.params.updateId));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tasks/bulk — bulk operations
router.post('/bulk', (req, res) => {
  const { ids, action, status } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array is required' });
  }

  try {
    if (action === 'delete') {
      taskQueries.bulkDelete(ids);
      res.json({ success: true, affected: ids.length });
    } else if (action === 'status' && status) {
      taskQueries.bulkUpdateStatus(ids, status);
      res.json({ success: true, affected: ids.length });
    } else {
      res.status(400).json({ error: 'action must be "delete" or "status"' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', (req, res) => {
  try {
    taskQueries.delete(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
